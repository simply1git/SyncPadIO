import { useState, useEffect, useRef, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Toaster, toast } from 'react-hot-toast';
import { supabase } from './supabaseClient';
import { useRoomLifecycle, TWENTY_FOUR_HOURS_MS } from './hooks/useRoomLifecycle';
import { uploadFileToRoom, deleteFileFromRoom } from './utils/roomUtils';
import { encryptText, getRoomKeyFromHash, setRoomKeyToHash } from './utils/crypto';
import { startKeepAliveService } from './utils/keepAlive';
import { extractRoomCode, generateRoomId, generateUserId } from './utils/helpers';
import {
  saveRoomOffline,
  saveSnippetsOffline,
  getCachedSnippets,
  savePendingSnippetOffline,
  getPendingSnippets,
  resolvePendingSnippet,
  saveFilesOffline,
  getCachedFiles,
  clearRoomOffline,
} from './utils/offlineStore';
import { HomeScreen } from './components/HomeScreen';
import { RoomHeader } from './components/RoomHeader';
import { SnippetFeed } from './components/SnippetFeed';
import { FileManager } from './components/FileManager';
import { ShareModal } from './components/ShareModal';
import { PreviewModal } from './components/PreviewModal';
import { BiometricModal } from './components/BiometricModal';
import { LockScreen } from './components/LockScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WebRTCTransferService } from './utils/webrtcTransfer';
import { hasRoomPasskey, isRoomLocked } from './utils/webAuthn';
import { Snippet, FileData, UploadItem, ConnectionStatusType, P2PTransfer } from './types';

const STORAGE_KEY_USER_ID = 'syncpad_user_id';
const STORAGE_KEY_USER_NAME = 'syncpad_user_name';

const getPersistentUserId = (): string => {
  let userId = localStorage.getItem(STORAGE_KEY_USER_ID);
  if (!userId) {
    userId = generateUserId();
    try { localStorage.setItem(STORAGE_KEY_USER_ID, userId); } catch { /* ignore */ }
  }
  return userId;
};

export default function App() {
  // ── Session & Room State ────────────────────────────────────────────────
  const [roomId, setRoomId] = useState('');
  const [encryptionKey, setEncryptionKey] = useState<string | undefined>(undefined);
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatusType>('connecting');
  const [userCount, setUserCount] = useState(1);
  const [activeTab, setActiveTab] = useState<'text' | 'files'>('text');
  const [, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  // ── Content State ───────────────────────────────────────────────────────
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [files, setFiles] = useState<FileData[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [p2pTransfers, setP2pTransfers] = useState<P2PTransfer[]>([]);

  // ── UI / Preferences ────────────────────────────────────────────────────
  const [userName, setUserName] = useState(() => localStorage.getItem(STORAGE_KEY_USER_NAME) || '');
  const [darkMode, setDarkMode] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const [showBiometricModal, setShowBiometricModal] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────
  const channelRef = useRef<RealtimeChannel | null>(null);
  const p2pServiceRef = useRef<WebRTCTransferService | null>(null);
  const abortMapRef = useRef<Map<string, () => void>>(new Map());
  const isSyncingRef = useRef(false);
  const [myUserId] = useState(getPersistentUserId);

  // ── Initialize P2P Service ──────────────────────────────────────────────
  useEffect(() => {
    const service = new WebRTCTransferService(myUserId);
    p2pServiceRef.current = service;
    const unsub = service.subscribe(setP2pTransfers);
    return () => {
      unsub();
      service.cleanup();
    };
  }, [myUserId]);

  // ── Dark/Light Mode Theme Toggle ────────────────────────────────────────
  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', !darkMode);
  }, [darkMode]);

  // ── Keep-Alive Background Service ───────────────────────────────────────
  useEffect(() => {
    const cleanup = startKeepAliveService();
    return cleanup;
  }, []);

  // ── Room Lifecycle Hook ─────────────────────────────────────────────────
  const onRoomDeleted = useCallback(() => {
    toast.error('Session was closed or expired');
    if (roomId) clearRoomOffline(roomId);
    setIsJoined(false);
    setRoomId('');
    setSnippets([]);
    setFiles([]);
    window.history.replaceState({}, '', window.location.pathname);
  }, [roomId]);

  const { updateLastActivity, deleteRoom } = useRoomLifecycle({
    roomId,
    userId: myUserId,
    onRoomDeleted,
    inactivityTimeoutMs: TWENTY_FOUR_HOURS_MS,
  });

  // ── Flush Pending Offline Snippets ──────────────────────────────────────
  const flushPendingOfflineSnippets = useCallback(async (targetRoomId: string) => {
    if (isSyncingRef.current || !targetRoomId || !navigator.onLine) return;
    isSyncingRef.current = true;

    try {
      const pending = await getPendingSnippets(targetRoomId);
      if (pending.length === 0) return;

      let syncedCount = 0;
      for (const item of pending) {
        const { data, error } = await supabase.from('snippets')
          .insert({
            room_id: targetRoomId,
            text: item.text,
            sender_id: item.sender_id,
            timestamp: item.timestamp,
            sender_name: item.sender_name || 'Anonymous',
          })
          .select().single();

        if (!error && data) {
          await resolvePendingSnippet(item.id, data as Snippet);
          setSnippets(prev => prev.map(s => s.id === item.id ? { ...(data as Snippet), sync_status: 'synced' } : s));
          syncedCount++;
        }
      }

      if (syncedCount > 0) {
        toast.success(`Synced ${syncedCount} offline message${syncedCount > 1 ? 's' : ''}!`);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[Sync] Flush error:', err);
    } finally {
      isSyncingRef.current = false;
    }
  }, []);

  // ── Network Connectivity Listeners ──────────────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setConnStatus('connecting');
      toast.success('Connection restored');
      if (roomId) {
        flushPendingOfflineSnippets(roomId);
        if (channelRef.current) {
          channelRef.current.subscribe();
        }
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setConnStatus('offline');
      toast('Offline mode — edits are saved locally', { icon: '📡' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [roomId, flushPendingOfflineSnippets]);

  // ── Save User Display Name ──────────────────────────────────────────────
  const handleSaveUserName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try { localStorage.setItem(STORAGE_KEY_USER_NAME, trimmed); } catch { /* ignore */ }
    setUserName(trimmed);
    setShowNameModal(false);
  };

  // ── Join Room Realtime with Local-First IndexedDB Hydration ─────────────
  const joinRoomRealtime = useCallback(async (id: string, customKey?: string) => {
    const cleanId = extractRoomCode(id);
    if (!cleanId) {
      toast.error('Invalid room code');
      return;
    }

    setIsJoining(true);

    // 1. Resolve encryption key (from param or URL hash if explicitly provided)
    const hashKey = getRoomKeyFromHash();
    const resolvedKey = customKey || hashKey || undefined;

    setEncryptionKey(resolvedKey);
    if (resolvedKey) {
      setRoomKeyToHash(resolvedKey);
    }

    // Save room record offline for zero-latency load next time
    await saveRoomOffline(cleanId, resolvedKey);

    // Check if room is locked via Biometric Passkey on this device
    if (hasRoomPasskey(cleanId) && isRoomLocked(cleanId)) {
      setIsLocked(true);
    }

    // 2. Local-First Hydration: Immediately load cached snippets & files from IndexedDB
    const [cachedSnips, cachedFls] = await Promise.all([
      getCachedSnippets(cleanId),
      getCachedFiles(cleanId)
    ]);
    if (cachedSnips.length) setSnippets(cachedSnips);
    if (cachedFls.length) setFiles(cachedFls);

    setRoomId(cleanId);
    const urlPath = `?room=${cleanId}${resolvedKey ? `#k=${resolvedKey}` : ''}`;
    window.history.replaceState({}, '', urlPath);

    // 3. If offline, stay in local workspace without throwing network errors
    if (!navigator.onLine) {
      setConnStatus('offline');
      setIsJoined(true);
      setIsJoining(false);
      return;
    }

    // 4. Online flow: check room in Supabase & subscribe
    try {
      const now = Date.now();

      const { data: existingRoom, error: fetchErr } = await supabase
        .from('rooms')
        .select('id, last_activity')
        .eq('id', cleanId)
        .maybeSingle();

      if (fetchErr && import.meta.env.DEV) {
        console.warn('Room check notice:', fetchErr);
      }

      // Safe 24-Hour Expiration Check:
      // If room is older than 24 hours of inactivity, clean up old records safely and start fresh
      const isExpired = existingRoom?.last_activity && (now - existingRoom.last_activity > TWENTY_FOUR_HOURS_MS);

      if (isExpired) {
        await deleteRoom();
        await supabase.from('rooms').upsert({
          id: cleanId,
          created_at: now,
          last_activity: now,
          status: 'active'
        }, { onConflict: 'id' });
        toast('Previous 24-hour session expired. Fresh session started.', { icon: '⏳' });
      } else if (!existingRoom) {
        const { error: upsertError } = await supabase.from('rooms').upsert({
          id: cleanId,
          created_at: now,
          last_activity: now,
          status: 'active'
        }, { onConflict: 'id' });

        if (upsertError) {
          console.error('Room creation error:', upsertError);
          // If network failed mid-flight, fall back to offline mode
          if (!navigator.onLine) {
            setConnStatus('offline');
            setIsJoined(true);
            return;
          }
          toast.error(`Could not enter room: ${upsertError.message || 'Database error'}`);
          setIsJoining(false);
          return;
        }
      } else {
        await supabase.from('rooms').update({ last_activity: now, status: 'active' }).eq('id', cleanId);
      }

      if (channelRef.current) await supabase.removeChannel(channelRef.current);

      // Fetch latest records from Supabase and update local IndexedDB cache
      const [snippetRes, fileRes] = await Promise.all([
        supabase.from('snippets').select('*').eq('room_id', cleanId).order('timestamp'),
        supabase.from('files').select('*').eq('room_id', cleanId).order('timestamp'),
      ]);

      if (snippetRes.data) {
        const freshSnippets = snippetRes.data as Snippet[];
        setSnippets(freshSnippets);
        await saveSnippetsOffline(cleanId, freshSnippets);
      }
      if (fileRes.data) {
        const freshFiles = fileRes.data as FileData[];
        setFiles(freshFiles);
        await saveFilesOffline(cleanId, freshFiles);
      }

      // Check and flush any pending offline drafts
      flushPendingOfflineSnippets(cleanId);

      // Subscribe to Realtime channel
      const ch = supabase.channel(`room:${cleanId}`);

      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'snippets', filter: `room_id=eq.${cleanId}` },
        (p) => {
          const newSnip = p.new as Snippet;
          setSnippets(prev => {
            if (prev.find(s => s.id === newSnip.id)) return prev;
            const updated = [...prev, newSnip];
            saveSnippetsOffline(cleanId, updated);
            return updated;
          });
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'snippets', filter: `room_id=eq.${cleanId}` },
        (p) => {
          setSnippets(prev => {
            const updated = prev.filter(s => s.id !== p.old.id);
            saveSnippetsOffline(cleanId, updated);
            return updated;
          });
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'files', filter: `room_id=eq.${cleanId}` },
        (p) => {
          const newFile = p.new as FileData;
          setFiles(prev => {
            if (prev.find(f => f.id === newFile.id)) return prev;
            const updated = [...prev, newFile];
            saveFilesOffline(cleanId, updated);
            return updated;
          });
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'files', filter: `room_id=eq.${cleanId}` },
        (p) => {
          setFiles(prev => {
            const updated = prev.filter(f => f.id !== p.old.id);
            saveFilesOffline(cleanId, updated);
            return updated;
          });
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState();
        const count = Object.values(state).reduce((a, v) => a + v.length, 0);
        setUserCount(Math.max(1, count));
      })
      .on('presence', { event: 'leave' }, () => {
        const state = ch.presenceState();
        const count = Object.values(state).reduce((a, v) => a + v.length, 0);
        setUserCount(Math.max(1, count));
        // Safe 24-Hour Expiration:
        // Do NOT delete the room on temporary absence!
        // Instead, stamp last_activity so the room remains securely accessible for 24 hours.
        if (count === 0) {
          updateLastActivity(true);
        }
      })
      .on('broadcast', { event: 'webrtc-signal' }, (res) => {
        if (p2pServiceRef.current && res.payload) {
          p2pServiceRef.current.handleSignal(res.payload);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setConnStatus('connected');
          await ch.track({ user: myUserId, joined: Date.now() });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnStatus('offline');
        }
      });

      channelRef.current = ch;
      if (p2pServiceRef.current) {
        p2pServiceRef.current.setSignalSender((signal) => {
          ch.send({
            type: 'broadcast',
            event: 'webrtc-signal',
            payload: signal,
          });
        });
      }
      setConnStatus('connecting');
      setIsJoined(true);

      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (err) {
      // Graceful offline fallback on network failure
      if (!navigator.onLine) {
        setConnStatus('offline');
        setIsJoined(true);
      } else {
        toast.error('Network error entering session');
      }
    } finally {
      setIsJoining(false);
    }
  }, [myUserId, deleteRoom, flushPendingOfflineSnippets, updateLastActivity]);

  // ── URL Parameter Auto-Join ─────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      const clean = extractRoomCode(roomParam);
      if (clean) {
        if (!userName.trim()) {
          const fallbackGuest = 'Guest-' + Math.random().toString(36).slice(2, 6).toUpperCase();
          handleSaveUserName(fallbackGuest);
        }
        joinRoomRealtime(clean);
      }
    }
  }, [joinRoomRealtime, userName]);

  // ── Session Creation Handlers ───────────────────────────────────────────
  const handleCreateNewSession = async () => {
    if (!userName.trim()) {
      handleSaveUserName('Host-' + Math.random().toString(36).slice(2, 6).toUpperCase());
    }
    const newRoomId = generateRoomId();
    joinRoomRealtime(newRoomId);
  };

  const handleCreateCustomSession = async (customCode: string) => {
    if (!userName.trim()) {
      handleSaveUserName('Host-' + Math.random().toString(36).slice(2, 6).toUpperCase());
    }
    joinRoomRealtime(customCode);
  };

  const handleLeaveRoom = async () => {
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (p2pServiceRef.current) {
      p2pServiceRef.current.cleanup();
    }
    setIsLocked(false);
    if (roomId) clearRoomOffline(roomId);
    setIsJoined(false);
    setRoomId('');
    setEncryptionKey(undefined);
    setSnippets([]);
    setFiles([]);
    setP2pTransfers([]);
    setConnStatus('connecting');
    window.history.replaceState({}, '', window.location.pathname);
    toast('Left session', { icon: '👋' });
  };

  // ── Snippet Actions (With Offline-First Outbox Queuing) ──────────────────
  const handleAddSnippet = async (text: string, encrypt: boolean) => {
    if (!text.trim() || !isJoined) return;
    const raw = text.trim();
    const now = Date.now();
    const body = encrypt ? await encryptText(raw, roomId, encryptionKey) : raw;

    // 1. If currently offline or disconnected, queue locally in IndexedDB
    if (!navigator.onLine || connStatus === 'offline') {
      const offlineSnippet: Snippet = {
        id: `offline-${now}`,
        room_id: roomId,
        text: body,
        sender_id: myUserId,
        timestamp: now,
        sender_name: userName || 'Anonymous',
        sync_status: 'pending',
      };

      await savePendingSnippetOffline(offlineSnippet);
      setSnippets(prev => [...prev, offlineSnippet]);
      toast('Draft saved offline — will sync when online', { icon: '📝' });
      return;
    }

    // 2. Online flow: optimistic UI + write to Supabase
    const optimistic: Snippet = {
      id: `opt-${now}`,
      room_id: roomId,
      text: body,
      sender_id: myUserId,
      timestamp: now,
      sender_name: userName || 'Anonymous',
      sync_status: 'synced',
    };

    setSnippets(prev => [...prev, optimistic]);

    try {
      const { data, error } = await supabase.from('snippets')
        .insert({
          room_id: roomId,
          text: body,
          sender_id: myUserId,
          timestamp: now,
          sender_name: userName || 'Anonymous'
        })
        .select().single();

      if (error) {
        throw error;
      } else if (data) {
        const verified = data as Snippet;
        setSnippets(prev => prev.map(s => s.id === optimistic.id ? verified : s));
        saveSnippetsOffline(roomId, [...snippets.filter(s => s.id !== optimistic.id), verified]);

        if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('SyncPadIO', { body: 'New snippet received', icon: '/icon.svg' });
        }
      }
    } catch (err: any) {
      // Fallback: if network unexpectedly dropped mid-request, save as pending offline
      console.warn('Network send failed, queuing offline:', err);
      const pending: Snippet = { ...optimistic, sync_status: 'pending' };
      await savePendingSnippetOffline(pending);
      setSnippets(prev => prev.map(s => s.id === optimistic.id ? pending : s));
      toast('Offline draft queued for sync', { icon: '📝' });
    }

    updateLastActivity(true);
  };

  const handleDeleteSnippet = async (id: string) => {
    setSnippets(prev => prev.filter(s => s.id !== id));
    if (navigator.onLine) {
      await supabase.from('snippets').delete().eq('id', id);
    }
    updateLastActivity(true);
  };

  // ── File Actions ────────────────────────────────────────────────────────
  const handleUploadFile = async (file: File) => {
    if (!navigator.onLine) {
      toast.error('File uploads require an active internet connection');
      return;
    }

    const uid = `${Date.now()}-${file.name}`;
    setUploads(prev => [...prev, { id: uid, name: file.name, progress: 0, done: false }]);

    const { promise, abort } = uploadFileToRoom({
      roomId,
      file,
      uploaderName: userName,
      encryptionKey,
      onProgress: (p) => setUploads(prev => prev.map(u => u.id === uid ? { ...u, progress: p } : u))
    });

    abortMapRef.current.set(uid, abort);

    try {
      const record = await promise;
      abortMapRef.current.delete(uid);
      setUploads(prev => prev.map(u => u.id === uid ? { ...u, progress: 100, done: true } : u));
      const fd = record as unknown as FileData;
      setFiles(prev => {
        const updated = prev.find(f => f.id === fd.id) ? prev : [...prev, fd];
        saveFilesOffline(roomId, updated);
        return updated;
      });
      toast.success(`${file.name} uploaded`);
      setTimeout(() => setUploads(prev => prev.filter(u => u.id !== uid)), 2000);
    } catch (err: unknown) {
      abortMapRef.current.delete(uid);
      const msg = err instanceof Error ? err.message : 'Upload failed';
      const isCancelled = msg === 'Upload cancelled';
      if (!isCancelled) toast.error(msg);
      setUploads(prev => prev.map(u => u.id === uid ? { ...u, error: isCancelled ? undefined : msg, cancelled: isCancelled } : u));
      setTimeout(() => setUploads(prev => prev.filter(u => u.id !== uid)), isCancelled ? 500 : 4000);
    }
    updateLastActivity(true);
  };

  const handleUploadFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList).forEach(handleUploadFile);
  };

  const handleCancelUpload = (uid: string) => {
    abortMapRef.current.get(uid)?.();
    abortMapRef.current.delete(uid);
  };

  const handleDeleteFile = async (id: string, url: string) => {
    setFiles(prev => {
      const updated = prev.filter(f => f.id !== id);
      saveFilesOffline(roomId, updated);
      return updated;
    });

    const path = url.split('/uploads/')[1];
    if (path && navigator.onLine) {
      try { await deleteFileFromRoom(id, path); } catch { /* ignore */ }
    }
    updateLastActivity(true);
    toast.success('File deleted');
  };

  const handleSendP2PFile = async (file: File) => {
    if (!p2pServiceRef.current) return;
    if (userCount <= 1) {
      toast('Connect another peer in this room to stream directly', { icon: '⚡' });
      return;
    }
    toast(`Streaming ${file.name} directly via P2P…`, { icon: '⚡' });
    await p2pServiceRef.current.sendFile(file);
    updateLastActivity(true);
  };

  const handleCancelP2PTransfer = (transferId: string) => {
    p2pServiceRef.current?.cancelTransfer(transferId);
    toast.error('P2P transfer cancelled');
  };

  const handleClearP2PTransfer = (transferId: string) => {
    p2pServiceRef.current?.clearTransfer(transferId);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER VIEW
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <ErrorBoundary>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: darkMode ? '#1a1a1a' : '#ffffff',
            color: darkMode ? '#f5f5f5' : '#171717',
            border: `1px solid ${darkMode ? '#262626' : '#e5e5e5'}`
          }
        }}
      />

      {!isJoined ? (
        <HomeScreen
          userName={userName}
          onUpdateUserName={handleSaveUserName}
          onCreateRoom={handleCreateNewSession}
          onCreateCustomRoom={handleCreateCustomSession}
          onJoinRoom={(code) => joinRoomRealtime(code)}
          isJoining={isJoining}
        />
      ) : (
        <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
          <RoomHeader
            roomId={roomId}
            userName={userName}
            userCount={userCount}
            connStatus={connStatus}
            darkMode={darkMode}
            hasEncryptionKey={Boolean(encryptionKey)}
            hasPasskey={hasRoomPasskey(roomId)}
            onToggleDarkMode={() => setDarkMode(v => !v)}
            onOpenNameModal={() => setShowNameModal(true)}
            onOpenShareModal={() => setShowShare(true)}
            onOpenBiometricModal={() => setShowBiometricModal(true)}
            onLeaveRoom={handleLeaveRoom}
          />

          {/* Tab bar for mobile */}
          <div className="flex gap-1 p-2 md:hidden" style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              className={`tab-btn ${activeTab === 'text' ? 'active' : ''}`}
              onClick={() => setActiveTab('text')}
              aria-label="View Snippets tab"
            >
              ✏️ Snippets {snippets.length > 0 && `(${snippets.length})`}
            </button>
            <button
              className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`}
              onClick={() => setActiveTab('files')}
              aria-label="View Files tab"
            >
              📁 Files {files.length > 0 && `(${files.length})`}
            </button>
          </div>

          {/* Main workspace container */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <div className={`${activeTab === 'text' ? 'flex' : 'hidden'} md:flex flex-col flex-1 overflow-hidden`}>
              <SnippetFeed
                snippets={snippets}
                myUserId={myUserId}
                roomId={roomId}
                encryptionKey={encryptionKey}
                onAddSnippet={handleAddSnippet}
                onDeleteSnippet={handleDeleteSnippet}
              />
            </div>

            <div className={`${activeTab === 'files' ? 'flex' : 'hidden'} md:flex flex-col flex-1 overflow-hidden`}>
              <FileManager
                files={files}
                uploads={uploads}
                p2pTransfers={p2pTransfers}
                userCount={userCount}
                roomId={roomId}
                encryptionKey={encryptionKey}
                onUploadFiles={handleUploadFiles}
                onSendP2PFile={handleSendP2PFile}
                onCancelP2PTransfer={handleCancelP2PTransfer}
                onClearP2PTransfer={handleClearP2PTransfer}
                onCancelUpload={handleCancelUpload}
                onDeleteFile={handleDeleteFile}
                onPreviewFile={setPreviewFile}
                onActivity={() => updateLastActivity(false)}
              />
            </div>
          </div>

          {/* Modals */}
          {showShare && (
            <ShareModal
              roomId={roomId}
              userCount={userCount}
              encryptionKey={encryptionKey}
              onClose={() => setShowShare(false)}
            />
          )}

          {showBiometricModal && (
            <BiometricModal
              roomId={roomId}
              isOpen={showBiometricModal}
              onClose={() => setShowBiometricModal(false)}
              onLockSession={() => setIsLocked(true)}
            />
          )}

          {isLocked && (
            <LockScreen
              roomId={roomId}
              onUnlocked={() => setIsLocked(false)}
              onLeaveRoom={handleLeaveRoom}
            />
          )}

          {previewFile && (
            <PreviewModal
              file={previewFile}
              roomId={roomId}
              encryptionKey={encryptionKey}
              onClose={() => setPreviewFile(null)}
            />
          )}

          {showNameModal && (
            <div
              className="modal-backdrop"
              onClick={() => setShowNameModal(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Edit display name"
            >
              <div
                className="modal-box p-6 w-full max-w-sm"
                onClick={e => e.stopPropagation()}
              >
                <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>
                  Set Display Name
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                  Appears alongside your shared messages and files
                </p>
                <input
                  type="text"
                  className="input-dark w-full px-4 py-3 mb-4 text-base"
                  placeholder="Your display name"
                  defaultValue={userName}
                  maxLength={30}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveUserName((e.target as HTMLInputElement).value);
                  }}
                  id="modal-name-input"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowNameModal(false)}
                    className="btn-ghost flex-1 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const input = document.getElementById('modal-name-input') as HTMLInputElement;
                      if (input) handleSaveUserName(input.value);
                    }}
                    className="btn-accent flex-1 py-2 text-sm font-semibold"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </ErrorBoundary>
  );
}
