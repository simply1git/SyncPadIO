import { useState } from 'react';
import { Download, Eye, CheckCircle2, Circle, X, Zap, ArrowUpRight, ArrowDownLeft, AlertCircle } from 'lucide-react';
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
  onCancel,
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

  const isTransferring = transfer.status === 'connecting' || transfer.status === 'transferring';
  const isCompleted = transfer.status === 'completed';
  const isFailed = transfer.status === 'failed';
  const isCancelled = transfer.status === 'cancelled';

  return (
    <div
      className="file-card slide-up relative overflow-hidden transition-all"
      style={{
        border: isTransferring
          ? '1px solid rgba(96, 165, 250, 0.4)'
          : isCompleted
          ? '1px solid rgba(34, 197, 94, 0.3)'
          : '1px solid var(--border)',
        background: 'var(--surface)',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Selection checkbox (only when completed) */}
      {isCompleted && onSelect && (
        <button
          onClick={() => onSelect(transfer.id)}
          className="absolute top-2 left-2 z-10 p-1 rounded-full transition-all"
          style={{
            background: selected ? 'var(--accent)' : 'rgba(0,0,0,0.4)',
            opacity: hover || selected ? 1 : 0.6,
          }}
          title={selected ? 'Deselect' : 'Select'}
          aria-label={selected ? `Deselect ${transfer.fileName}` : `Select ${transfer.fileName}`}
        >
          {selected ? (
            <CheckCircle2 size={16} color="#fff" fill="#fff" />
          ) : (
            <Circle size={16} color="#fff" />
          )}
        </button>
      )}

      {/* Direction & P2P Pill Badge */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <span
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold backdrop-blur-md"
          style={{
            background: transfer.direction === 'send' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(34, 197, 94, 0.2)',
            color: transfer.direction === 'send' ? '#38bdf8' : '#22c55e',
            border: transfer.direction === 'send' ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(34, 197, 94, 0.35)',
          }}
          title={transfer.direction === 'send' ? 'Direct P2P Stream sent by you' : 'Direct P2P Stream received from peer'}
        >
          <Zap size={10} />
          {transfer.direction === 'send' ? (
            <span className="flex items-center gap-0.5"><ArrowUpRight size={10} /> Sent</span>
          ) : (
            <span className="flex items-center gap-0.5"><ArrowDownLeft size={10} /> Received</span>
          )}
        </span>
      </div>

      {/* Thumbnail or Visual File Icon */}
      <div
        className="relative flex items-center justify-center overflow-hidden"
        style={{
          height: 100,
          background: bg,
          cursor: canPreview ? 'pointer' : 'default',
        }}
        onClick={handlePreviewClick}
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
          <Icon size={34} style={{ color, opacity: 0.85 }} />
        )}

        {/* Hover preview eye button */}
        {canPreview && hover && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] transition-all">
            <div className="p-2 rounded-full bg-black/60 text-white flex items-center gap-1 text-xs">
              <Eye size={16} />
              <span>Preview</span>
            </div>
          </div>
        )}

        {/* Active Transfer Overlay Indicator */}
        {isTransferring && (
          <div className="absolute bottom-2 left-2 right-2 bg-black/75 backdrop-blur-md px-2 py-1 rounded-md text-[10px] flex items-center justify-between font-mono">
            <span className="text-sky-300 font-semibold">{transfer.progress}%</span>
            <span className="text-zinc-300">
              {transfer.speed > 0 ? `${(transfer.speed / (1024 * 1024)).toFixed(1)} MB/s` : 'Connecting…'}
            </span>
          </div>
        )}
      </div>

      {/* Card Info & Details */}
      <div className="p-3 space-y-2">
        <div>
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }} title={transfer.fileName}>
            {transfer.fileName}
          </p>
          <div className="flex items-center justify-between text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            <span>{formatFileSize(transfer.fileSize)}</span>
            <span>{transfer.senderName ? `By ${transfer.senderName}` : transfer.direction === 'send' ? 'By You' : 'From Peer'}</span>
          </div>
        </div>

        {/* Progress Bar (during transfer) */}
        {isTransferring && (
          <div className="space-y-1">
            <div className="progress-track" style={{ height: 4 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${transfer.progress}%`,
                  background: 'linear-gradient(90deg, #38bdf8, #60a5fa)',
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-sky-400 font-mono">
              <span>{formatFileSize(transfer.transferredBytes)} of {formatFileSize(transfer.fileSize)}</span>
              <span>{transfer.progress}%</span>
            </div>
          </div>
        )}

        {/* Error / Cancel status */}
        {(isFailed || isCancelled) && (
          <div className="flex items-center gap-1 text-[11px] text-red-400 bg-red-500/10 p-1.5 rounded">
            <AlertCircle size={12} className="flex-shrink-0" />
            <span className="truncate">{transfer.error || (isCancelled ? 'Cancelled by user' : 'Transfer failed')}</span>
          </div>
        )}

        {/* Card Actions */}
        <div className="flex items-center gap-1.5 pt-1">
          {isTransferring && onCancel && (
            <button
              onClick={() => onCancel(transfer.id)}
              className="btn-ghost flex-1 py-1 text-xs text-red-400 hover:bg-red-500/10 flex items-center justify-center gap-1 rounded"
              title="Cancel transfer"
            >
              <X size={12} /> Cancel
            </button>
          )}

          {isCompleted && (
            <>
              {canPreview && (
                <button
                  onClick={handlePreviewClick}
                  className="btn-ghost px-2 py-1 text-xs flex items-center justify-center gap-1 rounded"
                  title="Preview in browser"
                  aria-label={`Preview ${transfer.fileName}`}
                >
                  <Eye size={12} />
                </button>
              )}

              <button
                onClick={() => onDownload(transfer)}
                className="btn-accent flex-1 py-1 text-xs font-semibold flex items-center justify-center gap-1 rounded"
                title="Save file to local disk"
                aria-label={`Save ${transfer.fileName} to device`}
              >
                <Download size={12} /> Save
              </button>

              {onDismiss && (
                <button
                  onClick={() => onDismiss(transfer.id)}
                  className="btn-ghost p-1 text-zinc-400 hover:text-red-400 rounded"
                  title="Remove from history"
                  aria-label="Remove from list"
                >
                  <X size={13} />
                </button>
              )}
            </>
          )}

          {(isFailed || isCancelled) && onDismiss && (
            <button
              onClick={() => onDismiss(transfer.id)}
              className="btn-ghost flex-1 py-1 text-xs text-zinc-400 hover:bg-white/5 flex items-center justify-center gap-1 rounded"
            >
              <X size={12} /> Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
