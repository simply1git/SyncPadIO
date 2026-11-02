import { useState } from 'react';
import { Download, Trash2, Eye, Check, Zap, Share2 } from 'lucide-react';
import { getFileType } from '../utils/fileIcons';
import { formatFileSize } from '../utils/helpers';
import { P2PTransfer, FileData } from '../types';

interface Props {
  transfer: P2PTransfer;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onDownload: (transfer: P2PTransfer) => void;
  onCancel?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onPreview?: (file: FileData) => void;
}

export function P2PFileCard({
  transfer,
  selected = false,
  onSelect,
  onDownload,
  onDismiss,
  onPreview,
}: Props) {
  const [hover, setHover] = useState(false);
  const { Icon, color, bg, isImage, isVideo } = getFileType(transfer.fileName);
  const isPdf = transfer.fileName.toLowerCase().endsWith('.pdf');
  const canPreview = (isImage || isVideo || isPdf) && Boolean(transfer.downloadUrl);
  const timeStr = new Date(transfer.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handlePreviewClick = () => {
    if (!canPreview || !onPreview || !transfer.downloadUrl) return;
    const fileData: FileData = {
      id: transfer.id,
      name: transfer.fileName,
      size: transfer.fileSize,
      url: transfer.downloadUrl,
      timestamp: transfer.timestamp || Date.now(),
      storage_path: `p2p/${transfer.id}`,
      uploader_name: transfer.senderName || 'Peer',
      is_encrypted: false,
    };
    onPreview(fileData);
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && Boolean(transfer.blob);

  const handleNativeShare = async () => {
    if (!transfer.blob || !navigator.share) return;
    try {
      const fileToShare =
        transfer.blob instanceof File
          ? transfer.blob
          : new File([transfer.blob], transfer.fileName, { type: transfer.fileType });
      if (navigator.canShare && !navigator.canShare({ files: [fileToShare] })) {
        onDownload(transfer);
        return;
      }
      await navigator.share({
        files: [fileToShare],
        title: transfer.fileName,
      });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        onDownload(transfer);
      }
    }
  };

  return (
    <div
      className="file-card slide-up relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Selection checkbox (exact match to FileCard) */}
      {onSelect && (
        <button
          onClick={() => onSelect(transfer.id)}
          className="absolute top-2 left-2 z-10 transition-transform active:scale-90"
          style={{ opacity: hover || selected ? 1 : 0.7 }}
          title={selected ? 'Deselect' : 'Select'}
          aria-label={selected ? `Deselect ${transfer.fileName}` : `Select ${transfer.fileName}`}
        >
          {selected ? (
            <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-white shadow-md">
              <Check size={12} strokeWidth={3} />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-white/80 bg-black/40 backdrop-blur-sm" />
          )}
        </button>
      )}

      {/* P2P Badge (exact visual match to E2EE badge in FileCard) */}
      <div
        className="absolute top-2 right-2 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium backdrop-blur-md"
        style={{
          background: 'rgba(34, 197, 94, 0.2)',
          color: '#22c55e',
          border: '1px solid rgba(34, 197, 94, 0.3)',
        }}
        title="Direct WebRTC Peer-to-Peer Stream"
      >
        <Zap size={11} /> P2P
      </div>

      {/* Thumbnail / Icon (exact match to FileCard) */}
      <div
        className="relative flex items-center justify-center overflow-hidden"
        style={{ height: 100, background: bg, cursor: canPreview ? 'pointer' : 'default' }}
        onClick={() => canPreview && handlePreviewClick()}
        role={canPreview ? 'button' : undefined}
        tabIndex={canPreview ? 0 : undefined}
        aria-label={canPreview ? `Preview ${transfer.fileName}` : undefined}
        onKeyDown={(e) => { if (canPreview && e.key === 'Enter') handlePreviewClick(); }}
      >
        {isImage && transfer.downloadUrl ? (
          <img
            src={transfer.downloadUrl}
            alt={transfer.fileName}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <Icon size={36} style={{ color, opacity: 0.8 }} />
        )}
        {canPreview && hover && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <Eye size={20} color="#fff" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-semibold truncate mb-1" style={{ color: 'var(--text)' }} title={transfer.fileName}>
          {transfer.fileName}
        </p>
        <div className="flex flex-col gap-0.5 mb-2.5 text-xs text-zinc-400">
          {transfer.senderName && (
            <span className="truncate text-[11px] text-zinc-400">
              Uploaded by {transfer.senderName}
            </span>
          )}
          <span className="text-[11px] font-mono text-zinc-500 whitespace-nowrap">
            {formatFileSize(transfer.fileSize)} · {timeStr}
          </span>
        </div>

        {/* Actions (exact match to FileCard) */}
        <div className="flex gap-1.5 items-center">
          <button
            onClick={() => onDownload(transfer)}
            className="btn-ghost flex items-center gap-1 text-xs py-1.5 px-2 flex-1 justify-center font-medium rounded-lg"
            style={{ color: 'var(--text)' }}
            title="Download file"
            aria-label={`Download ${transfer.fileName}`}
          >
            <Download size={12} className="text-accent" />
            Download
          </button>
          {canNativeShare && (
            <button
              onClick={handleNativeShare}
              className="btn-ghost p-1.5 rounded-lg"
              title="Share / Save to Camera Roll"
              aria-label={`Share ${transfer.fileName}`}
            >
              <Share2 size={13} style={{ color: 'var(--accent)' }} />
            </button>
          )}
          {onDismiss && (
            <button
              onClick={() => onDismiss(transfer.id)}
              className="btn-ghost p-1.5 rounded-lg hover:text-red-400"
              title="Delete"
              aria-label={`Delete ${transfer.fileName}`}
            >
              <Trash2 size={13} style={{ color: '#ef4444' }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
