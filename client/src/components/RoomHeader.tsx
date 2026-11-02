import { Share2, Users, LogOut, Sun, Moon, ShieldCheck, WifiOff, Fingerprint, Clock, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConnectionStatusType } from '../types';

interface Props {
  roomId: string;
  userName: string;
  userCount: number;
  connStatus: ConnectionStatusType;
  darkMode: boolean;
  hasEncryptionKey: boolean;
  hasPasskey?: boolean;
  keepAlive24h?: boolean;
  onToggleDarkMode: () => void;
  onOpenNameModal: () => void;
  onOpenShareModal: () => void;
  onOpenBiometricModal: () => void;
  onOpenLifetimeModal?: () => void;
  onLeaveRoom: () => void;
}

export function RoomHeader({
  roomId,
  userName,
  userCount,
  connStatus,
  darkMode,
  hasEncryptionKey,
  hasPasskey,
  keepAlive24h = false,
  onToggleDarkMode,
  onOpenNameModal,
  onOpenShareModal,
  onOpenBiometricModal,
  onOpenLifetimeModal,
  onLeaveRoom,
}: Props) {
  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    toast.success('Room code copied!');
  };

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-3 sm:px-4 py-2.5 gap-2 transition-colors"
      style={{
        background: 'rgba(11, 13, 19, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Status Dot */}
          <div
            className="status-dot"
            style={{
              background: connStatus === 'connected' ? 'var(--accent)' : connStatus === 'connecting' ? '#f59e0b' : '#ef4444',
              boxShadow: connStatus === 'connected' ? '0 0 8px var(--accent)' : connStatus === 'connecting' ? '0 0 6px #f59e0b' : 'none',
              animation: connStatus !== 'offline' ? 'pulse-blue 2s ease-in-out infinite' : 'none',
            }}
            title={
              connStatus === 'connected' ? '🔵 Realtime connected — sync active' :
              connStatus === 'connecting' ? '🟡 Connecting to Realtime…' :
              '🔴 Offline mode — changes saved locally to IndexedDB'
            }
            aria-label={`Connection status: ${connStatus}`}
          />
          <span className="font-bold text-sm tracking-tight" style={{ color: 'var(--text)' }}>
            SyncPad<span style={{ color: 'var(--accent)' }}>IO</span>
          </span>
        </div>

        {/* User name badge */}
        <div className="flex items-center gap-1 text-xs min-w-0">
          <button
            onClick={onOpenNameModal}
            className="btn-ghost px-1.5 py-0.5 rounded-md text-xs max-w-[65px] sm:max-w-[120px] truncate"
            style={{ background: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.2)' }}
            title="Edit your display name"
            aria-label={`Display name: ${userName || 'Set Name'}. Click to edit.`}
          >
            {userName || 'Name'}
          </button>
        </div>

        {/* Room Code with Copy */}
        <button
          onClick={copyRoomCode}
          className="font-mono text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-md transition-all active:scale-95 flex-shrink-0"
          style={{
            color: 'var(--accent)',
            background: 'rgba(56,189,248,0.1)',
            border: '1px solid rgba(56,189,248,0.25)',
            letterSpacing: '0.08em',
          }}
          title="Click to copy room code"
          aria-label={`Room code: ${roomId}. Click to copy.`}
        >
          {roomId}
        </button>

        {/* Offline indicator badge */}
        {connStatus === 'offline' && (
          <span
            className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}
            title="Offline — changes are queued locally and will sync when reconnected"
          >
            <WifiOff size={11} /> Offline Drafts
          </span>
        )}

        {/* E2EE indicator */}
        {hasEncryptionKey && (
          <span
            className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
            title="Zero-knowledge encryption key active in URL hash"
          >
            <ShieldCheck size={11} /> E2EE
          </span>
        )}

        {/* Interactive Retention status button (desktop only to keep mobile header spacious) */}
        <button
          onClick={onOpenLifetimeModal}
          className="hidden md:inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded transition-all hover:scale-105 cursor-pointer shadow-sm"
          style={{
            background: keepAlive24h ? 'rgba(56,189,248,0.12)' : 'rgba(245,158,11,0.12)',
            color: keepAlive24h ? 'var(--accent)' : '#f59e0b',
            border: keepAlive24h ? '1px solid rgba(56,189,248,0.3)' : '1px solid rgba(245,158,11,0.3)',
          }}
          title={
            keepAlive24h
              ? 'Creator 24h Safe Room active — click for info or settings'
              : 'Default Ephemeral mode active — click for info or to enable 24h retention'
          }
          aria-label="Session retention information and settings"
        >
          {keepAlive24h ? <Clock size={11} className="text-accent" /> : <Zap size={11} className="text-amber-400" />}
          <span>{keepAlive24h ? '24h Safe' : 'Ephemeral'}</span>
          <span className="text-[8px] opacity-75 font-semibold bg-white/10 px-1 rounded">Info</span>
        </button>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
        <div
          className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
          style={{ color: 'var(--text-muted)' }}
          aria-label={`${userCount} active users`}
        >
          <Users size={13} className={userCount > 1 ? 'text-emerald-400' : 'text-zinc-500'} />
          <span className="font-mono text-xs">{userCount}</span>
        </div>

        <button
          onClick={onOpenShareModal}
          className="btn-accent px-2 sm:px-2.5 py-1 text-xs flex items-center gap-1 rounded-md shadow-sm font-semibold"
          id="share-btn"
          aria-label="Share room"
        >
          <Share2 size={12} /> <span className="hidden xs:inline sm:inline">Share</span>
        </button>

        <button
          onClick={onOpenBiometricModal}
          className="hidden sm:flex btn-ghost px-2 py-1 text-xs items-center gap-1 rounded-md"
          style={{
            color: hasPasskey ? '#22c55e' : 'var(--text-muted)',
            background: hasPasskey ? 'rgba(34,197,94,0.1)' : 'transparent',
            border: hasPasskey ? '1px solid rgba(34,197,94,0.25)' : '1px solid transparent',
          }}
          title={hasPasskey ? 'Biometric Passkey active' : 'Set up Biometric Passkey lock'}
          aria-label="Biometric security settings"
        >
          <Fingerprint size={13} />
        </button>

        <button
          onClick={onToggleDarkMode}
          className="btn-ghost p-1.5 rounded-md"
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle dark/light mode"
        >
          {darkMode ? <Sun size={13} /> : <Moon size={13} />}
        </button>

        <button
          onClick={onLeaveRoom}
          className="btn-ghost p-1.5 rounded-md"
          title="Leave room"
          aria-label="Leave room"
        >
          <LogOut size={13} style={{ color: '#ef4444' }} />
        </button>
      </div>
    </header>
  );
}
