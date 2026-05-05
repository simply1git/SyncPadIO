import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

interface RoomLifecycleOptions {
  roomId: string;
  userId: string;
  onRoomDeleted?: () => void;
  inactivityTimeoutMs?: number; // Default: 1 hour
}

/**
 * Manages room lifecycle:
 * - Creates room when user joins (atomic upsert, race-safe)
 * - Tracks user presence (join/leave) with a grace period on empty
 * - Updates last activity timestamp
 * - Cleans up empty/inactive rooms
 * - Cascade deletes files when room is deleted
 *
 * ARCHITECTURE NOTE:
 * `onRoomDeleted` is stored in a ref (onRoomDeletedRef) and intentionally
 * excluded from all useCallback dep arrays. This breaks the cascade:
 *
 *   App re-renders → new onRoomDeleted ref → deleteRoom rebuilds →
 *   leaveRoom rebuilds → cleanup effect fires → room self-deletes  ← BUG
 *
 * With the ref pattern, deleteRoom/leaveRoom are stable across renders
 * and only rebuild when roomId actually changes.
 */
export const useRoomLifecycle = ({
  roomId,
  userId: _userId,
  onRoomDeleted,
  inactivityTimeoutMs = 60 * 60 * 1000, // 1 hour default
}: RoomLifecycleOptions) => {
  // ✅ KEY FIX: Store callback in a ref so it never enters dep chains.
  // An inline arrow function prop is a new reference every render.
  // If it were in deps: onRoomDeleted → deleteRoom → leaveRoom → cleanup
  // effect fires every render → room self-deletes immediately.
  const onRoomDeletedRef = useRef(onRoomDeleted);
  useEffect(() => {
    onRoomDeletedRef.current = onRoomDeleted;
  });

  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Guard: only call leaveRoom() if room was truly initialized.
  // Prevents React StrictMode's synthetic unmount from immediately deleting the room.
  const hasInitializedRef = useRef(false);

  // Guard: prevent double leaveRoom calls (e.g. unmount fires twice in StrictMode
  // or both the cleanup effect and a manual leave call run concurrently).
  const hasLeftRef = useRef(false);

  // ---------------------------------------------------------------------------
  // deleteRoom: delete room + cascade delete storage files
  // deps: [roomId] only — no onRoomDeleted in deps (uses stable ref)
  // ---------------------------------------------------------------------------
  const deleteRoom = useCallback(async () => {
    if (!roomId) return;

    try {
      // Fetch and delete associated storage files first
      const { data: files, error: filesError } = await supabase
        .from('files')
        .select('id, storage_path')
        .eq('room_id', roomId);

      if (filesError) {
        console.error('[Room] Error fetching files for cleanup:', filesError);
      } else if (files && files.length > 0) {
        for (const file of files) {
          try {
            await supabase.storage.from('uploads').remove([file.storage_path]);
          } catch (err) {
            console.error(`[Room] Failed to delete storage file ${file.storage_path}:`, err);
          }
        }
      }

      // Delete room record — ON DELETE CASCADE handles snippets/files in DB
      const { error: deleteError } = await supabase
        .from('rooms')
        .delete()
        .eq('id', roomId);

      if (deleteError) {
        console.error('[Room] Error deleting room:', deleteError);
      } else {
        console.log(`[Room] Successfully deleted room: ${roomId}`);
        onRoomDeletedRef.current?.(); // ✅ stable ref, no dep needed
      }
    } catch (err) {
      console.error('[Room] Failed to delete room:', err);
    }
  }, [roomId]); // ✅ only roomId — stable across renders

  // ---------------------------------------------------------------------------
  // initializeRoom: atomic upsert to create room (race-safe)
  // ---------------------------------------------------------------------------
  const initializeRoom = useCallback(async () => {
    if (!roomId) return;

    try {
      const now = Date.now();

      // Atomic upsert: INSERT the room, ignore conflict if it already exists.
      // Avoids 409 race condition when React StrictMode double-mounts both
      // instances try to INSERT at the same time.
      const { error: upsertError } = await supabase.from('rooms').upsert(
        {
          id: roomId,
          created_at: now,
          last_activity: now,
          user_count: 1,
          status: 'active',
        },
        { onConflict: 'id', ignoreDuplicates: true }
      );

      if (upsertError) {
        console.error('[Room] Error creating room:', upsertError);
        return;
      }

      // Always refresh last_activity and status for returning users
      await supabase
        .from('rooms')
        .update({ last_activity: now, status: 'active' })
        .eq('id', roomId);

      hasInitializedRef.current = true;
      hasLeftRef.current = false;
      console.log(`[Room] Room ${roomId} initialized`);
    } catch (err) {
      console.error('[Room] Failed to initialize room:', err);
    }
  }, [roomId]);

  // ---------------------------------------------------------------------------
  // updateLastActivity: ping DB + reset inactivity timer
  // ---------------------------------------------------------------------------
  const updateLastActivity = useCallback(async () => {
    if (!roomId) return;

    try {
      const now = Date.now();
      await supabase
        .from('rooms')
        .update({ last_activity: now })
        .eq('id', roomId);

      // Reset inactivity timeout
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      activityTimeoutRef.current = setTimeout(() => {
        console.log(`[Room] Inactivity timeout reached for room: ${roomId}`);
        deleteRoom();
      }, inactivityTimeoutMs);
    } catch (err) {
      console.error('[Room] Failed to update last activity:', err);
    }
  }, [roomId, inactivityTimeoutMs, deleteRoom]);

  // ---------------------------------------------------------------------------
  // leaveRoom: decrement user count, delete with grace period if empty
  // deps: [roomId, deleteRoom] — stable because deleteRoom only changes with roomId
  // ---------------------------------------------------------------------------
  const leaveRoom = useCallback(async () => {
    if (!roomId || hasLeftRef.current) return;
    hasLeftRef.current = true; // prevent double-calls

    try {
      const { data: room } = await supabase
        .from('rooms')
        .select('user_count')
        .eq('id', roomId)
        .maybeSingle();

      if (!room) return; // Room already deleted, nothing to do

      const newCount = Math.max(0, (room.user_count || 1) - 1);

      if (newCount === 0) {
        // Room is empty — wait 10s grace period before deleting.
        // This prevents immediate deletion on page refresh or brief disconnects.
        console.log(`[Room] Room ${roomId} is empty, scheduling cleanup in 10s`);
        if (cleanupTimeoutRef.current) clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = setTimeout(() => {
          deleteRoom();
        }, 10_000);
      } else {
        await supabase
          .from('rooms')
          .update({ user_count: newCount, last_activity: Date.now() })
          .eq('id', roomId);
      }
    } catch (err) {
      console.error('[Room] Failed to leave room:', err);
    }
  }, [roomId, deleteRoom]); // ✅ stable — deleteRoom only rebuilds when roomId changes

  // ---------------------------------------------------------------------------
  // Effect 1: Initialize + subscribe to room deletion on roomId change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!roomId) return;

    // Reset guards for this new roomId
    hasInitializedRef.current = false;
    hasLeftRef.current = false;

    initializeRoom();
    updateLastActivity();

    // Subscribe to external room deletion (e.g. another user deletes the room)
    const subscription = supabase
      .channel(`lifecycle:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        () => {
          console.log(`[Room] Room ${roomId} was deleted externally`);
          onRoomDeletedRef.current?.(); // ✅ stable ref
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [roomId, initializeRoom, updateLastActivity]);
  // ✅ subscribeToRoomDeletion removed — inlined here using the stable ref directly

  // ---------------------------------------------------------------------------
  // Effect 2: Activity tracking (mousemove, keypress, click)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!roomId) return;

    const handleActivity = () => updateLastActivity();
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keypress', handleActivity);
    window.addEventListener('click', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keypress', handleActivity);
      window.removeEventListener('click', handleActivity);
      if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
      if (cleanupTimeoutRef.current) clearTimeout(cleanupTimeoutRef.current);
    };
  }, [roomId, updateLastActivity]);

  // ---------------------------------------------------------------------------
  // Effect 3: leaveRoom on unmount — guarded so StrictMode doesn't fire it
  // ✅ leaveRoom is now STABLE — only changes when roomId changes (not every render)
  // so this cleanup effect only fires on real unmounts / roomId changes.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (hasInitializedRef.current) {
        leaveRoom();
      }
    };
  }, [leaveRoom]);

  return {
    updateLastActivity,
    leaveRoom,
    deleteRoom,
    initializeRoom,
  };
};
