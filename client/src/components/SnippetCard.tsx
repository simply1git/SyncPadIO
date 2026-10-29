import { useState, useEffect } from 'react';
import { Copy, Check, Lock, Unlock, Trash2, Code2, Eye } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';
import { isEncrypted, decryptText } from '../utils/crypto';
import { timeAgo, detectCodeLanguage } from '../utils/helpers';
import { Snippet } from '../types';

interface Props {
  snippet: Snippet;
  myUserId: string;
  roomId: string;
  encryptionKey?: string;
  onDelete: (id: string) => void;
}

export function SnippetCard({ snippet, myUserId, roomId, encryptionKey, onDelete }: Props) {
  const [copied, setCopied] = useState(false);
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [viewMode, setViewMode] = useState<'code' | 'markdown'>('code');

  const encrypted = isEncrypted(snippet.text);
  const isMine = snippet.sender_id === myUserId;
  const timeStr = timeAgo(snippet.timestamp);

  // Attempt auto-decryption on mount if encrypted
  useEffect(() => {
    if (encrypted && !decrypted) {
      decryptText(snippet.text, roomId, encryptionKey).then(res => {
        if (res) setDecrypted(res);
      });
    }
  }, [encrypted, snippet.text, roomId, encryptionKey, decrypted]);

  const displayText = decrypted ?? (encrypted ? null : snippet.text);
  const detectedLang = displayText ? detectCodeLanguage(displayText) : 'text';
  const isLikelyMarkdown = displayText ? (displayText.startsWith('#') || displayText.includes('\n- ') || displayText.includes('\n* ')) : false;

  const copy = async () => {
    const textToCopy = displayText || snippet.text;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success('Snippet copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const manualDecrypt = async () => {
    setDecrypting(true);
    const result = await decryptText(snippet.text, roomId, encryptionKey);
    setDecrypting(false);
    if (result) {
      setDecrypted(result);
      toast.success('Decrypted successfully!');
    } else {
      toast.error('Decryption failed — missing or incorrect key');
    }
  };

  return (
    <div className={`snippet-card slide-up p-3 mb-3 ${encrypted && !decrypted ? 'encrypted' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: `hsl(${Math.abs(snippet.sender_id.charCodeAt(0) * 37) % 360}, 60%, 45%)` }}
            aria-hidden="true"
          >
            {(snippet.sender_name?.[0] || snippet.sender_id[0])?.toUpperCase()}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
              {snippet.sender_name || 'Anonymous'}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>·</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{timeStr}</span>
            {detectedLang !== 'text' && displayText && (
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded"
                style={{ background: 'var(--surface-2)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
                {detectedLang}
              </span>
            )}
          </div>
          {encrypted && (
            <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
              {decrypted ? <Unlock size={10} /> : <Lock size={10} />}
              {decrypted ? 'Decrypted' : 'Encrypted'}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {isLikelyMarkdown && displayText && (
            <button
              onClick={() => setViewMode(v => v === 'code' ? 'markdown' : 'code')}
              className="btn-ghost p-1.5 text-xs"
              title={viewMode === 'code' ? 'View as Markdown' : 'View Code'}
              aria-label="Toggle Markdown View"
            >
              {viewMode === 'code' ? <Eye size={13} /> : <Code2 size={13} />}
            </button>
          )}

          {encrypted && !decrypted && (
            <button
              onClick={manualDecrypt}
              disabled={decrypting}
              className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
              title="Decrypt snippet"
              aria-label="Decrypt snippet"
            >
              <Unlock size={12} />
              {decrypting ? '...' : 'Unlock'}
            </button>
          )}

          <button
            onClick={copy}
            className="btn-ghost p-1.5"
            title="Copy snippet"
            aria-label="Copy snippet"
          >
            {copied ? <Check size={13} style={{ color: 'var(--accent)' }} /> : <Copy size={13} />}
          </button>

          {isMine && (
            <button
              onClick={() => onDelete(snippet.id)}
              className="btn-ghost p-1.5"
              title="Delete snippet"
              aria-label="Delete snippet"
            >
              <Trash2 size={13} style={{ color: '#ef4444' }} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {encrypted && !decrypted ? (
        <div className="font-mono text-xs px-3 py-2.5 rounded flex items-center justify-between"
          style={{ background: 'var(--surface-2)', color: 'var(--text-faint)', letterSpacing: '0.12em' }}>
          <span>{'•'.repeat(Math.min(snippet.text.length - 8, 48))}</span>
          <span className="text-[10px] uppercase font-sans tracking-normal opacity-70">Locked with Room Key</span>
        </div>
      ) : viewMode === 'markdown' && isLikelyMarkdown ? (
        <div className="prose prose-invert prose-sm max-w-none px-2 py-1 overflow-x-auto" style={{ color: 'var(--text)' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {displayText || ''}
          </ReactMarkdown>
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ background: '#1e1e1e' }}>
          <SyntaxHighlighter
            language={detectedLang}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: '12px',
              fontSize: '13px',
              lineHeight: '1.5',
              background: 'transparent',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            }}
            wrapLongLines={true}
          >
            {displayText || ''}
          </SyntaxHighlighter>
        </div>
      )}
    </div>
  );
}
export type { Snippet };
