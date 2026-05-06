import { X, Download } from 'lucide-react';
import { FileData } from './FileCard';
import { useState } from 'react';
import { downloadWithProgress } from '../utils/download';

interface Props {
  file: FileData;
  onClose: () => void;
}

export function PreviewModal({ file, onClose }: Props) {
  const [dlProgress, setDlProgress] = useState<number | null>(null);
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const isImage = ['jpg','jpeg','png','gif','webp','svg','bmp','avif'].includes(ext);
  const isVideo = ['mp4','webm','mov','avi','mkv','m4v'].includes(ext);
  const isPdf   = ext === 'pdf';
  const isDownloading = dlProgress !== null && dlProgress < 100;

  const handleDownload = async () => {
    if (isDownloading) return;
    setDlProgress(0);
    try {
      await downloadWithProgress(file.url, file.name, (pct) => setDlProgress(pct));
    } catch { window.open(file.url, '_blank'); }
    finally { setTimeout(() => setDlProgress(null), 1500); }
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
          <p className="text-sm font-medium truncate flex-1 mr-4" style={{ color: 'var(--text)' }}>{file.name}</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="btn-ghost flex items-center gap-1.5 text-xs px-3 py-1.5 min-w-[100px] justify-center"
              style={{ color: isDownloading ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              <Download size={13} />
              {isDownloading
                ? (dlProgress === -1 ? 'Downloading…' : `${dlProgress}%`)
                : dlProgress === 100 ? 'Done ✓' : 'Download'
              }
            </button>
            <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
          </div>
        </div>

        {/* Download progress bar (below header) */}
        {dlProgress !== null && (
          <div className="px-4 py-1.5" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <div className="progress-track" style={{ height: 3 }}>
              {dlProgress === -1 ? (
                <div style={{
                  height: '100%', width: '40%',
                  background: 'linear-gradient(90deg, var(--accent-deep), var(--accent))',
                  borderRadius: 999,
                  animation: 'indeterminate 1.2s ease-in-out infinite',
                }} />
              ) : (
                <div className="progress-fill" style={{ width: `${dlProgress}%` }} />
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4" style={{ minHeight: 200 }}>
          {isImage && (
            <img src={file.url} alt={file.name} style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }} />
          )}
          {isVideo && (
            <video src={file.url} controls autoPlay style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 8 }} />
          )}
          {isPdf && (
            <iframe src={file.url} title={file.name} style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 8 }} />
          )}
          {!isImage && !isVideo && !isPdf && (
            <div className="text-center">
              <p style={{ color: 'var(--text-muted)' }}>Preview not available for this file type.</p>
              <button onClick={handleDownload} className="btn-accent mt-4 px-6 py-2 text-sm">
                Download File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
