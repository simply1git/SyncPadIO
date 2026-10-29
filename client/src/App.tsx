import { useState, useEffect, useRef, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Toaster, toast } from 'react-hot-toast';
import { supabase } from './supabaseClient';
import { useRoomLifecycle } from './hooks/useRoomLifecycle';
import { uploadFileToRoom, deleteFileFromRoom } from './utils/roomUtils';
import { encryptText, generateRoomKey, getRoomKeyFromHash, setRoomKeyToHash } from './utils/crypto';
import { startKeepAliveService } from './utils/keepAlive';
import { extractRoomCode, generateRoomId, generateUserId } from './utils/helpers';
import { HomeScreen } from './components/HomeScreen';
import { RoomHeader } from './components/RoomHeader';
import { SnippetFeed } from './components/SnippetFeed';
import { FileManager } from './components/FileManager';
import { ShareModal } from './components/ShareModal';
import { PreviewModal } from './components/PreviewModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Snippet, FileData, UploadItem, ConnectionStatusType } from './types';

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

  // ── Content State ───────────────────────────────────────────────────────
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [files, setFiles] = useState<FileData[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  // ── UI / Preferences ────────────────────────────────────────────────────
  const [userName, setUserName] = useState(() => localStorage.getItem(STORAGE_KEY_USER_NAME) || '');
  const [darkMode, setDarkMode] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────
  const channelRef = useRef<RealtimeChannel | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortMapRef = useRef<Map<string, () => void>>(new Map());
  const [myUserId] = useState(getPersistentUserId);

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
    setIsJoined(false);
    setRoomId('');
    setSnippets([]);
    setFiles([]);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const { updateLastActivity, deleteRoom } = useRoomLifecycle({
    roomId,
    userId: myUserId,
    onRoomDeleted,
  });

  // ── Save User Display Name ──────────────────────────────────────────────
  const handleSaveUserName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try { localStorage.setItem(STORAGE_KEY_USER_NAME, trimmed); } catch { /* ignore */ }
    setUserName(trimmed);
    setShowNameModal(false);
  };

  // ── Join Room Realtime ──────────────────────────────────────────────────
  const joinRoomRealtime = useCallback(async (id: string, customKey?: string) => {
    const cleanId = extractRoomCode(id);
    if (!cleanId) {
      toast.error('Invalid room code');
      return;
    }

    setIsJoining(true);
    const resolvedKey = customKey || getRoomKeyFromHash() || undefined;
    if (resolvedKey) {
      setEncryptionKey(resolvedKey);
      setRoomKeyToHash(resolvedKey);
    }

    try {
      const now = Date.now();

      // Check if room exists; if not, initialize seamlessly
      const { data: existingRoom, error: fetchErr } = await supabase
        .from('rooms')
        .select('id')
        .eq('id', cleanId)
        .maybeSingle();

      if (fetchErr && import.meta.env.DEV) {
        console.warn('Room check notice:', fetchErr);
      }

      if (!existingRoom) {
        const { error: upsertError } = await supabase.from('rooms').upsert({
          id: cleanId,
          created_at: now,
          last_activity: now,
          status: 'active'
        }, { onConflict: 'id' });

        if (upsertError) {
          console.error('Room creation error:', upsertError);
          toast.error(`Could not enter room: ${upsertError.message || 'Database error'}`);
          setIsJoining(false);
          return;
        }
      } else {
        await supabase.from('rooms').update({ last_activity: now, status: 'active' }).eq('id', cleanId);
      }

      setRoomId(cleanId);
      const urlPath = `?room=${cleanId}${resolvedKey ? `#k=${resolvedKey}` : ''}`;
      window.history.replaceState({}, '', urlPath);

      if (channelRef.current) await supabase.removeChannel(channelRef.current);

      // Fetch initial content
      const [snippetRes, fileRes] = await Promise.all([
        supabase.from('snippets').select('*').eq('room_id', cleanId).order('timestamp'),
        supabase.from('files').select('*').eq('room_id', cleanId).order('timestamp'),
      ]);
      if (snippetRes.data) setSnippets(snippetRes.data as Snippet[]);
      if (fileRes.data) setFiles(fileRes.data as FileData[]);

      // Subscribe to Realtime channel
      const ch = supabase.channel(`room:${cleanId}`);

      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'snippets', filter: `room_id=eq.${cleanId}` },
        (p) => setSnippets(prev => prev.find(s => s.id === p.new.id) ? prev : [...prev, p.new as Snippet])
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'snippets', filter: `room_id=eq.${cleanId}` },
        (p) => setSnippets(prev => prev.filter(s => s.id !== p.old.id))
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'files', filter: `room_id=eq.${cleanId}` },
        (p) => setFiles(prev => prev.find(f => f.id === p.new.id) ? prev : [...prev, p.new as FileData])
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'files', filter: `room_id=eq.${cleanId}` },
        (p) => setFiles(prev => prev.filter(f => f.id !== p.old.id))
      )
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState();
        const count = Object.values(state).reduce((a, v) => a + v.length, 0);
        setUserCount(Math.max(1, count));
        if (cleanupTimerRef.current) { clearTimeout(cleanupTimerRef.current); cleanupTimerRef.current = null; }
      })
      .on('presence', { event: 'leave' }, () => {
        const state = ch.presenceState();
        const count = Object.values(state).reduce((a, v) => a + v.length, 0);
        if (count === 0) {
          // Grace period before cleaning deserted room
          cleanupTimerRef.current = setTimeout(() => deleteRoom(), 10 * 60 * 1000);
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
      setConnStatus('connecting');
      setIsJoined(true);

      // Notification permission request
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } finally {
      setIsJoining(false);
    }
  }, [myUserId, deleteRoom]);

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
    const newKey = await generateRoomKey();
    joinRoomRealtime(newRoomId, newKey);
  };

  const handleCreateCustomSession = async (customCode: string) => {
    if (!userName.trim()) {
      handleSaveUserName('Host-' + Math.random().toString(36).slice(2, 6).toUpperCase());
    }
    const newKey = await generateRoomKey();
    joinRoomRealtime(customCode, newKey);
  };

  const handleLeaveRoom = async () => {
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setIsJoined(false);
    setRoomId('');
    setEncryptionKey(undefined);
    setSnippets([]);
    setFiles([]);
    setConnStatus('connecting');
    window.history.replaceState({}, '', window.location.pathname);
    toast('Left room', { icon: '👋' });
  };

  // ── Snippet Actions ─────────────────────────────────────────────────────
  const handleAddSnippet = async (text: string, encrypt: boolean) => {
    if (!text.trim() || !isJoined) return;
    const raw = text.trim();
    const now = Date.now();
    const body = encrypt ? await encryptText(raw, roomId, encryptionKey) : raw;
    const optimistic: Snippet = {
      id: `opt-${now}`,
      text: body,
      sender_id: myUserId,
      timestamp: now,
      sender_name: userName || 'Anonymous'
    };

    setSnippets(prev => [...prev, optimistic]);
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
      console.error('Snippet send error:', error);
      toast.error(`Failed to send: ${error.message || 'Unknown error'}`);
      setSnippets(prev => prev.filter(s => s.id !== optimistic.id));
      throw error;
    } else if (data) {
      setSnippets(prev => prev.map(s => s.id === optimistic.id ? data as Snippet : s));
      if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('SyncPadIO', { body: 'New snippet received', icon: '/icon.svg' });
      }
    }
    updateLastActivity(true);
  };

  const handleDeleteSnippet = async (id: string) => {
    setSnippets(prev => prev.filter(s => s.id !== id));
    await supabase.from('snippets').delete().eq('id', id);
    updateLastActivity(true);
  };

  // ── File Actions ────────────────────────────────────────────────────────
  const handleUploadFile = async (file: File) => {
    const uid = `${Date.now()}-${file.name}`;
    setUploads(prev => [...prev, { id: uid, name: file.name, progress: 0, done: false }]);

    const { promise, abort } = uploadFileToRoom({
      roomId,
      file,
      uploaderName: userName,
      onProgress: (p) => setUploads(prev => prev.map(u => u.id === uid ? { ...u, progress: p } : u))
    });

    abortMapRef.current.set(uid, abort);

    try {
      const record = await promise;
      abortMapRef.current.delete(uid);
      setUploads(prev => prev.map(u => u.id === uid ? { ...u, progress: 100, done: true } : u));
      const fd = record as unknown as FileData;
      setFiles(prev => prev.find(f => f.id === fd.id) ? prev : [...prev, fd]);
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
    setFiles(prev => prev.filter(f => f.id !== id));
    const path = url.split('/uploads/')[1];
    if (path) {
      try { await deleteFileFromRoom(id, path); } catch { /* ignore */ }
    }
    updateLastActivity(true);
    toast.success('File deleted');
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
            onToggleDarkMode={() => setDarkMode(v => !v)}
            onOpenNameModal={() => setShowNameModal(true)}
            onOpenShareModal={() => setShowShare(true)}
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
                roomId={roomId}
                onUploadFiles={handleUploadFiles}
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

          {previewFile && (
            <PreviewModal
              file={previewFile}
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
