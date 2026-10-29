import { useState, useRef } from 'react';
import { Download, Trash2, Eye, CheckCircle2, Circle, X, ShieldCheck } from 'lucide-react';
import { downloadWithProgress } from '../utils/download';
import { getFileType } from '../utils/fileIcons';
import { formatFileSize } from '../utils/helpers';
import { isFileEncrypted } from '../utils/crypto';
import { FileData } from '../types';

interface Props {
  file: FileData;
  selected?: boolean;
  roomId?: string;
  encryptionKey?: string;
  onSelect?: (id: string) => void;
  onDelete: (id: string, url: string) => void;
  onPreview: (file: FileData) => void;
}

export function FileCard({
  file,
  selected = false,
  roomId,
  encryptionKey,
  onSelect,
  onDelete,
  onPreview
}: Props) {
  const [hover, setHover] = useState(false);
  const [dlProgress, setDlProgress] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { Icon, color, bg, isImage, isVideo } = getFileType(file.name);
  const canPreview = isImage || isVideo || file.name.toLowerCase().endsWith('.pdf');
  const timeStr = new Date(file.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isDownloading = dlProgress !== null && dlProgress < 100;
  const encrypted = isFileEncrypted(file);

  const handleDownload = async () => {
    if (isDownloading) return;
    setDlProgress(0);
    abortControllerRef.current = new AbortController();
    try {
      await downloadWithProgress(
        file.url,
        file.name,
        (pct) => setDlProgress(pct),
        abortControllerRef.current.signal,
        roomId,
        encryptionKey
      );
    } catch (err) {
      if (err instanceof Error && err.message === 'Download cancelled') {
        // Cancelled by user
      } else {
        window.open(file.url, '_blank');
      }
    } finally {
      if (dlProgress !== null) {
        setTimeout(() => setDlProgress(null), 1500);
      }
      abortControllerRef.current = null;
    }
  };

  const handleCancelDownload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setDlProgress(null);
      abortControllerRef.current = null;
    }
  };

  return (
    <div
      className="file-card slide-up relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Selection checkbox */}
      {onSelect && (
        <button
          onClick={() => onSelect(file.id)}
          className="absolute top-2 left-2 z-10 p-1 rounded-full transition-all"
          style={{
            background: selected ? 'var(--accent)' : 'rgba(0,0,0,0.3)',
            opacity: hover || selected ? 1 : 0.5
          }}
          title={selected ? 'Deselect' : 'Select'}
          aria-label={selected ? `Deselect ${file.name}` : `Select ${file.name}`}
        >
          {selected ? (
            <CheckCircle2 size={18} color="#fff" fill="#fff" />
          ) : (
            <Circle size={18} color="#fff" />
          )}
        </button>
      )}

      {/* Encryption badge */}
      {encrypted && (
        <div
          className="absolute top-2 right-2 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium backdrop-blur-md"
          style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)' }}
          title="End-to-End Encrypted (AES-256-GCM)"
        >
          <ShieldCheck size={11} /> E2EE
        </div>
      )}

      {/* Thumbnail / Icon */}
      <div
        className="relative flex items-center justify-center overflow-hidden"
        style={{ height: 100, background: bg, cursor: canPreview ? 'pointer' : 'default' }}
        onClick={() => canPreview && onPreview(file)}
        role={canPreview ? 'button' : undefined}
        tabIndex={canPreview ? 0 : undefined}
        aria-label={canPreview ? `Preview ${file.name}` : undefined}
        onKeyDown={(e) => { if (canPreview && e.key === 'Enter') onPreview(file); }}
      >
        {isImage && !encrypted ? (
          <img
            src={file.url}
            alt={file.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <Icon size={36} style={{ color, opacity: 0.8 }} />
        )}
        {canPreview && (!isImage || encrypted) && hover && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <Eye size={20} color="#fff" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-medium truncate mb-1" style={{ color: 'var(--text)' }} title={file.name}>
          {file.name}
        </p>
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
          {file.uploader_name ? `Uploaded by ${file.uploader_name} · ` : ''}
          {formatFileSize(file.size)} · {timeStr}
        </p>

        {/* Download progress bar */}
        {dlProgress !== null && (
          <div className="mb-2">
            <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-faint)' }}>
              <span>{dlProgress === 100 ? 'Done!' : 'Downloading…'}</span>
              <span>{dlProgress >= 0 ? `${dlProgress}%` : ''}</span>
            </div>
            <div className="progress-track" style={{ height: 3 }}>
              {dlProgress === -1 ? (
                <div
                  style={{
                    height: '100%',
                    width: '40%',
                    background: 'linear-gradient(90deg, var(--accent-deep), var(--accent))',
                    borderRadius: 999,
                    animation: 'indeterminate 1.2s ease-in-out infinite',
                  }}
                />
              ) : (
                <div className="progress-fill" style={{ width: `${dlProgress}%` }} />
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {isDownloading ? (
            <button
              onClick={handleCancelDownload}
              className="btn-ghost flex items-center gap-1 text-xs px-2 py-1 flex-1 justify-center"
              style={{ color: '#ef4444' }}
              title="Cancel download"
              aria-label="Cancel download"
            >
              <X size={12} />
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="btn-ghost flex items-center gap-1 text-xs px-2 py-1 flex-1 justify-center"
                style={{ color: 'var(--text-muted)' }}
                title="Download file"
                aria-label={`Download ${file.name}`}
              >
                <Download size={12} />
                {dlProgress === 100 ? 'Done ✓' : 'Download'}
              </button>
              <button
                onClick={() => onDelete(file.id, file.url)}
                className="btn-ghost p-1.5"
                title="Delete"
                aria-label={`Delete ${file.name}`}
              >
                <Trash2 size={13} style={{ color: '#ef4444' }} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export type { FileData };
