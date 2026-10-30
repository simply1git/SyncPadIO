import { Share2, Users, LogOut, Sun, Moon, ShieldCheck, WifiOff, Fingerprint, Clock } from 'lucide-react';
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
  onToggleDarkMode: () => void;
  onOpenNameModal: () => void;
  onOpenShareModal: () => void;
  onOpenBiometricModal: () => void;
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
  onToggleDarkMode,
  onOpenNameModal,
  onOpenShareModal,
  onOpenBiometricModal,
  onLeaveRoom,
}: Props) {
  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    toast.success('Room code copied!');
  };

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 gap-3"
      style={{ background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
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
          <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>
            SyncPad<span style={{ color: 'var(--accent)' }}>IO</span>
          </span>
        </div>

        {/* User name badge */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={onOpenNameModal}
            className="btn-ghost px-2 py-1 rounded-md text-xs"
            style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}
            title="Edit your display name"
            aria-label={`Display name: ${userName || 'Set Name'}. Click to edit.`}
          >
            {userName || 'Set Name'}
          </button>
          <span style={{ color: 'var(--text-faint)' }}>•</span>
        </div>

        {/* Room Code with Copy */}
        <button
          onClick={copyRoomCode}
          className="font-mono text-sm font-bold px-2.5 py-1 rounded-md transition-opacity hover:opacity-80"
          style={{ color: 'var(--accent)', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', letterSpacing: '0.12em' }}
          title="Click to copy room code"
          aria-label={`Room code: ${roomId}. Click to copy.`}
        >
          {roomId}
        </button>

        {/* Offline indicator badge */}
        {connStatus === 'offline' && (
          <span
            className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded"
            style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}
            title="Offline — changes are queued locally and will sync when reconnected"
          >
            <WifiOff size={11} /> Offline Drafts
          </span>
        )}

        {/* E2EE indicator */}
        {hasEncryptionKey && (
          <span
            className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
            title="Zero-knowledge encryption key active in URL hash"
          >
            <ShieldCheck size={12} /> E2EE
          </span>
        )}

        {/* 24h Safe Expiry badge */}
        <span
          className="hidden md:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded"
          style={{ background: 'rgba(96,165,250,0.12)', color: 'var(--accent)' }}
          title="Safe 24-hour session — preserved for 24h of inactivity; resets on every action"
        >
          <Clock size={11} /> 24h Safe
        </span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }} aria-label={`${userCount} active users`}>
          <Users size={14} /><span>{userCount}</span>
        </div>

        <button
          onClick={onOpenShareModal}
          className="btn-ghost px-3 py-1.5 text-sm flex items-center gap-1.5"
          id="share-btn"
          aria-label="Share room"
        >
          <Share2 size={14} /> Share
        </button>

        <button
          onClick={onOpenBiometricModal}
          className="btn-ghost px-2.5 py-1.5 text-xs flex items-center gap-1.5 rounded-lg"
          style={{
            color: hasPasskey ? '#22c55e' : 'var(--text-muted)',
            background: hasPasskey ? 'rgba(34,197,94,0.1)' : 'transparent',
            border: hasPasskey ? '1px solid rgba(34,197,94,0.25)' : '1px solid transparent',
          }}
          title={hasPasskey ? 'Biometric Passkey active (Click to lock or manage)' : 'Set up Biometric Passkey lock'}
          aria-label="Biometric security settings"
        >
          <Fingerprint size={15} />
          <span className="hidden md:inline">{hasPasskey ? 'Protected' : 'Passkey'}</span>
        </button>

        <button
          onClick={onToggleDarkMode}
          className="btn-ghost p-1.5"
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle dark/light mode"
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <button
          onClick={onLeaveRoom}
          className="btn-ghost p-1.5"
          title="Leave room"
          aria-label="Leave room"
        >
          <LogOut size={16} style={{ color: '#ef4444' }} />
        </button>
      </div>
    </header>
  );
}
