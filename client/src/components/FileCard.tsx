import { useState } from 'react';
import { Download, Trash2, Eye, Image, Video, FileText, File, Code, Music, Archive, CheckCircle2, Circle } from 'lucide-react';
import { downloadWithProgress } from '../utils/download';

export interface FileData {
  id: string;
  name: string;
  size: number;
  url: string;
  timestamp: number;
  storage_path: string;
}

interface Props {
  file: FileData;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onDelete: (id: string, url: string) => void;
  onPreview: (file: FileData) => void;
}

export function getFileType(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg','jpeg','png','gif','webp','svg','bmp','avif'].includes(ext))
    return { Icon: Image, color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', isImage: true, isVideo: false };
  if (['mp4','webm','mov','avi','mkv','m4v'].includes(ext))
    return { Icon: Video, color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', isImage: false, isVideo: true };
  if (['mp3','wav','ogg','aac','flac','m4a'].includes(ext))
    return { Icon: Music, color: '#f472b6', bg: 'rgba(244,114,182,0.1)', isImage: false, isVideo: false };
  if (['pdf'].includes(ext))
    return { Icon: FileText, color: '#f87171', bg: 'rgba(248,113,113,0.1)', isImage: false, isVideo: false };
  if (['zip','rar','7z','tar','gz'].includes(ext))
    return { Icon: Archive, color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', isImage: false, isVideo: false };
  if (['js','ts','jsx','tsx','py','go','rs','java','c','cpp','html','css','json'].includes(ext))
    return { Icon: Code, color: '#34d399', bg: 'rgba(52,211,153,0.1)', isImage: false, isVideo: false };
  return { Icon: File, color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', isImage: false, isVideo: false };
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileCard({ file, selected = false, onSelect, onDelete, onPreview }: Props) {
  const [hover, setHover] = useState(false);
  // null = idle, -1 = indeterminate, 0-100 = real progress
  const [dlProgress, setDlProgress] = useState<number | null>(null);
  const { Icon, color, bg, isImage, isVideo } = getFileType(file.name);
  const canPreview = isImage || isVideo || file.name.toLowerCase().endsWith('.pdf');
  const timeStr = new Date(file.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isDownloading = dlProgress !== null && dlProgress < 100;

  const handleDownload = async () => {
    if (isDownloading) return;
    setDlProgress(0);
    try {
      await downloadWithProgress(file.url, file.name, (pct) => setDlProgress(pct));
    } catch {
      window.open(file.url, '_blank');
    } finally {
      // Keep 100% shown briefly, then reset
      setTimeout(() => setDlProgress(null), 1500);
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
        >
          {selected ? (
            <CheckCircle2 size={18} color="#fff" fill="#fff" />
          ) : (
            <Circle size={18} color="#fff" />
          )}
        </button>
      )}

      {/* Thumbnail / Icon */}
      <div
        className="relative flex items-center justify-center overflow-hidden"
        style={{ height: 100, background: bg, cursor: canPreview ? 'pointer' : 'default' }}
        onClick={() => canPreview && onPreview(file)}
      >
        {isImage ? (
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
        {canPreview && !isImage && hover && (
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
          {formatSize(file.size)} · {timeStr}
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
                /* Indeterminate: unknown Content-Length */
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
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="btn-ghost flex items-center gap-1 text-xs px-2 py-1 flex-1 justify-center"
            style={{ color: isDownloading ? 'var(--accent)' : 'var(--text-muted)' }}
            title="Download file"
          >
            <Download size={12} />
            {isDownloading
              ? (dlProgress === -1 ? 'Downloading…' : `${dlProgress}%`)
              : dlProgress === 100 ? 'Done ✓' : 'Download'
            }
          </button>
          <button
            onClick={() => onDelete(file.id, file.url)}
            className="btn-ghost p-1.5"
            title="Delete"
            disabled={isDownloading}
          >
            <Trash2 size={13} style={{ color: '#ef4444' }} />
          </button>
        </div>
      </div>
    </div>
  );
}
