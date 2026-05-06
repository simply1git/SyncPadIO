import { useState, useEffect, useRef, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Toaster, toast } from 'react-hot-toast';
import { supabase } from './supabaseClient';
import { useRoomLifecycle } from './hooks/useRoomLifecycle';
import { uploadFileToRoom, deleteFileFromRoom } from './utils/roomUtils';
import { encryptText } from './utils/crypto';
import { SnippetCard } from './components/SnippetCard';
import { FileCard, FileData, formatSize } from './components/FileCard';
import { ShareModal } from './components/ShareModal';
import { PreviewModal } from './components/PreviewModal';
import {
  Share2, Users, Upload, LogOut,
  Plus, Lock, Unlock, ArrowRight, Zap
} from 'lucide-react';

interface Snippet { id: string; text: string; sender_id: string; timestamp: number; }
interface UploadItem { id: string; name: string; progress: number; done: boolean; error?: string; }

const genId = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const genUserId = () => Math.random().toString(36).slice(2, 10);

export default function App() {
  // ── Room state ──────────────────────────────────────────────────────────
  const [roomId, setRoomId] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [userCount, setUserCount] = useState(1);

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
  const [showShare, setShowShare] = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────
  const channelRef = useRef<RealtimeChannel | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [myUserId] = useState(genUserId);

  // ── Lifecycle hook ──────────────────────────────────────────────────────
  const onRoomDeleted = useCallback(() => {
    toast.error('Room was deleted');
    setIsJoined(false); setRoomId(''); setSnippets([]); setFiles([]);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const { updateLastActivity, deleteRoom } = useRoomLifecycle({
    roomId, userId: myUserId, onRoomDeleted
  });

  // ── URL param: auto-join if ?room=XXX ───────────────────────────────────
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('room');
    if (param) { setJoinInput(param.toUpperCase()); joinRoomRealtime(param.toUpperCase()); }
  }, []); // eslint-disable-line

  // ── joinRoomRealtime ────────────────────────────────────────────────────
  const joinRoomRealtime = async (id: string) => {
    const cleanId = id.trim().toUpperCase();
    if (!cleanId) return;
    setIsJoining(true);
    setRoomId(cleanId);
    window.history.replaceState({}, '', `?room=${cleanId}`);

    if (channelRef.current) await supabase.removeChannel(channelRef.current);

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
        setIsConnected(true);
        await ch.track({ user: myUserId, joined: Date.now() });
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setIsConnected(false);
      }
    });

    channelRef.current = ch;
    setIsJoined(true);
    setIsJoining(false);
  };

  // ── Create / Join ───────────────────────────────────────────────────────
  const createRoom = () => joinRoomRealtime(genId());
  const joinRoom = (e: React.FormEvent) => { e.preventDefault(); joinRoomRealtime(joinInput); };

  const leaveRoom = async () => {
    if (channelRef.current) { await supabase.removeChannel(channelRef.current); channelRef.current = null; }
    setIsJoined(false); setRoomId(''); setSnippets([]); setFiles([]);
    window.history.replaceState({}, '', window.location.pathname);
    toast('Left room', { icon: '👋' });
  };

  // ── Snippets ────────────────────────────────────────────────────────────
  const addSnippet = async () => {
    if (!text.trim() || !isJoined) return;
    const raw = text.trim();
    setText('');
    const now = Date.now();
    const body = encryptMode ? await encryptText(raw, roomId) : raw;
    const optimistic: Snippet = { id: `opt-${now}`, text: body, sender_id: myUserId, timestamp: now };
    setSnippets(prev => [...prev, optimistic]);
    const { data, error } = await supabase.from('snippets')
      .insert({ room_id: roomId, text: body, sender_id: myUserId, timestamp: now })
      .select().single();
    if (error) {
      toast.error('Failed to send'); setSnippets(prev => prev.filter(s => s.id !== optimistic.id)); setText(raw);
    } else if (data) {
      setSnippets(prev => prev.map(s => s.id === optimistic.id ? data as Snippet : s));
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
    try {
      const record = await uploadFileToRoom({
        roomId, file,
        onProgress: (p) => setUploads(prev => prev.map(u => u.id === uid ? { ...u, progress: p } : u))
      });
      setUploads(prev => prev.map(u => u.id === uid ? { ...u, progress: 100, done: true } : u));
      const fd = record as unknown as FileData;
      setFiles(prev => prev.find(f => f.id === fd.id) ? prev : [...prev, fd]);
      toast.success(`${file.name} uploaded`);
      setTimeout(() => setUploads(prev => prev.filter(u => u.id !== uid)), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setUploads(prev => prev.map(u => u.id === uid ? { ...u, error: msg } : u));
      toast.error(msg);
      setTimeout(() => setUploads(prev => prev.filter(u => u.id !== uid)), 4000);
    }
    updateLastActivity();
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
          style={{ background: 'linear-gradient(135deg, #16a34a, #22c55e)', boxShadow: '0 0 40px rgba(34,197,94,0.3)' }}>
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
        {/* Create room */}
        <button
          onClick={createRoom}
          disabled={isJoining}
          className="btn-accent w-full py-3.5 text-base font-semibold flex items-center justify-center gap-2 mb-4"
          id="create-room-btn"
        >
          <Plus size={18} />
          {isJoining ? 'Creating…' : 'Start New Session'}
        </button>

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

        {/* Features */}
        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: '🔒', label: 'Encrypted' },
            { icon: '⚡', label: 'Real-time' },
            { icon: '🗑️', label: 'Auto-deletes' },
          ].map(f => (
            <div key={f.label} className="py-3 px-2 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-xl mb-1">{f.icon}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{f.label}</div>
            </div>
          ))}
        </div>
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
            <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} title={isConnected ? 'Realtime connected' : 'Realtime offline'} />
            <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>SyncPad<span style={{ color: 'var(--accent)' }}>IO</span></span>
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
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT — Snippets */}
        <div className={`flex flex-col ${activeTab === 'text' ? 'flex' : 'hidden'} md:flex flex-1`}
          style={{ borderRight: '1px solid var(--border)', maxWidth: '50%' }}>

          {/* Composer */}
          <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
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
                className={`btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs ${encryptMode ? 'border-yellow-500/50' : ''}`}
                style={encryptMode ? { color: '#eab308', background: 'rgba(234,179,8,0.08)' } : {}}
                title="Toggle AES-256 encryption"
              >
                {encryptMode ? <Lock size={12} /> : <Unlock size={12} />}
                {encryptMode ? 'Encrypted' : 'Plain text'}
              </button>
              <button onClick={addSnippet} disabled={!text.trim()} className="btn-accent ml-auto px-4 py-1.5 text-sm" id="send-snippet-btn">
                Send
              </button>
            </div>
          </div>

          {/* Snippet feed */}
          <div className="flex-1 overflow-y-auto p-3">
            {snippets.length === 0 ? (
              <div className="text-center pt-12" style={{ color: 'var(--text-faint)' }}>
                <p className="text-4xl mb-3">✏️</p>
                <p className="text-sm">No snippets yet</p>
              </div>
            ) : (
              [...snippets].reverse().map(s => (
                <SnippetCard key={s.id} snippet={s} myUserId={myUserId} roomId={roomId} onDelete={deleteSnippet} />
              ))
            )}
          </div>
        </div>

        {/* RIGHT — Files */}
        <div className={`flex flex-col ${activeTab === 'files' ? 'flex' : 'hidden'} md:flex flex-1`}>

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
                  <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                    <span className="truncate">{u.name}</span>
                    <span>{u.error ? '❌' : u.done ? '✅' : `${u.progress}%`}</span>
                  </div>
                  {!u.error && (
                    <div className="progress-track" style={{ height: 4 }}>
                      <div className="progress-fill" style={{ width: `${u.progress}%` }} />
                    </div>
                  )}
                  {u.error && <p className="text-xs" style={{ color: '#ef4444' }}>{u.error}</p>}
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
                <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                  {files.length} file{files.length !== 1 ? 's' : ''} · {formatSize(files.reduce((a, f) => a + f.size, 0))} total
                </p>
                <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                  {files.map(f => (
                    <FileCard key={f.id} file={f} onDelete={deleteFile} onPreview={setPreviewFile} />
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
    </div>
  );
}
