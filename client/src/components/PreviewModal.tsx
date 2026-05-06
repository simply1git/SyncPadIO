import { X, Download, Loader } from 'lucide-react';
import { FileData } from './FileCard';
import { useState } from 'react';

interface Props {
  file: FileData;
  onClose: () => void;
}

export function PreviewModal({ file, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const isImage = ['jpg','jpeg','png','gif','webp','svg','bmp','avif'].includes(ext);
  const isVideo = ['mp4','webm','mov','avi','mkv','m4v'].includes(ext);
  const isPdf   = ext === 'pdf';

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(file.url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl; a.download = file.name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    } catch { window.open(file.url, '_blank'); }
    finally { setDownloading(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box overflow-hidden flex flex-col"
        style={{ maxWidth: isImage || isVideo ? 900 : 640, width: '100%', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{file.name}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="btn-ghost flex items-center gap-1 text-xs px-3 py-1.5"
              style={{ color: 'var(--text-muted)' }}
            >
              {downloading ? <Loader size={13} className="animate-spin" /> : <Download size={13} />}
              {downloading ? 'Downloading…' : 'Download'}
            </button>
            <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4" style={{ minHeight: 200 }}>
          {isImage && (
            <img src={file.url} alt={file.name} style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }} />
          )}
          {isVideo && (
            <video
              src={file.url}
              controls
              autoPlay
              style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 8 }}
            />
          )}
          {isPdf && (
            <iframe src={file.url} title={file.name} style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 8 }} />
          )}
          {!isImage && !isVideo && !isPdf && (
            <div className="text-center">
              <p style={{ color: 'var(--text-muted)' }}>Preview not available for this file type.</p>
              <a href={file.url} download={file.name} className="btn-accent mt-3 inline-block px-4 py-2 text-sm" style={{ textDecoration: 'none' }}>
                Download File
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
