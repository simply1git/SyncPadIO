import { useEffect, useState } from 'react';
import { X, Download, ShieldCheck, Loader2 } from 'lucide-react';
import { FileData } from '../types';
import { downloadWithProgress, triggerSave } from '../utils/download';
import { safeDecryptFile, getMimeTypeFromName, isFileEncrypted } from '../utils/crypto';

interface Props {
  file: FileData;
  roomId?: string;
  encryptionKey?: string;
  onClose: () => void;
}

export function PreviewModal({ file, roomId, encryptionKey, onClose }: Props) {
  const [dlProgress, setDlProgress] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [decryptedBlob, setDecryptedBlob] = useState<Blob | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext);
  const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'].includes(ext);
  const isPdf = ext === 'pdf';
  const isDownloading = dlProgress !== null && dlProgress < 100;
  const encrypted = isFileEncrypted(file);

  // Close on Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Decrypt and load preview content
  useEffect(() => {
    let active = true;
    let createdBlobUrl: string | null = null;

    const loadContent = async () => {
      setIsLoading(true);
      try {
        if (encrypted || roomId) {
          const res = await fetch(file.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          const mimeType = getMimeTypeFromName(file.name);
          const blob = await safeDecryptFile(buf, roomId || '', encryptionKey, mimeType);

          if (!active) return;
          createdBlobUrl = URL.createObjectURL(blob);
          setPreviewUrl(createdBlobUrl);
          setDecryptedBlob(blob);
        } else {
          setPreviewUrl(file.url);
        }
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[Preview] Failed to decrypt preview:', err);
        // Fallback to raw URL
        if (active) setPreviewUrl(file.url);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadContent();

    return () => {
      active = false;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [file.url, file.name, encrypted, roomId, encryptionKey]);

  const handleDownload = async () => {
    if (isDownloading) return;

    // Instant zero-cost save if already decrypted in memory
    if (decryptedBlob) {
      setDlProgress(100);
      triggerSave(decryptedBlob, file.name);
      setTimeout(() => setDlProgress(null), 1500);
      return;
    }

    setDlProgress(0);
    try {
      await downloadWithProgress(
        file.url,
        file.name,
        (pct) => setDlProgress(pct),
        undefined,
        roomId,
        encryptionKey
      );
    } catch {
      window.open(file.url, '_blank');
    } finally {
      setTimeout(() => setDlProgress(null), 1500);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${file.name}`}
    >
      <div
        className="modal-box overflow-hidden flex flex-col"
        style={{ maxWidth: isImage || isVideo ? 900 : 640, width: '100%', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div className="flex items-center gap-2 truncate flex-1 mr-4">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }} title={file.name}>
              {file.name}
            </p>
            {encrypted && (
              <span
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono font-medium flex-shrink-0"
                style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)' }}
                title="Decrypted locally with client-side Zero-Knowledge AES-256-GCM"
              >
                <ShieldCheck size={11} /> E2EE
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              aria-label="Download file"
              className="btn-ghost flex items-center gap-1.5 text-xs px-3 py-1.5 min-w-[100px] justify-center"
              style={{ color: isDownloading ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              <Download size={13} />
              {isDownloading
                ? (dlProgress === -1 ? 'Downloading…' : `${dlProgress}%`)
                : dlProgress === 100 ? 'Done ✓' : 'Download'
              }
            </button>
            <button onClick={onClose} aria-label="Close modal" className="btn-ghost p-1.5">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Download progress bar */}
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
        <div className="flex-1 overflow-auto flex items-center justify-center p-4" style={{ minHeight: 220 }}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Loader2 size={24} className="animate-spin mb-3" style={{ color: 'var(--accent)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                {encrypted ? 'Decrypting client-side…' : 'Loading preview…'}
              </p>
              {encrypted && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
                  Hardware-accelerated AES-256-GCM
                </p>
              )}
            </div>
          ) : (
            <>
              {isImage && previewUrl && (
                <img
                  src={previewUrl}
                  alt={file.name}
                  style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }}
                />
              )}
              {isVideo && previewUrl && (
                <video
                  src={previewUrl}
                  controls
                  autoPlay
                  style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 8 }}
                />
              )}
              {isPdf && previewUrl && (
                <iframe
                  src={previewUrl}
                  title={file.name}
                  sandbox="allow-scripts allow-same-origin"
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 8 }}
                />
              )}
              {!isImage && !isVideo && !isPdf && (
                <div className="text-center">
                  <p style={{ color: 'var(--text-muted)' }}>Preview not available for this file type.</p>
                  <button onClick={handleDownload} className="btn-accent mt-4 px-6 py-2 text-sm">
                    Download File
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
