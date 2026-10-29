import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

interface RoomLifecycleOptions {
  roomId: string;
  userId: string;
  onRoomDeleted?: () => void;
  inactivityTimeoutMs?: number;
}

const ACTIVITY_THROTTLE_MS = 60_000; // Throttle DB updates to once per 60s max

/**
 * Manages room lifecycle:
 * - Upserts room on initial join
 * - Throttles DB updates to prevent network/connection exhaustion
 * - Manages auto-expiration timeout
 * - Subscribes to external deletion events
 */
export const useRoomLifecycle = ({
  roomId,
  userId: _userId,
  onRoomDeleted,
  inactivityTimeoutMs = 60 * 60 * 1000, // 1 hour default
}: RoomLifecycleOptions) => {
  const onRoomDeletedRef = useRef(onRoomDeleted);
  useEffect(() => { onRoomDeletedRef.current = onRoomDeleted; });

  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDbUpdateRef = useRef<number>(0);
  const isDeletingRef = useRef<boolean>(false);

  // ── deleteRoom ─────────────────────────────────────────────────────────
  const deleteRoom = useCallback(async () => {
    if (!roomId || isDeletingRef.current) return;
    isDeletingRef.current = true;
    try {
      // 1. Clean up storage files first
      const { data: files } = await supabase
        .from('files')
        .select('storage_path')
        .eq('room_id', roomId);

      if (files?.length) {
        await supabase.storage.from('uploads').remove(files.map(f => f.storage_path));
      }

      // 2. Delete room from database (cascades to snippets and files table)
      const { error } = await supabase.from('rooms').delete().eq('id', roomId);
      if (!error) {
        if (import.meta.env.DEV) console.log(`[Room] Successfully deleted room: ${roomId}`);
        onRoomDeletedRef.current?.();
      }
    } catch (err) {
      console.error('[Room] Failed to delete room:', err);
    } finally {
      isDeletingRef.current = false;
    }
  }, [roomId]);

  // ── updateLastActivity ─────────────────────────────────────────────────
  const updateLastActivity = useCallback(async (force = false) => {
    if (!roomId) return;
    const now = Date.now();

    // Reset inactivity cleanup timer on any activity
    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    activityTimerRef.current = setTimeout(() => {
      if (import.meta.env.DEV) console.log(`[Room] Inactivity timeout — deleting room: ${roomId}`);
      deleteRoom();
    }, inactivityTimeoutMs);

    // Only hit Supabase DB if forced or if 60s have elapsed since last write
    if (force || now - lastDbUpdateRef.current >= ACTIVITY_THROTTLE_MS) {
      lastDbUpdateRef.current = now;
      try {
        await supabase.from('rooms').update({ last_activity: now }).eq('id', roomId);
      } catch (err) {
        console.warn('[Room] Failed to update activity:', err);
      }
    }
  }, [roomId, inactivityTimeoutMs, deleteRoom]);

  // ── initializeRoom ─────────────────────────────────────────────────────
  const initializeRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      const now = Date.now();
      await supabase.from('rooms').upsert(
        { id: roomId, created_at: now, last_activity: now, status: 'active' },
        { onConflict: 'id', ignoreDuplicates: true }
      );
      lastDbUpdateRef.current = now;
      if (import.meta.env.DEV) console.log(`[Room] Room ${roomId} initialized`);
    } catch (err) {
      console.error('[Room] Failed to initialize:', err);
    }
  }, [roomId]);

  // ── Effect: init + subscribe to external deletions ─────────────────────
  useEffect(() => {
    if (!roomId) return;

    initializeRoom();
    updateLastActivity(true);

    const sub = supabase
      .channel(`lifecycle:${roomId}`)
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => {
          if (import.meta.env.DEV) console.log(`[Room] Room ${roomId} deleted externally`);
          onRoomDeletedRef.current?.();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    };
  }, [roomId, initializeRoom, updateLastActivity]);

  // ── Effect: user activity listeners (Debounced & throttled, NO mousemove) ─
  useEffect(() => {
    if (!roomId) return;

    const onActivity = () => updateLastActivity(false);

    // Only listen for real interaction events, not mousemove
    window.addEventListener('keydown', onActivity, { passive: true });
    window.addEventListener('click', onActivity, { passive: true });
    window.addEventListener('touchstart', onActivity, { passive: true });

    return () => {
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('click', onActivity);
      window.removeEventListener('touchstart', onActivity);
    };
  }, [roomId, updateLastActivity]);

  return { updateLastActivity, deleteRoom, initializeRoom };
};
