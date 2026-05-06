import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

interface RoomLifecycleOptions {
  roomId: string;
  userId: string;
  onRoomDeleted?: () => void;
  inactivityTimeoutMs?: number;
}

/**
 * Manages room lifecycle:
 * - Atomic upsert on join (race-safe with React StrictMode)
 * - Updates last_activity timestamp + inactivity timeout
 * - Subscribes to external room deletion events
 * - Triggers onRoomDeleted when another client deletes the room
 *
 * NOTE: user_count tracking removed — now handled via Supabase Presence
 * in App.tsx (accurate multi-device count without DB race conditions).
 */
export const useRoomLifecycle = ({
  roomId,
  userId: _userId,
  onRoomDeleted,
  inactivityTimeoutMs = 60 * 60 * 1000,
}: RoomLifecycleOptions) => {
  // Store callback in ref — prevents cascade rebuild on every App render
  // (inline arrow fn prop → new ref every render → deps change → effect fires → room deleted)
  const onRoomDeletedRef = useRef(onRoomDeleted);
  useEffect(() => { onRoomDeletedRef.current = onRoomDeleted; });

  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitializedRef = useRef(false);

  // ── deleteRoom ─────────────────────────────────────────────────────────
  const deleteRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      // Clean up storage files first
      const { data: files } = await supabase
        .from('files').select('storage_path').eq('room_id', roomId);
      if (files?.length) {
        await supabase.storage.from('uploads').remove(files.map(f => f.storage_path));
      }
      const { error } = await supabase.from('rooms').delete().eq('id', roomId);
      if (!error) {
        console.log(`[Room] Successfully deleted room: ${roomId}`);
        onRoomDeletedRef.current?.();
      }
    } catch (err) {
      console.error('[Room] Failed to delete room:', err);
    }
  }, [roomId]);

  // ── initializeRoom ─────────────────────────────────────────────────────
  const initializeRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      const now = Date.now();
      const { error } = await supabase.from('rooms').upsert(
        { id: roomId, created_at: now, last_activity: now, user_count: 1, status: 'active' },
        { onConflict: 'id', ignoreDuplicates: true }
      );
      if (error) { console.error('[Room] Init error:', error); return; }

      // Always refresh activity for returning visitors
      await supabase.from('rooms')
        .update({ last_activity: now, status: 'active' }).eq('id', roomId);

      hasInitializedRef.current = true;
      console.log(`[Room] Room ${roomId} initialized`);
    } catch (err) {
      console.error('[Room] Failed to initialize:', err);
    }
  }, [roomId]);

  // ── updateLastActivity ─────────────────────────────────────────────────
  const updateLastActivity = useCallback(async () => {
    if (!roomId) return;
    try {
      await supabase.from('rooms').update({ last_activity: Date.now() }).eq('id', roomId);
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      activityTimerRef.current = setTimeout(() => {
        console.log(`[Room] Inactivity timeout — deleting room: ${roomId}`);
        deleteRoom();
      }, inactivityTimeoutMs);
    } catch (err) {
      console.error('[Room] Failed to update activity:', err);
    }
  }, [roomId, inactivityTimeoutMs, deleteRoom]);

  // ── Effect: init + subscribe ───────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    hasInitializedRef.current = false;

    initializeRoom();
    updateLastActivity();

    const sub = supabase
      .channel(`lifecycle:${roomId}`)
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => {
          console.log(`[Room] Room ${roomId} deleted externally`);
          onRoomDeletedRef.current?.();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [roomId, initializeRoom, updateLastActivity]);

  // ── Effect: activity listeners ─────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    const onActivity = () => updateLastActivity();
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('keypress', onActivity);
    window.addEventListener('click', onActivity);
    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keypress', onActivity);
      window.removeEventListener('click', onActivity);
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    };
  }, [roomId, updateLastActivity]);

  return { updateLastActivity, deleteRoom, initializeRoom };
};
