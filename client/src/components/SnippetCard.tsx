import { useState } from 'react';
import { Copy, Check, Lock, Trash2 } from 'lucide-react';
import { isEncrypted, decryptText } from '../utils/crypto';
import toast from 'react-hot-toast';

interface Snippet {
  id: string;
  text: string;
  sender_id: string;
  timestamp: number;
  sender_name?: string;
}

interface Props {
  snippet: Snippet;
  myUserId: string;
  roomId: string;
  onDelete: (id: string) => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function SnippetCard({ snippet, myUserId, roomId, onDelete }: Props) {
  const [copied, setCopied] = useState(false);
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const encrypted = isEncrypted(snippet.text);
  const isMine = snippet.sender_id === myUserId;
  const displayText = decrypted ?? (encrypted ? null : snippet.text);
  const timeStr = timeAgo(snippet.timestamp);

  const copy = async () => {
    const text = decrypted ?? (encrypted ? snippet.text : snippet.text);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const decrypt = async () => {
    setDecrypting(true);
    const result = await decryptText(snippet.text, roomId);
    setDecrypting(false);
    if (result) setDecrypted(result);
    else toast.error('Decryption failed — wrong room key?');
  };

  return (
    <div className={`snippet-card slide-up p-3 mb-2 ${encrypted && !decrypted ? 'encrypted' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: `hsl(${Math.abs(snippet.sender_id.charCodeAt(0) * 37) % 360}, 60%, 45%)` }}
          >
            {(snippet.sender_name?.[0] || snippet.sender_id[0])?.toUpperCase()}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
              {snippet.sender_name || 'Anonymous'}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>·</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{timeStr}</span>
          </div>
          {encrypted && (
            <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
              <Lock size={10} /> encrypted
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {encrypted && !decrypted && (
            <button onClick={decrypt} disabled={decrypting} className="btn-ghost px-2 py-1 text-xs" title="Decrypt">
              {decrypting ? '...' : '🔓'}
            </button>
          )}
          <button onClick={copy} className="btn-ghost p-1.5" title="Copy">
            {copied ? <Check size={13} style={{ color: 'var(--accent)' }} /> : <Copy size={13} />}
          </button>
          {isMine && (
            <button onClick={() => onDelete(snippet.id)} className="btn-ghost p-1.5" title="Delete">
              <Trash2 size={13} style={{ color: '#ef4444' }} />
            </button>
          )}
        </div>
      </div>

      {encrypted && !decrypted ? (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-faint)', letterSpacing: '0.15em' }}>
          {'•'.repeat(Math.min(snippet.text.length - 4, 40))}
        </div>
      ) : (
        <pre className="font-mono text-sm whitespace-pre-wrap break-all m-0" style={{ color: 'var(--text)', lineHeight: 1.6 }}>
          {displayText}
        </pre>
      )}
    </div>
  );
}
