import { useEffect, useState } from 'react';
import { X, Copy, Check, Link, ShieldCheck, Globe } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import toast from 'react-hot-toast';
import { generateShareUrl } from '../utils/crypto';

interface Props {
  roomId: string;
  userCount: number;
  encryptionKey?: string;
  onClose: () => void;
}

export function ShareModal({ roomId, userCount, encryptionKey, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const url = generateShareUrl(roomId, encryptionKey);
  const currentHost = typeof window !== 'undefined' ? window.location.host : 'syncpad.io';

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Share link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(roomId);
    toast.success('Room code copied!');
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Share Room"
    >
      <div className="modal-box p-6" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Share Session</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {userCount} {userCount === 1 ? 'person' : 'people'} online
            </p>
          </div>
          <button onClick={onClose} aria-label="Close share dialog" className="btn-ghost p-2"><X size={18} /></button>
        </div>

        {/* E2EE indicator badge */}
        {encryptionKey && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg mb-4 text-xs font-medium"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
            <ShieldCheck size={14} />
            <span>Zero-Knowledge E2EE Link — Key embedded in URL hash</span>
          </div>
        )}

        {/* QR Code */}
        <div className="flex justify-center mb-5">
          <div className="p-4 rounded-xl" style={{ background: '#fff' }}>
            <QRCodeCanvas 
              value={url} 
              size={180} 
              level="H" 
              includeMargin={true}
              bgColor="#FFFFFF"
              fgColor="#000000"
            />
          </div>
        </div>

        {/* Room code */}
        <div className="mb-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>ROOM CODE</p>
          <div
            className="flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer transition-colors"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            onClick={copyCode}
            role="button"
            tabIndex={0}
            aria-label="Click to copy room code"
            onKeyDown={(e) => { if (e.key === 'Enter') copyCode(); }}
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
            <button onClick={copyLink} aria-label="Copy share link" className="btn-accent px-3 py-2 flex items-center gap-2 text-sm">
              {copied ? <Check size={14} /> : <Link size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs pt-1 pb-1" style={{ color: 'var(--text-faint)' }}>
          <span className="flex items-center gap-1">
            <Globe size={11} /> {currentHost}
          </span>
          <span>Auto-deletes after 1h idle</span>
        </div>
      </div>
    </div>
  );
}
