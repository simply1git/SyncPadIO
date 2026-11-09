import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

interface RoomLifecycleOptions {
  roomId: string;
  userId: string;
  onRoomDeleted?: () => void;
  inactivityTimeoutMs?: number;
}

export const DEFAULT_EPHEMERAL_TIMEOUT_MS = 60 * 60 * 1000; // 1 Hour Default Ephemeral Inactivity
export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000; // 24 Hours Safe Extended TTL
const ACTIVITY_THROTTLE_MS = 60_000; // Throttle DB updates to once per 60s max

/**
 * Manages room lifecycle:
 * - Resets local inactivity timer on real user activity
 * - Throttles Supabase DB last_activity updates to at most once per 60 seconds
 * - Deletes room on inactivity timeout
 */
export const useRoomLifecycle = ({
  roomId,
  userId: _userId,
  onRoomDeleted,
  inactivityTimeoutMs = DEFAULT_EPHEMERAL_TIMEOUT_MS,
}: RoomLifecycleOptions) => {
  const onRoomDeletedRef = useRef(onRoomDeleted);
  const roomIdRef = useRef(roomId);
  const timeoutMsRef = useRef(inactivityTimeoutMs);
  const lastDbUpdateRef = useRef<number>(0);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDeletingRef = useRef<boolean>(false);

  useEffect(() => {
    onRoomDeletedRef.current = onRoomDeleted;
    roomIdRef.current = roomId;
    timeoutMsRef.current = inactivityTimeoutMs;
  });

  // ── deleteRoom ─────────────────────────────────────────────────────────
  const deleteRoom = useCallback(async () => {
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId || isDeletingRef.current) return;
    isDeletingRef.current = true;
    try {
      // 1. Clean up storage files first
      const { data: files } = await supabase
        .from('files')
        .select('storage_path')
        .eq('room_id', currentRoomId);

      if (files?.length) {
        await supabase.storage.from('uploads').remove(files.map(f => f.storage_path));
      }

      // 2. Delete room from database (cascades to snippets and files table)
      const { error } = await supabase.from('rooms').delete().eq('id', currentRoomId);
      if (!error) {
        if (import.meta.env.DEV) console.log(`[Room] Successfully deleted room: ${currentRoomId}`);
        onRoomDeletedRef.current?.();
      }
    } catch (err) {
      console.error('[Room] Failed to delete room:', err);
    } finally {
      isDeletingRef.current = false;
    }
  }, []);

  // ── updateLastActivity ─────────────────────────────────────────────────
  const updateLastActivity = useCallback(async (force = false) => {
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId) return;
    const now = Date.now();

    // Reset inactivity cleanup timer on any activity
    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    activityTimerRef.current = setTimeout(() => {
      if (import.meta.env.DEV) console.log(`[Room] Inactivity timeout — deleting room: ${currentRoomId}`);
      deleteRoom();
    }, timeoutMsRef.current);

    // Only hit Supabase DB if forced or if 60s have elapsed since last write
    if (force || now - lastDbUpdateRef.current >= ACTIVITY_THROTTLE_MS) {
      lastDbUpdateRef.current = now;
      try {
        await supabase.from('rooms').update({ last_activity: now }).eq('id', currentRoomId);
      } catch (err) {
        console.warn('[Room] Failed to update activity:', err);
      }
    }
  }, [deleteRoom]);

  // ── Start / Reset Timer when roomId or inactivityTimeoutMs changes ─────
  useEffect(() => {
    if (!roomId) {
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      return;
    }

    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    activityTimerRef.current = setTimeout(() => {
      deleteRoom();
    }, inactivityTimeoutMs);

    return () => {
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    };
  }, [roomId, inactivityTimeoutMs, deleteRoom]);

  // ── Effect: user activity listeners (Throttled, NO mousemove) ─────────
  useEffect(() => {
    if (!roomId) return;

    const onActivity = () => updateLastActivity(false);

    window.addEventListener('keydown', onActivity, { passive: true });
    window.addEventListener('click', onActivity, { passive: true });
    window.addEventListener('touchstart', onActivity, { passive: true });

    return () => {
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('click', onActivity);
      window.removeEventListener('touchstart', onActivity);
    };
  }, [roomId, updateLastActivity]);

  return { updateLastActivity, deleteRoom };
};
