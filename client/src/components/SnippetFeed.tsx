import React, { useState, useMemo } from 'react';
import { Search, ClipboardList, Lock, Unlock } from 'lucide-react';
import toast from 'react-hot-toast';
import { SnippetCard } from './SnippetCard';
import { isEncrypted } from '../utils/crypto';
import { Snippet } from '../types';

interface Props {
  snippets: Snippet[];
  myUserId: string;
  roomId: string;
  encryptionKey?: string;
  onAddSnippet: (text: string, encrypted: boolean) => Promise<void>;
  onDeleteSnippet: (id: string) => void;
}

export function SnippetFeed({
  snippets,
  myUserId,
  roomId,
  encryptionKey,
  onAddSnippet,
  onDeleteSnippet,
}: Props) {
  const [text, setText] = useState('');
  const [encryptMode, setEncryptMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSending, setIsSending] = useState(false);

  const filteredSnippets = useMemo(() => {
    if (!searchQuery.trim()) return snippets;
    const q = searchQuery.toLowerCase();
    return snippets.filter(s =>
      isEncrypted(s.text) || s.text.toLowerCase().includes(q)
    );
  }, [snippets, searchQuery]);

  const handleSend = async () => {
    if (!text.trim() || isSending) return;
    const content = text;
    setText('');
    setIsSending(true);
    try {
      await onAddSnippet(content, encryptMode);
    } catch {
      setText(content);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const copyAllSnippets = () => {
    const readable = snippets
      .filter(s => !isEncrypted(s.text))
      .map(s => s.text)
      .join('\n\n---\n\n');

    if (readable) {
      navigator.clipboard.writeText(readable);
      toast.success('All plain snippets copied!');
    } else {
      toast('No unencrypted snippets to copy', { icon: 'ℹ️' });
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ borderRight: '1px solid var(--border)' }}>
      {/* Composer Area */}
      <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
        {/* Search & Actions Bar */}
        <div className="flex items-center gap-2 mb-2 px-1">
          <Search size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} aria-hidden="true" />
          <input
            className="input-dark flex-1 px-2.5 py-1 text-xs"
            placeholder="Search snippets…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search snippets"
          />
          {snippets.length > 0 && (
            <button
              onClick={copyAllSnippets}
              className="btn-ghost flex items-center gap-1 px-2.5 py-1 text-xs"
              title="Copy all unencrypted snippets"
              aria-label="Copy all plain snippets"
            >
              <ClipboardList size={12} /> All
            </button>
          )}
        </div>

        {/* Text Input */}
        <textarea
          id="snippet-input"
          className="textarea-dark w-full p-3 font-mono text-sm"
          rows={4}
          placeholder="Paste code, markdown, commands… (Ctrl+Enter to send)"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Snippet text input"
        />

        {/* Bottom controls */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => setEncryptMode(v => !v)}
            className="btn-ghost flex items-center gap-1 px-2.5 py-1 text-xs rounded-md"
            style={encryptMode ? { color: '#f59e0b', background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.4)' } : {}}
            title="Toggle AES-256-GCM encryption"
            aria-pressed={encryptMode}
          >
            {encryptMode ? <Lock size={12} /> : <Unlock size={12} />}
            {encryptMode ? 'Encrypted' : 'Plain text'}
          </button>

          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
            {encryptMode ? '🔒 End-to-end encrypted with room key' : '👁️ Visible to all peers in room'}
          </span>

          <button
            onClick={handleSend}
            disabled={!text.trim() || isSending}
            className="btn-accent ml-auto px-3 py-1 text-xs font-semibold"
            id="send-snippet-btn"
            aria-label="Send snippet"
          >
            {isSending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>

      {/* Snippet Feed Scroll */}
      <div className="flex-1 overflow-y-auto p-3" role="feed" aria-label="Snippets feed">
        {filteredSnippets.length === 0 && snippets.length > 0 ? (
          <div className="text-center pt-8" style={{ color: 'var(--text-faint)' }}>
            <p className="text-sm">No snippets match "{searchQuery}"</p>
          </div>
        ) : filteredSnippets.length === 0 ? (
          <div className="text-center pt-12" style={{ color: 'var(--text-faint)' }}>
            <p className="text-4xl mb-3">✏️</p>
            <p className="text-sm font-medium">No snippets shared yet</p>
            <p className="text-xs mt-1">Paste code or notes above to broadcast in real-time</p>
          </div>
        ) : (
          [...filteredSnippets].reverse().map(s => (
            <SnippetCard
              key={s.id}
              snippet={s}
              myUserId={myUserId}
              roomId={roomId}
              encryptionKey={encryptionKey}
              onDelete={onDeleteSnippet}
            />
          ))
        )}
      </div>
    </div>
  );
}

