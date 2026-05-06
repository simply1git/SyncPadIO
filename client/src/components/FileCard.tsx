import { useState } from 'react';
import { Download, Trash2, Eye, Image, Video, FileText, File, Code, Music, Archive, Loader } from 'lucide-react';

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

export function FileCard({ file, onDelete, onPreview }: Props) {
  const [hover, setHover] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { Icon, color, bg, isImage, isVideo } = getFileType(file.name);
  const canPreview = isImage || isVideo || file.name.toLowerCase().endsWith('.pdf');
  const timeStr = new Date(file.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  /**
   * Force download by fetching as blob — works around Supabase serving
   * public URLs with Content-Disposition: inline (which causes browsers
   * to open the file instead of downloading it).
   */
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(file.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a short delay so the download starts
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    } catch {
      // Fallback: open in new tab
      window.open(file.url, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="file-card slide-up"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Thumbnail / Icon area */}
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
        {(isVideo || canPreview) && !isImage && hover && (
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
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {formatSize(file.size)} · {timeStr}
        </p>

        {/* Actions */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="btn-ghost flex items-center gap-1 text-xs px-2 py-1 flex-1 justify-center"
            style={{ color: 'var(--text-muted)' }}
            title="Download file"
          >
            {downloading
              ? <><Loader size={12} className="animate-spin" /> Downloading…</>
              : <><Download size={12} /> Download</>
            }
          </button>
          <button
            onClick={() => onDelete(file.id, file.url)}
            className="btn-ghost p-1.5"
            title="Delete"
          >
            <Trash2 size={13} style={{ color: '#ef4444' }} />
          </button>
        </div>
      </div>
    </div>
  );
}
