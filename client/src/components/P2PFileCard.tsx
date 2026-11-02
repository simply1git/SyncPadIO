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

  const handlePreviewClick = () => {
    if (!canPreview || !onPreview || !transfer.downloadUrl) return;
    const fileData: FileData = {
      id: transfer.id,
      name: transfer.fileName,
      size: transfer.fileSize,
      url: transfer.downloadUrl,
      timestamp: Date.now(),
      storage_path: `p2p/${transfer.id}`,
      uploader_name: transfer.senderName || (transfer.direction === 'send' ? 'You' : 'Peer'),
      is_encrypted: false,
    };
    onPreview(fileData);
  };

  const isCompleted = transfer.status === 'completed';

  return (
    <div
      className="file-card slide-up relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Selection checkbox */}
      {isCompleted && onSelect && (
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

      {/* Direction & P2P Pill Badge */}
      <div
        className="absolute top-2 right-2 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium backdrop-blur-md"
        style={{
          background: transfer.direction === 'send' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(34, 197, 94, 0.2)',
          color: transfer.direction === 'send' ? '#38bdf8' : '#22c55e',
          border: transfer.direction === 'send' ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(34, 197, 94, 0.35)',
        }}
        title={transfer.direction === 'send' ? 'Direct P2P Stream sent by you' : 'Direct P2P Stream received from peer'}
      >
        <Zap size={10} />
        <span>{transfer.direction === 'send' ? 'Sent' : 'Received'}</span>
      </div>

      {/* Thumbnail / Icon */}
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
          {transfer.senderName ? `${transfer.senderName} · ` : transfer.direction === 'send' ? 'Sent by you · ' : 'From peer · '}
          {formatFileSize(transfer.fileSize)} · 0 MB Cloud
        </p>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onDownload(transfer)}
            className="btn-ghost flex items-center gap-1 text-xs px-2 py-1 flex-1 justify-center"
            style={{ color: 'var(--text-muted)' }}
            title="Save file to local disk"
            aria-label={`Save ${transfer.fileName}`}
          >
            <Download size={12} />
            Save
          </button>

          {canPreview && onPreview && (
            <button
              onClick={handlePreviewClick}
              className="btn-ghost p-1.5"
              title="Preview file"
              aria-label={`Preview ${transfer.fileName}`}
            >
              <Eye size={13} style={{ color: 'var(--accent)' }} />
            </button>
          )}

          {onDismiss && (
            <button
              onClick={() => onDismiss(transfer.id)}
              className="btn-ghost p-1.5"
              title="Remove from history"
              aria-label={`Dismiss ${transfer.fileName}`}
            >
              <Trash2 size={13} style={{ color: '#ef4444' }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
