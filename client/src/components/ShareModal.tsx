import { X, Copy, Check, Link } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useState } from 'react';
import toast from 'react-hot-toast';

interface Props {
  roomId: string;
  userCount: number;
  onClose: () => void;
}

export function ShareModal({ roomId, userCount, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(roomId);
    toast.success('Room code copied!');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box p-6" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Share Room</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {userCount} {userCount === 1 ? 'person' : 'people'} online
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2"><X size={18} /></button>
        </div>

        {/* QR Code */}
        <div className="flex justify-center mb-6">
          <div className="p-4 rounded-xl" style={{ background: '#fff' }}>
            <QRCodeCanvas value={url} size={160} level="M" />
          </div>
        </div>

        {/* Room code */}
        <div className="mb-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>ROOM CODE</p>
          <div
            className="flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            onClick={copyCode}
          >
            <span className="font-mono text-xl font-bold tracking-widest" style={{ color: 'var(--accent)' }}>
              {roomId}
            </span>
            <Copy size={16} style={{ color: 'var(--text-muted)' }} />
          </div>
        </div>

        {/* Full URL */}
        <div className="mb-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>SHARE LINK</p>
          <div className="flex gap-2">
            <div
              className="flex-1 px-3 py-2 rounded-lg text-sm font-mono truncate"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            >
              {url}
            </div>
            <button onClick={copyLink} className="btn-accent px-3 py-2 flex items-center gap-2 text-sm">
              {copied ? <Check size={14} /> : <Link size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <p className="text-xs text-center" style={{ color: 'var(--text-faint)' }}>
          Room auto-deletes after 1 hour of inactivity
        </p>
      </div>
    </div>
  );
}
