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
 * - Creates room when user joins
 * - Tracks user presence (join/leave)
 * - Updates last activity timestamp
 * - Cleans up empty/inactive rooms
 * - Cascade deletes files when room is deleted
 */
export const useRoomLifecycle = ({
  roomId,
  userId: _userId,
  onRoomDeleted,
  inactivityTimeoutMs = 60 * 60 * 1000, // 1 hour default
}: RoomLifecycleOptions) => {
  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create or update room record
  const initializeRoom = useCallback(async () => {
    if (!roomId) return;

    try {
      const now = Date.now();

      // Check if room exists
      const { data: existingRoom } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (!existingRoom) {
        // Create new room
        const { error } = await supabase.from('rooms').insert({
          id: roomId,
          created_at: now,
          last_activity: now,
          user_count: 1,
          status: 'active',
        });

        if (error && error.code !== 'PGRST116') {
          // PGRST116 = duplicate key, room already exists
          console.error('Error creating room:', error);
        }
      } else {
        // Update existing room: increment user count and update last activity
        const { error } = await supabase
          .from('rooms')
          .update({
            last_activity: now,
            user_count: (existingRoom.user_count || 0) + 1,
            status: 'active',
          })
          .eq('id', roomId);

        if (error) {
          console.error('Error updating room:', error);
        }
      }
    } catch (err) {
      console.error('Failed to initialize room:', err);
    }
  }, [roomId]);

  // Update last activity timestamp
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
        cleanupInactiveRoom();
      }, inactivityTimeoutMs);
    } catch (err) {
      console.error('Failed to update last activity:', err);
    }
  }, [roomId, inactivityTimeoutMs]);

  // Cleanup inactive room
  const cleanupInactiveRoom = useCallback(async () => {
    if (!roomId) return;

    try {
      console.log(`[Room] Cleaning up inactive room: ${roomId}`);
      await deleteRoom();
    } catch (err) {
      console.error('Failed to cleanup inactive room:', err);
    }
  }, [roomId]);

  // Delete room and cascade delete files
  const deleteRoom = useCallback(async () => {
    if (!roomId) return;

    try {
      // Get all files in room
      const { data: files, error: filesError } = await supabase
        .from('files')
        .select('id, storage_path')
        .eq('room_id', roomId);

      if (filesError) {
        console.error('Error fetching files:', filesError);
      } else if (files && files.length > 0) {
        // Delete files from storage
        for (const file of files) {
          try {
            await supabase.storage
              .from('uploads')
              .remove([file.storage_path]);
          } catch (err) {
            console.error(`Failed to delete file ${file.storage_path}:`, err);
          }
        }
      }

      // Delete room record (cascade delete files from DB)
      const { error: deleteError } = await supabase
        .from('rooms')
        .delete()
        .eq('id', roomId);

      if (deleteError) {
        console.error('Error deleting room:', deleteError);
      } else {
        console.log(`[Room] Successfully deleted room: ${roomId}`);
        onRoomDeleted?.();
      }
    } catch (err) {
      console.error('Failed to delete room:', err);
    }
  }, [roomId, onRoomDeleted]);

  // Decrement user count and cleanup if empty
  const leaveRoom = useCallback(async () => {
    if (!roomId) return;

    try {
      const { data: room } = await supabase
        .from('rooms')
        .select('user_count')
        .eq('id', roomId)
        .single();

      if (room) {
        const newCount = Math.max(0, (room.user_count || 1) - 1);

        if (newCount === 0) {
          // Room is empty, schedule cleanup
          console.log(`[Room] Room ${roomId} is empty, scheduling cleanup`);

          if (cleanupTimeoutRef.current) {
            clearTimeout(cleanupTimeoutRef.current);
          }

          // Clean up immediately when everyone leaves
          await deleteRoom();
        } else {
          // Update user count
          await supabase
            .from('rooms')
            .update({
              user_count: newCount,
              last_activity: Date.now(),
            })
            .eq('id', roomId);
        }
      }
    } catch (err) {
      console.error('Failed to leave room:', err);
    }
  }, [roomId, deleteRoom]);

  // Subscribe to room deletion via Realtime
  const subscribeToRoomDeletion = useCallback(() => {
    if (!roomId) return;

    try {
      const subscription = supabase
        .channel(`room:${roomId}`)
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'rooms',
            filter: `id=eq.${roomId}`,
          },
          () => {
            console.log(`[Room] Room ${roomId} was deleted`);
            onRoomDeleted?.();
          }
        )
        .subscribe();

      return subscription;
    } catch (err) {
      console.error('Failed to subscribe to room deletion:', err);
    }
  }, [roomId, onRoomDeleted]);

  // Initialize on mount
  useEffect(() => {
    initializeRoom();
    updateLastActivity();

    const subscription = subscribeToRoomDeletion();

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, [roomId, initializeRoom, updateLastActivity, subscribeToRoomDeletion]);

  // Setup activity tracking
  useEffect(() => {
    const handleActivity = () => {
      updateLastActivity();
    };

    // Track user activity
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keypress', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('touch', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keypress', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('touch', handleActivity);

      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
      }
    };
  }, [updateLastActivity]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, [leaveRoom]);

  return {
    updateLastActivity,
    leaveRoom,
    deleteRoom,
    initializeRoom,
  };
};
