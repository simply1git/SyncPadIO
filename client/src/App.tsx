import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Toaster, toast } from 'react-hot-toast';
import { supabase } from './supabaseClient';
import { useRoomLifecycle } from './hooks/useRoomLifecycle';
import { uploadFileToRoom, deleteFileFromRoom } from './utils/roomUtils';
import { encryptText, isEncrypted } from './utils/crypto';
import { startKeepAliveService } from './utils/keepAlive';
import { downloadFilesAsZip, downloadFilesSequential } from './utils/zipDownload';
import { SnippetCard } from './components/SnippetCard';
import { FileCard, FileData, formatSize } from './components/FileCard';
import { ShareModal } from './components/ShareModal';
import { PreviewModal } from './components/PreviewModal';
import {
  Share2, Users, Upload, LogOut,
  Plus, Lock, Unlock, ArrowRight, Zap,
  Sun, Moon, Search, ClipboardList, Download, X
} from 'lucide-react';

interface Snippet { id: string; text: string; sender_id: string; timestamp: number; sender_name?: string; }
interface UploadItem { id: string; name: string; progress: number; done: boolean; error?: string; cancelled?: boolean; }

const genId = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const genUserId = () => Math.random().toString(36).slice(2, 10);

// Get or create persistent user ID
const getPersistentUserId = (): string => {
  const STORAGE_KEY = 'syncpad_user_id';
  let userId = localStorage.getItem(STORAGE_KEY);
  if (!userId) {
    userId = genUserId();
    localStorage.setItem(STORAGE_KEY, userId);
  }
  return userId;
};

export default function App() {
  // ── Room state ──────────────────────────────────────────────────────────
  const [roomId, setRoomId] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  // 'connecting' | 'connected' | 'offline'
  const [connStatus, setConnStatus] = useState<'connecting'|'connected'|'offline'>('connecting');
  const [userCount, setUserCount] = useState(1);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Content ─────────────────────────────────────────────────────────────
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [files, setFiles] = useState<FileData[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  // ── Input ───────────────────────────────────────────────────────────────
  const [text, setText] = useState('');
  const [encryptMode, setEncryptMode] = useState(false);
  const [joinInput, setJoinInput] = useState('');
  const [activeTab, setActiveTab] = useState<'text' | 'files'>('text');

  // ── UI ──────────────────────────────────────────────────────────────────
  const [dragActive, setDragActive] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [showShare, setShowShare] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<{type: 'zip'|'individual', current: number, total: number} | null>(null);
  const [userName, setUserName] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [customRoomCode, setCustomRoomCode] = useState('');
  const [showCustomCodeInput, setShowCustomCodeInput] = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────
  const channelRef = useRef<RealtimeChannel | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Map of uploadId → abort function for cancellation
  const abortMapRef = useRef<Map<string, () => void>>(new Map());
  const downloadAbortRef = useRef<AbortController | null>(null);
  const [myUserId] = useState(getPersistentUserId);

  // ── Lifecycle hook ──────────────────────────────────────────────────────
  const onRoomDeleted = useCallback(() => {
    toast.error('Room was deleted');
    setIsJoined(false); setRoomId(''); setSnippets([]); setFiles([]);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  // ── Dark/light mode sync ────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', !darkMode);
  }, [darkMode]);

  // ── Filtered snippets (search) ──────────────────────────────────────────
  const filteredSnippets = useMemo(() => {
    if (!searchQuery.trim()) return snippets;
    const q = searchQuery.toLowerCase();
    return snippets.filter(s =>
      isEncrypted(s.text) || s.text.toLowerCase().includes(q)
    );
  }, [snippets, searchQuery]);

  const { updateLastActivity, deleteRoom } = useRoomLifecycle({
    roomId, userId: myUserId, onRoomDeleted
  });

  // ── URL param: auto-join if ?room=XXX ───────────────────────────────────
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('room');
    if (param) { setJoinInput(param.toUpperCase()); joinRoomRealtime(param.toUpperCase()); }
  }, []); // eslint-disable-line

  // ── Keep-Alive Service ──────────────────────────────────────────────────
  useEffect(() => {
    const cleanup = startKeepAliveService();
    return cleanup; // Cleanup on unmount
  }, []); // eslint-disable-line

  // ── joinRoomRealtime ────────────────────────────────────────────────────
  const joinRoomRealtime = async (id: string) => {
    const cleanId = id.trim().toUpperCase();
    if (!cleanId) return;
    setIsJoining(true);
    setRoomId(cleanId);
    window.history.replaceState({}, '', `?room=${cleanId}`);

    if (channelRef.current) await supabase.removeChannel(channelRef.current);

    // Ensure room exists in database
    const now = Date.now();
    await supabase.from('rooms').upsert({
      id: cleanId,
      created_at: now,
      last_activity: now,
      status: 'active'
    }, { onConflict: 'id' });

    const [snippetRes, fileRes] = await Promise.all([
      supabase.from('snippets').select('*').eq('room_id', cleanId).order('timestamp'),
      supabase.from('files').select('*').eq('room_id', cleanId).order('timestamp'),
    ]);
    if (snippetRes.data) setSnippets(snippetRes.data as Snippet[]);
    if (fileRes.data) setFiles(fileRes.data as FileData[]);

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
        cleanupTimerRef.current = setTimeout(() => deleteRoom(), 30_000);
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setConnStatus('connected');
        if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
        await ch.track({ user: myUserId, joined: Date.now() });
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setConnStatus('offline');
        // Auto-reconnect after 5s
        reconnectTimerRef.current = setTimeout(() => {
          if (channelRef.current) {
            setConnStatus('connecting');
            channelRef.current.subscribe();
          }
        }, 5000);
      }
    });

    channelRef.current = ch;
    setConnStatus('connecting');
    setIsJoined(true);
    setIsJoining(false);
    // Request browser notification permission (for background tab alerts)
    if (Notification.permission === 'default') Notification.requestPermission();
  };

  // ── Get or create persistent user name ──────────────────────────────────
  const getPersistentUserName = (): string => {
    const STORAGE_KEY = 'syncpad_user_name';
    const name = localStorage.getItem(STORAGE_KEY);
    return name || '';
  };

  const saveUserName = (name: string) => {
    localStorage.setItem('syncpad_user_name', name);
    setUserName(name);
  };

  // Initialize user name from localStorage on mount
  useEffect(() => {
    setUserName(getPersistentUserName());
  }, []);

  // ── Create / Join ───────────────────────────────────────────────────────
  const createRoom = () => {
    if (!userName.trim()) {
      setShowNameModal(true);
      return;
    }
    joinRoomRealtime(genId());
  };

  const createRoomWithCustomCode = () => {
    if (!customRoomCode.trim()) {
      toast.error('Please enter a room code');
      return;
    }
    if (!userName.trim()) {
      setShowNameModal(true);
      return;
    }
    joinRoomRealtime(customRoomCode.toUpperCase());
    setCustomRoomCode('');
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) {
      setShowNameModal(true);
      return;
    }
    joinRoomRealtime(joinInput);
  };

  const leaveRoom = async () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (channelRef.current) { await supabase.removeChannel(channelRef.current); channelRef.current = null; }
    setIsJoined(false); setRoomId(''); setSnippets([]); setFiles([]);
    setConnStatus('connecting');
    window.history.replaceState({}, '', window.location.pathname);
    toast('Left room', { icon: '👋' });
  };

  const handleSetUserName = (name: string) => {
    if (!name.trim()) {
      toast.error('Name cannot be empty');
      return;
    }
    saveUserName(name);
    setShowNameModal(false);
  };

  // ── Snippets ────────────────────────────────────────────────────────────
  const addSnippet = async () => {
    if (!text.trim() || !isJoined) return;
    const raw = text.trim();
    setText('');
    const now = Date.now();
    const body = encryptMode ? await encryptText(raw, roomId) : raw;
    const optimistic: Snippet = { id: `opt-${now}`, text: body, sender_id: myUserId, timestamp: now, sender_name: userName };
    setSnippets(prev => [...prev, optimistic]);
    const { data, error } = await supabase.from('snippets')
      .insert({ room_id: roomId, text: body, sender_id: myUserId, timestamp: now, sender_name: userName })
      .select().single();
    if (error) {
      console.error('Snippet send error:', error);
      toast.error(`Failed to send: ${error.message || 'Unknown error'}`);
      setSnippets(prev => prev.filter(s => s.id !== optimistic.id));
      setText(raw);
    } else if (data) {
      setSnippets(prev => prev.map(s => s.id === optimistic.id ? data as Snippet : s));
      // Notify if tab is in background
      if (document.hidden && Notification.permission === 'granted') {
        new Notification('SyncPadIO', { body: 'New snippet received', icon: '/icon.svg' });
      }
    }
    updateLastActivity();
  };

  const deleteSnippet = async (id: string) => {
    setSnippets(prev => prev.filter(s => s.id !== id));
    await supabase.from('snippets').delete().eq('id', id);
    updateLastActivity();
  };

  // ── Files ───────────────────────────────────────────────────────────────
  const uploadFile = async (file: File) => {
    const uid = `${Date.now()}-${file.name}`;
    setUploads(prev => [...prev, { id: uid, name: file.name, progress: 0, done: false }]);
    const { promise, abort } = uploadFileToRoom({
      roomId, file, uploaderName: userName,
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
    updateLastActivity();
  };

  const cancelUpload = (uid: string) => {
    abortMapRef.current.get(uid)?.();
    abortMapRef.current.delete(uid);
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList).forEach(uploadFile);
  };

  const deleteFile = async (id: string, url: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    const path = url.split('/uploads/')[1];
    if (path) { try { await deleteFileFromRoom(id, path); } catch { /* ignore */ } }
    updateLastActivity();
    toast.success('File deleted');
    // Remove from selection if it was selected
    setSelectedFileIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const selectAllFiles = () => {
    setSelectedFileIds(new Set(files.map(f => f.id)));
  };

  const deselectAllFiles = () => {
    setSelectedFileIds(new Set());
  };

  const cancelDownload = () => {
    if (downloadAbortRef.current) {
      downloadAbortRef.current.abort();
      setDownloadProgress(null);
      downloadAbortRef.current = null;
      toast.error('Download cancelled');
    }
  };

  const downloadSelectedFilesAsZip = async () => {
    if (selectedFileIds.size === 0) {
      toast.error('No files selected');
      return;
    }

    const selectedFiles = files.filter(f => selectedFileIds.has(f.id));
    downloadAbortRef.current = new AbortController();
    setDownloadProgress({ type: 'zip', current: 0, total: selectedFiles.length });
    
    try {
      await downloadFilesAsZip(
        selectedFiles.map(f => ({ name: f.name, url: f.url })),
        `SyncPadIO-${roomId}`,
        (current, total) => {
          setDownloadProgress({ type: 'zip', current, total });
        },
        downloadAbortRef.current.signal
      );
      toast.success('Download started!');
      setSelectedFileIds(new Set());
      updateLastActivity();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      if (msg !== 'Download cancelled') {
        toast.error(msg);
      }
    } finally {
      setDownloadProgress(null);
      downloadAbortRef.current = null;
    }
  };

  const downloadSelectedFilesIndividual = async () => {
    if (selectedFileIds.size === 0) {
      toast.error('No files selected');
      return;
    }

    const selectedFiles = files.filter(f => selectedFileIds.has(f.id));
    downloadAbortRef.current = new AbortController();
    setDownloadProgress({ type: 'individual', current: 0, total: selectedFiles.length });
    
    try {
      await downloadFilesSequential(
        selectedFiles.map(f => ({ name: f.name, url: f.url })),
        (current, total) => {
          setDownloadProgress({ type: 'individual', current, total });
        },
        downloadAbortRef.current.signal
      );
      toast.success('Downloads started!');
      setSelectedFileIds(new Set());
      updateLastActivity();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      if (msg !== 'Download cancelled') {
        toast.error(msg);
      }
    } finally {
      setDownloadProgress(null);
      downloadAbortRef.current = null;
    }
  };

  const downloadAllFiles = async () => {
    selectAllFiles();
    // Small delay to ensure state updates
    setTimeout(() => downloadSelectedFilesAsZip(), 0);
  };

  // ── Drag & drop ─────────────────────────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragActive(true); };
  const onDragLeave = () => setDragActive(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false);
    handleFiles(e.dataTransfer.files);
    setActiveTab('files');
  };

  // ── Keyboard shortcut: Ctrl+Enter to send ──────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addSnippet(); }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // HOME SCREEN
  // ══════════════════════════════════════════════════════════════════════════
  if (!isJoined) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'var(--bg)' }}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1a1a1a', color: '#f5f5f5', border: '1px solid #262626' } }} />

      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
          style={{ background: 'linear-gradient(135deg, var(--accent-deep), var(--accent))', boxShadow: '0 0 40px rgba(96,165,250,0.35)' }}>
          <Zap size={32} color="#000" fill="#000" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--text)', letterSpacing: '-0.03em' }}>
          SyncPad<span style={{ color: 'var(--accent)' }}>IO</span>
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          Real-time · Encrypted · Ephemeral
        </p>
      </div>

      <div className="w-full" style={{ maxWidth: 400 }}>
        {/* Your Name */}
        <div className="mb-5">
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>YOUR NAME</p>
          <input
            id="user-name-input"
            className="input-dark w-full px-4 py-3 text-base"
            placeholder="Enter your name"
            value={userName}
            onChange={e => setUserName(e.target.value)}
            maxLength={30}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>Others will see this name with your messages</p>
        </div>

        {/* Create room */}
        <button
          onClick={createRoom}
          disabled={isJoining}
          className="btn-accent w-full py-3.5 text-base font-semibold flex items-center justify-center gap-2 mb-3"
          id="create-room-btn"
        >
          <Plus size={18} />
          {isJoining ? 'Creating…' : 'Create New Session'}
        </button>

        {/* Toggle custom code button */}
        <button
          onClick={() => setShowCustomCodeInput(!showCustomCodeInput)}
          className="btn-ghost w-full py-2 text-xs font-medium mb-3 text-center"
          style={{ color: 'var(--accent)' }}
        >
          {showCustomCodeInput ? '✕ Cancel' : '+ Create Your Own Code'}
        </button>

        {/* Create with custom code - conditional */}
        {showCustomCodeInput && (
          <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>ENTER CUSTOM CODE</p>
            <form onSubmit={(e) => { e.preventDefault(); createRoomWithCustomCode(); }} className="flex gap-2">
              <input
                id="custom-code-input"
                className="input-dark flex-1 px-3 py-2 font-mono text-sm uppercase tracking-widest"
                placeholder="MYCODE"
                value={customRoomCode}
                onChange={e => setCustomRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                maxLength={8}
                autoFocus
              />
              <button type="submit" disabled={!customRoomCode || isJoining} className="btn-accent px-3 py-2">
                Create
              </button>
            </form>
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>or join existing</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>

        {/* Join room */}
        <form onSubmit={joinRoom} className="flex gap-2">
          <input
            id="join-room-input"
            className="input-dark flex-1 px-4 py-3 font-mono text-lg uppercase tracking-widest"
            placeholder="ROOM CODE"
            value={joinInput}
            onChange={e => setJoinInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
            maxLength={8}
          />
          <button type="submit" disabled={!joinInput || isJoining} className="btn-accent px-4 py-3">
            <ArrowRight size={20} />
          </button>
        </form>

      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // ROOM SCREEN
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1a1a1a', color: '#f5f5f5', border: '1px solid #262626' } }} />

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 gap-3"
        style={{ background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {/* 3-state status dot: yellow=connecting, blue=live, red=offline */}
            <div
              className="status-dot"
              style={{
                background: connStatus === 'connected' ? 'var(--accent)' : connStatus === 'connecting' ? '#f59e0b' : '#ef4444',
                boxShadow: connStatus === 'connected' ? '0 0 8px var(--accent)' : connStatus === 'connecting' ? '0 0 6px #f59e0b' : 'none',
                animation: connStatus !== 'offline' ? 'pulse-blue 2s ease-in-out infinite' : 'none',
              }}
              title={
                connStatus === 'connected' ? '🔵 Realtime live — cross-device sync active' :
                connStatus === 'connecting' ? '🟡 Connecting to Realtime…' :
                '🔴 Realtime offline — changes save but won\'t sync live'
              }
            />
            <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>SyncPad<span style={{ color: 'var(--accent)' }}>IO</span></span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setShowNameModal(true)}
              className="btn-ghost px-2 py-1 rounded-md text-xs"
              style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}
              title="Edit your name"
            >
              {userName || 'Set Name'}
            </button>
            <span style={{ color: 'var(--text-faint)' }}>•</span>
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(roomId); toast.success('Room code copied!'); }}
            className="font-mono text-sm font-bold px-2 py-1 rounded-md"
            style={{ color: 'var(--accent)', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', letterSpacing: '0.12em' }}
            title="Click to copy room code"
          >
            {roomId}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Users size={14} /><span>{userCount}</span>
          </div>
          <button onClick={() => setShowShare(true)} className="btn-ghost px-3 py-1.5 text-sm flex items-center gap-1.5" id="share-btn">
            <Share2 size={14} /> Share
          </button>
          <button onClick={() => setDarkMode(v => !v)} className="btn-ghost p-1.5" title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={leaveRoom} className="btn-ghost p-1.5" title="Leave room">
            <LogOut size={16} style={{ color: '#ef4444' }} />
          </button>
        </div>
      </header>

      {/* ── Tab bar (mobile) ── */}
      <div className="flex gap-1 p-2 md:hidden" style={{ borderBottom: '1px solid var(--border)' }}>
        <button className={`tab-btn ${activeTab === 'text' ? 'active' : ''}`} onClick={() => setActiveTab('text')}>✏️ Snippets</button>
        <button className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>📁 Files {files.length > 0 && `(${files.length})`}</button>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* LEFT — Snippets */}
        <div className={`${activeTab === 'text' ? 'flex' : 'hidden'} md:flex flex-col flex-1 overflow-hidden`}
          style={{ borderRight: '1px solid var(--border)' }}>

          {/* Composer */}
          <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
            {/* Search bar */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <Search size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              <input
                className="input-dark flex-1 px-2 py-1 text-xs"
                placeholder="Search snippets…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {snippets.length > 0 && (
                <button
                  className="btn-ghost flex items-center gap-1 px-2 py-1 text-xs"
                  title="Copy all snippets"
                  onClick={() => {
                    const all = snippets.filter(s => !isEncrypted(s.text)).map(s => s.text).join('\n---\n');
                    navigator.clipboard.writeText(all);
                    toast.success('All snippets copied!');
                  }}
                >
                  <ClipboardList size={12} /> All
                </button>
              )}
            </div>
            <textarea
              id="snippet-input"
              className="textarea-dark w-full p-3"
              rows={4}
              placeholder="Paste code, text, commands… (Ctrl+Enter to send)"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setEncryptMode(v => !v)}
                className={`btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs`}
                style={encryptMode ? { color: '#f59e0b', background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.4)' } : {}}
                title="Toggle AES-256 encryption"
              >
                {encryptMode ? <Lock size={12} /> : <Unlock size={12} />}
                {encryptMode ? 'Encrypted' : 'Plain text'}
              </button>
              <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                {encryptMode ? '🔒 Only people in this room can decrypt' : '👁️ Visible to anyone with the room code'}
              </span>
              <button onClick={addSnippet} disabled={!text.trim()} className="btn-accent ml-auto px-4 py-1.5 text-sm" id="send-snippet-btn">
                Send
              </button>
            </div>
          </div>

          {/* Snippet feed */}
          <div className="flex-1 overflow-y-auto p-3">
            {filteredSnippets.length === 0 && snippets.length > 0 ? (
              <div className="text-center pt-8" style={{ color: 'var(--text-faint)' }}>
                <p className="text-sm">No snippets match "{searchQuery}"</p>
              </div>
            ) : filteredSnippets.length === 0 ? (
              <div className="text-center pt-12" style={{ color: 'var(--text-faint)' }}>
                <p className="text-4xl mb-3">✏️</p>
                <p className="text-sm">No snippets yet</p>
              </div>
            ) : (
              [...filteredSnippets].reverse().map(s => (
                <SnippetCard key={s.id} snippet={s} myUserId={myUserId} roomId={roomId} onDelete={deleteSnippet} />
              ))
            )}
          </div>
        </div>

        {/* RIGHT — Files */}
        <div className={`${activeTab === 'files' ? 'flex' : 'hidden'} md:flex flex-col flex-1 overflow-hidden`}>

          {/* Drop zone */}
          <div
            className={`m-3 rounded-xl border-2 border-dashed flex items-center justify-center gap-3 cursor-pointer transition-all ${dragActive ? 'drag-active' : ''}`}
            style={{ padding: '20px', borderColor: dragActive ? 'var(--accent)' : 'var(--border)', minHeight: 80, background: dragActive ? 'var(--accent-glow)' : 'transparent' }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={20} style={{ color: dragActive ? 'var(--accent)' : 'var(--text-muted)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: dragActive ? 'var(--accent)' : 'var(--text)' }}>
                {dragActive ? 'Drop to upload' : 'Click or drag files here'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Max 50 MB per file</p>
            </div>
          </div>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />

          {/* Upload progress items */}
          {uploads.length > 0 && (
            <div className="px-3 mb-2 space-y-2">
              {uploads.map(u => (
                <div key={u.id} className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex justify-between items-center text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                    <span className="truncate flex-1 mr-2">{u.name}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span>{u.error ? '❌' : u.done ? '✅' : `${u.progress}%`}</span>
                      {/* Cancel button — only show while uploading */}
                      {!u.done && !u.error && !u.cancelled && (
                        <button
                          onClick={() => cancelUpload(u.id)}
                          className="flex items-center justify-center w-5 h-5 rounded-full hover:bg-red-500/20 transition-colors"
                          style={{ color: '#ef4444' }}
                          title="Cancel upload"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  {!u.error && (
                    <div className="progress-track" style={{ height: 4 }}>
                      <div className="progress-fill" style={{ width: `${u.progress}%` }} />
                    </div>
                  )}
                  {u.error && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{u.error}</p>}
                </div>
              ))}
            </div>
          )}

          {/* File grid */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {files.length === 0 ? (
              <div className="text-center pt-12" style={{ color: 'var(--text-faint)' }}>
                <p className="text-4xl mb-3">📁</p>
                <p className="text-sm">No files yet</p>
                <p className="text-xs mt-1">Total: {formatSize(files.reduce((a, f) => a + f.size, 0))}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {files.length} file{files.length !== 1 ? 's' : ''} · {formatSize(files.reduce((a, f) => a + f.size, 0))} total
                  </p>
                </div>

                {selectedFileIds.size > 0 && (
                  <div className="mb-3 p-3 rounded-lg" style={{ background: 'var(--accent-glow)', border: '1px solid var(--accent)' }}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                          {downloadProgress ? (
                            <>
                              {downloadProgress.current} of {downloadProgress.total} {downloadProgress.type === 'zip' ? 'files preparing' : 'files downloading'}...
                            </>
                          ) : (
                            `${selectedFileIds.size} of ${files.length} selected`
                          )}
                        </p>
                        {!downloadProgress && (
                          <button
                            onClick={deselectAllFiles}
                            className="btn-ghost px-2 py-1 text-xs"
                            title="Clear selection"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {downloadProgress ? (
                          <button
                            onClick={cancelDownload}
                            className="btn-accent flex items-center gap-1 px-2 py-1 text-xs"
                            style={{ background: '#ef4444' }}
                            title="Cancel download"
                          >
                            <X size={12} />
                            Cancel
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={downloadSelectedFilesAsZip}
                              className="btn-accent flex items-center gap-1 px-2 py-1 text-xs"
                              title="Download selected files as zip"
                            >
                              <Download size={12} />
                              Zip
                            </button>
                            <button
                              onClick={downloadSelectedFilesIndividual}
                              className="btn-accent flex items-center gap-1 px-2 py-1 text-xs"
                              title="Download selected files individually"
                            >
                              <Download size={12} />
                              Individual
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {files.length > 0 && selectedFileIds.size === 0 && (
                  <div className="mb-3 flex items-center gap-2">
                    <button
                      onClick={selectAllFiles}
                      className="btn-ghost px-2 py-1 text-xs"
                      title="Select all files"
                    >
                      Select All
                    </button>
                    <button
                      onClick={downloadAllFiles}
                      className="btn-accent flex items-center gap-1 px-2 py-1 text-xs"
                      title="Download all files as zip"
                    >
                      <Download size={12} />
                      Download All (Zip)
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                  {files.map(f => (
                    <FileCard
                      key={f.id}
                      file={f}
                      selected={selectedFileIds.has(f.id)}
                      onSelect={toggleFileSelection}
                      onDelete={deleteFile}
                      onPreview={setPreviewFile}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showShare && <ShareModal roomId={roomId} userCount={userCount} onClose={() => setShowShare(false)} />}
      {previewFile && <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
      
      {/* Name modal */}
      {showNameModal && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowNameModal(false)}
        >
          <div
            className="rounded-xl p-6 w-full"
            style={{ maxWidth: 400, background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>Enter Your Name</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              This name will appear with all your messages and files
            </p>
            <input
              id="modal-name-input"
              type="text"
              className="input-dark w-full px-4 py-3 mb-4"
              placeholder="Your name"
              value={userName}
              onChange={e => setUserName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleSetUserName(userName);
                }
              }}
              maxLength={30}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowNameModal(false)}
                className="btn-ghost flex-1 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSetUserName(userName)}
                className="btn-accent flex-1 py-2 text-sm font-semibold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
