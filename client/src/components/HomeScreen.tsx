import React, { useState, useEffect } from 'react';
import { Plus, ArrowRight, Zap, Fingerprint, Clock } from 'lucide-react';
import { extractRoomCode } from '../utils/helpers';

interface Props {
  userName: string;
  onUpdateUserName: (name: string) => void;
  onCreateRoom: (keep24h: boolean) => void;
  onCreateCustomRoom: (code: string, keep24h: boolean) => void;
  onJoinRoom: (code: string) => void;
  isJoining: boolean;
}

export function HomeScreen({
  userName,
  onUpdateUserName,
  onCreateRoom,
  onCreateCustomRoom,
  onJoinRoom,
  isJoining,
}: Props) {
  const [joinInput, setJoinInput] = useState('');
  const [customRoomCode, setCustomRoomCode] = useState('');
  const [showCustomCodeInput, setShowCustomCodeInput] = useState(false);
  const [keep24h, setKeep24h] = useState(false);
  const [passkeyRooms, setPasskeyRooms] = useState<string[]>([]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      const rooms: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('syncpad_passkey_')) {
          rooms.push(k.replace('syncpad_passkey_', ''));
        }
      }
      setPasskeyRooms(rooms);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = extractRoomCode(joinInput);
    if (clean) onJoinRoom(clean);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = extractRoomCode(customRoomCode);
    if (clean) {
      onCreateCustomRoom(clean, keep24h);
      setCustomRoomCode('');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
      {/* Brand Header */}
      <div className="mb-8 text-center">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
          style={{ background: 'linear-gradient(135deg, var(--accent-deep), var(--accent))', boxShadow: '0 0 40px rgba(96,165,250,0.35)' }}
        >
          <Zap size={32} color="#000" fill="#000" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--text)', letterSpacing: '-0.03em' }}>
          SyncPad<span style={{ color: 'var(--accent)' }}>IO</span>
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          Real-time · Zero-Knowledge Encrypted · Ephemeral
        </p>
      </div>

      <div className="w-full" style={{ maxWidth: 400 }}>
        {/* Your Name */}
        <div className="mb-5">
          <label htmlFor="user-name-input" className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
            YOUR NAME
          </label>
          <input
            id="user-name-input"
            className="input-dark w-full px-4 py-3 text-base"
            placeholder="Enter your name"
            value={userName}
            onChange={e => onUpdateUserName(e.target.value)}
            maxLength={30}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
            Visible to peers in active rooms
          </p>
        </div>

        {/* Creator Session Retention Options */}
        <div className="mb-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            <span>SESSION LIFETIME</span>
            <span className="text-[11px] text-accent font-normal">Creator can change anytime</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Ephemeral Option (Default) */}
            <button
              type="button"
              onClick={() => setKeep24h(false)}
              className={`p-3 rounded-xl text-left border transition-all ${
                !keep24h
                  ? 'ring-2 ring-amber-400/50 bg-amber-500/10 border-amber-400/80'
                  : 'border-border opacity-70 hover:opacity-100'
              }`}
              style={{ background: !keep24h ? 'rgba(245, 158, 11, 0.08)' : 'var(--surface)' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <Zap size={14} /> Ephemeral
                </span>
                {!keep24h && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300">
                    DEFAULT
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-tight" style={{ color: 'var(--text-muted)' }}>
                Auto-purged when empty or after 1h idle
              </p>
            </button>

            {/* 24-Hour Option (Creator Feature) */}
            <button
              type="button"
              onClick={() => setKeep24h(true)}
              className={`p-3 rounded-xl text-left border transition-all ${
                keep24h
                  ? 'ring-2 ring-accent/50 bg-sky-500/10 border-accent/80'
                  : 'border-border opacity-70 hover:opacity-100'
              }`}
              style={{ background: keep24h ? 'rgba(96, 165, 250, 0.08)' : 'var(--surface)' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 text-xs font-bold text-accent">
                  <Clock size={14} /> 24h Safe
                </span>
                {keep24h && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-accent/20 text-sky-300">
                    SELECTED
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-tight" style={{ color: 'var(--text-muted)' }}>
                Preserved for 24h even after users leave
              </p>
            </button>
          </div>
        </div>

        {/* Create room button */}
        <button
          onClick={() => onCreateRoom(keep24h)}
          disabled={isJoining}
          className="btn-accent w-full py-3.5 text-base font-semibold flex items-center justify-center gap-2 mb-3"
          id="create-room-btn"
          aria-label="Create New Session"
        >
          <Plus size={18} />
          {isJoining ? 'Creating…' : 'Create New Session'}
        </button>

        {/* Toggle custom code */}
        <button
          onClick={() => setShowCustomCodeInput(v => !v)}
          className="btn-ghost w-full py-2 text-xs font-medium mb-3 text-center"
          style={{ color: 'var(--accent)' }}
          aria-expanded={showCustomCodeInput}
        >
          {showCustomCodeInput ? '✕ Cancel' : '+ Create Your Own Code'}
        </button>

        {/* Custom code form */}
        {showCustomCodeInput && (
          <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <label htmlFor="custom-code-input" className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
              ENTER CUSTOM CODE
            </label>
            <form onSubmit={handleCustomSubmit} className="flex gap-2">
              <input
                id="custom-code-input"
                className="input-dark flex-1 px-3 py-2 font-mono text-sm uppercase tracking-widest"
                placeholder="MYCODE"
                value={customRoomCode}
                onChange={e => setCustomRoomCode(extractRoomCode(e.target.value))}
                maxLength={12}
                autoFocus
              />
              <button
                type="submit"
                disabled={!customRoomCode || isJoining}
                className="btn-accent px-4 py-2 text-sm font-semibold"
              >
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

        {/* Join room form */}
        <form onSubmit={handleJoinSubmit} className="flex gap-2">
          <input
            id="join-room-input"
            className="input-dark flex-1 px-4 py-3 font-mono text-lg uppercase tracking-widest"
            placeholder="ROOM CODE"
            value={joinInput}
            onChange={e => setJoinInput(extractRoomCode(e.target.value))}
            maxLength={12}
            aria-label="Room Code"
          />
          <button
            type="submit"
            disabled={!joinInput || isJoining}
            className="btn-accent px-4 py-3"
            aria-label="Join Room"
          >
            <ArrowRight size={20} />
          </button>
        </form>

        {/* Passkey-Secured Rooms on this Device */}
        {passkeyRooms.length > 0 && (
          <div className="mt-5 p-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
              <Fingerprint size={14} className="text-emerald-400" />
              <span>Biometric-Protected Sessions</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {passkeyRooms.map((code) => (
                <button
                  key={code}
                  onClick={() => onJoinRoom(code)}
                  className="font-mono text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all hover:scale-105"
                  style={{
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.25)',
                    color: '#22c55e',
                  }}
                  title={`Enter room ${code} with biometric protection`}
                >
                  <Fingerprint size={12} />
                  <span>{code}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

