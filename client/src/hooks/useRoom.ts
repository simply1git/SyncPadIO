import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface Snippet {
  id: string;
  text: string;
  sender_id: string;
  timestamp: number;
}

export interface FileData {
  id: string;
  name: string;
  size: number;
  url: string;
  timestamp: number;
}

export interface RoomState {
  roomId: string;
  isConnected: boolean;
  isJoined: boolean;
  userCount: number;
  snippets: Snippet[];
  files: FileData[];
  status: string;
  error: string | null;
}

export function useRoom(myUserId: string) {
  const [roomState, setRoomState] = useState<RoomState>({
    roomId: '',
    isConnected: false,
    isJoined: false,
    userCount: 1,
    snippets: [],
    files: [],
    status: 'Ready',
    error: null,
  });

  const channelRef = useRef<RealtimeChannel | null>(null);

  const joinRoom = useCallback(async (cleanId: string) => {
    try {
      setRoomState(prev => ({
        ...prev,
        status: 'Joining room...',
        error: null,
      }));

      // Cleanup previous channel
      if (channelRef.current) {
        await supabase.removeChannel(channelRef.current);
      }

      // Fetch initial data
      const [snippetsResult, filesResult] = await Promise.all([
        supabase
          .from('snippets')
          .select('*')
          .eq('room_id', cleanId)
          .order('timestamp', { ascending: true }),
        supabase
          .from('files')
          .select('*')
          .eq('room_id', cleanId)
          .order('timestamp', { ascending: true }),
      ]);

      if (snippetsResult.error) throw snippetsResult.error;
      if (filesResult.error) throw filesResult.error;

      // Subscribe to realtime changes
      const newChannel = supabase.channel(`room:${cleanId}`);

      newChannel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'snippets', filter: `room_id=eq.${cleanId}` },
          (payload) => {
            setRoomState(prev => ({
              ...prev,
              snippets: [...prev.snippets, payload.new as Snippet],
            }));
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'snippets', filter: `room_id=eq.${cleanId}` },
          (payload) => {
            setRoomState(prev => ({
              ...prev,
              snippets: prev.snippets.filter(s => s.id !== payload.old.id),
            }));
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'files', filter: `room_id=eq.${cleanId}` },
          (payload) => {
            setRoomState(prev => ({
              ...prev,
              files: [...prev.files, payload.new as FileData],
            }));
          }
        )
        .on('presence', { event: 'sync' }, () => {
          const presenceState = newChannel.presenceState();
          const count = Object.keys(presenceState).reduce((acc, key) => acc + presenceState[key].length, 0);
          setRoomState(prev => ({
            ...prev,
            userCount: Math.max(1, count),
          }));
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            setRoomState(prev => ({
              ...prev,
              isConnected: true,
              isJoined: true,
              status: 'Connected to Realtime',
            }));
            await newChannel.track({ user: myUserId, online_at: new Date().toISOString() });
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            setRoomState(prev => ({
              ...prev,
              isConnected: false,
              status: 'Disconnected from Realtime',
            }));
          }
        });

      channelRef.current = newChannel;
      setRoomState(prev => ({
        ...prev,
        roomId: cleanId,
        snippets: (snippetsResult.data || []) as Snippet[],
        files: (filesResult.data || []) as FileData[],
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to join room';
      setRoomState(prev => ({
        ...prev,
        error: errorMessage,
        status: 'Connection failed',
      }));
    }
  }, [myUserId]);

  const addSnippet = useCallback(async (text: string) => {
    if (!text.trim()) return;

    try {
      const { error } = await supabase.from('snippets').insert({
        room_id: roomState.roomId,
        text: text.trim(),
        sender_id: myUserId,
        timestamp: Date.now(),
      });

      if (error) throw error;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add snippet';
      setRoomState(prev => ({
        ...prev,
        error: errorMessage,
      }));
      throw err;
    }
  }, [roomState.roomId, myUserId]);

  const deleteSnippet = useCallback(async (snippetId: string) => {
    try {
      const { error } = await supabase.from('snippets').delete().eq('id', snippetId);
      if (error) throw error;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete snippet';
      setRoomState(prev => ({
        ...prev,
        error: errorMessage,
      }));
      throw err;
    }
  }, []);

  const addFile = useCallback(async (fileData: FileData) => {
    try {
      const { error } = await supabase.from('files').insert({
        room_id: roomState.roomId,
        name: fileData.name,
        size: fileData.size,
        url: fileData.url,
        timestamp: fileData.timestamp,
      });

      if (error) throw error;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add file';
      setRoomState(prev => ({
        ...prev,
        error: errorMessage,
      }));
      throw err;
    }
  }, [roomState.roomId]);

  const clearError = useCallback(() => {
    setRoomState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);

  const cleanup = useCallback(async () => {
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    ...roomState,
    joinRoom,
    addSnippet,
    deleteSnippet,
    addFile,
    clearError,
    cleanup,
  };
}
