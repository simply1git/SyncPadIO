import { useState } from 'react';
import { Download, Trash2, Eye, CheckCircle2, Circle, Zap } from 'lucide-react';
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
          className="absolute top-2 left-2 z-10 p-1 rounded-full transition-all"
          style={{
            background: selected ? 'var(--accent)' : 'rgba(0,0,0,0.3)',
            opacity: hover || selected ? 1 : 0.5,
          }}
          title={selected ? 'Deselect' : 'Select'}
          aria-label={selected ? `Deselect ${transfer.fileName}` : `Select ${transfer.fileName}`}
        >
          {selected ? (
            <CheckCircle2 size={18} color="#fff" fill="#fff" />
          ) : (
            <Circle size={18} color="#fff" />
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
        <p className="text-sm font-medium truncate mb-1" style={{ color: 'var(--text)' }} title={transfer.fileName}>
          {transfer.fileName}
        </p>
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
          {transfer.senderName ? `Uploaded by ${transfer.senderName} · ` : ''}
          {formatFileSize(transfer.fileSize)} · {timeStr}
        </p>

        {/* Actions (exact match to FileCard) */}
        <div className="flex gap-2">
          <button
            onClick={() => onDownload(transfer)}
            className="btn-ghost flex items-center gap-1 text-xs px-2 py-1 flex-1 justify-center"
            style={{ color: 'var(--text-muted)' }}
            title="Download file"
            aria-label={`Download ${transfer.fileName}`}
          >
            <Download size={12} />
            Download
          </button>
          {onDismiss && (
            <button
              onClick={() => onDismiss(transfer.id)}
              className="btn-ghost p-1.5"
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
