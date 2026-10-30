import React, { useRef, useState } from 'react';
import { Upload, Download, X, Zap, ArrowDownLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { FileCard } from './FileCard';
import { formatFileSize } from '../utils/helpers';
import { downloadFilesAsZip, downloadFilesSequential } from '../utils/zipDownload';
import { FileData, UploadItem, P2PTransfer } from '../types';

interface Props {
  files: FileData[];
  uploads: UploadItem[];
  p2pTransfers?: P2PTransfer[];
  userCount?: number;
  roomId: string;
  encryptionKey?: string;
  onUploadFiles: (files: FileList | null) => void;
  onSendP2PFile?: (file: File) => void;
  onCancelP2PTransfer?: (transferId: string) => void;
  onClearP2PTransfer?: (transferId: string) => void;
  onCancelUpload: (id: string) => void;
  onDeleteFile: (id: string, url: string) => void;
  onPreviewFile: (file: FileData) => void;
  onActivity: () => void;
}

export function FileManager({
  files,
  uploads,
  p2pTransfers = [],
  userCount = 1,
  roomId,
  encryptionKey,
  onUploadFiles,
  onSendP2PFile,
  onCancelP2PTransfer,
  onClearP2PTransfer,
  onCancelUpload,
  onDeleteFile,
  onPreviewFile,
  onActivity,
}: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<{ type: 'zip' | 'individual'; current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const p2pFileInputRef = useRef<HTMLInputElement>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    onUploadFiles(e.dataTransfer.files);
  };

  // Selection handlers
  const toggleFileSelection = (id: string) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedFileIds(new Set(files.map(f => f.id)));
  const deselectAll = () => setSelectedFileIds(new Set());

  // Download handlers
  const handleCancelDownload = () => {
    if (downloadAbortRef.current) {
      downloadAbortRef.current.abort();
      setDownloadProgress(null);
      downloadAbortRef.current = null;
      toast.error('Download cancelled');
    }
  };

  const downloadZip = async (filesToDownload: FileData[]) => {
    if (filesToDownload.length === 0) return;
    downloadAbortRef.current = new AbortController();
    setDownloadProgress({ type: 'zip', current: 0, total: filesToDownload.length });

    try {
      await downloadFilesAsZip(
        filesToDownload.map(f => ({
          name: f.name,
          url: f.url,
          storage_path: f.storage_path,
          is_encrypted: f.is_encrypted
        })),
        `SyncPadIO-${roomId}`,
        (current, total) => setDownloadProgress({ type: 'zip', current, total }),
        downloadAbortRef.current.signal,
        roomId,
        encryptionKey
      );
      toast.success('Zip archive downloaded!');
      setSelectedFileIds(new Set());
      onActivity();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      if (msg !== 'Download cancelled') toast.error(msg);
    } finally {
      setDownloadProgress(null);
      downloadAbortRef.current = null;
    }
  };

  const downloadSequential = async (filesToDownload: FileData[]) => {
    if (filesToDownload.length === 0) return;
    downloadAbortRef.current = new AbortController();
    setDownloadProgress({ type: 'individual', current: 0, total: filesToDownload.length });

    try {
      await downloadFilesSequential(
        filesToDownload.map(f => ({
          name: f.name,
          url: f.url,
          storage_path: f.storage_path,
          is_encrypted: f.is_encrypted
        })),
        (current, total) => setDownloadProgress({ type: 'individual', current, total }),
        downloadAbortRef.current.signal,
        roomId,
        encryptionKey
      );
      toast.success('All files downloaded!');
      setSelectedFileIds(new Set());
      onActivity();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      if (msg !== 'Download cancelled') toast.error(msg);
    } finally {
      setDownloadProgress(null);
      downloadAbortRef.current = null;
    }
  };

  return (
    <div
      className="flex flex-col flex-1 overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Action Zone: Dropzone & Direct P2P Action */}
      <div className="m-3 space-y-2">
        <div
          className={`rounded-xl border-2 border-dashed flex items-center justify-center gap-3 cursor-pointer transition-all ${dragActive ? 'drag-active' : ''}`}
          style={{
            padding: '16px',
            borderColor: dragActive ? 'var(--accent)' : 'var(--border)',
            minHeight: 74,
            background: dragActive ? 'var(--accent-glow)' : 'transparent',
          }}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload files dropzone"
          onKeyDown={(e) => { if (e.key === 'Enter') fileInputRef.current?.click(); }}
        >
          <Upload size={20} style={{ color: dragActive ? 'var(--accent)' : 'var(--text-muted)' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: dragActive ? 'var(--accent)' : 'var(--text)' }}>
              {dragActive ? 'Drop files to upload immediately' : 'Click or drag files to Cloud Storage'}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Max 50 MB per file · E2EE Encrypted</p>
          </div>
        </div>

        {/* P2P WebRTC Direct Button */}
        {onSendP2PFile && (
          <div
            className="rounded-xl p-3 flex items-center justify-between transition-all cursor-pointer hover:border-accent/40"
            style={{
              background: 'rgba(96,165,250,0.06)',
              border: '1px solid rgba(96,165,250,0.2)',
            }}
            onClick={() => p2pFileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') p2pFileInputRef.current?.click(); }}
            title={userCount > 1 ? 'Stream files directly to connected room peers' : 'Connect another peer to stream directly'}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(96,165,250,0.15)', color: 'var(--accent)' }}
              >
                <Zap size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-accent">Direct P2P Stream (WebRTC)</span>
                  <span
                    className="text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider"
                    style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                  >
                    Unlimited Size
                  </span>
                </div>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {userCount > 1
                    ? `Stream directly to ${userCount - 1} connected peer(s) · Zero server storage`
                    : 'Invite a peer to room to enable real-time device-to-device streaming'}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-accent px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                p2pFileInputRef.current?.click();
              }}
            >
              <Zap size={13} /> Send P2P
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => onUploadFiles(e.target.files)}
        aria-label="Hidden file upload input"
      />

      <input
        ref={p2pFileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0] && onSendP2PFile) {
            onSendP2PFile(e.target.files[0]);
            e.target.value = '';
          }
        }}
        aria-label="Hidden P2P file upload input"
      />

      {/* Active WebRTC P2P Transfers */}
      {p2pTransfers.length > 0 && (
        <div className="px-3 mb-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-accent px-1">
            <span className="flex items-center gap-1.5">
              <Zap size={13} /> Active P2P Transfers ({p2pTransfers.length})
            </span>
          </div>
          {p2pTransfers.map((p) => (
            <div
              key={p.id}
              className="rounded-xl p-3 space-y-2"
              style={{
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(96, 165, 250, 0.25)',
              }}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 truncate mr-2">
                  {p.direction === 'send' ? (
                    <span className="flex items-center gap-1 text-sky-400 font-medium">
                      <ArrowUpRight size={13} /> Sending
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-400 font-medium">
                      <ArrowDownLeft size={13} /> Receiving
                    </span>
                  )}
                  <span className="truncate font-semibold" style={{ color: 'var(--text)' }}>
                    {p.fileName}
                  </span>
                  <span style={{ color: 'var(--text-faint)' }}>({formatFileSize(p.fileSize)})</span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {p.status === 'transferring' && (
                    <span className="text-[11px] font-mono text-accent">
                      {p.speed > 0 ? `${(p.speed / (1024 * 1024)).toFixed(1)} MB/s · ` : ''}
                      {p.progress}%
                    </span>
                  )}
                  {p.status === 'completed' && (
                    <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                      <CheckCircle2 size={13} /> Done
                    </span>
                  )}
                  {p.status === 'cancelled' && (
                    <span className="text-red-400 text-xs">Cancelled</span>
                  )}
                  {p.status === 'failed' && (
                    <span className="text-red-400 text-xs">Failed</span>
                  )}

                  {p.status === 'transferring' && onCancelP2PTransfer && (
                    <button
                      onClick={() => onCancelP2PTransfer(p.id)}
                      className="p-1 rounded hover:bg-red-500/20 text-red-400"
                      title="Cancel transfer"
                    >
                      <X size={14} />
                    </button>
                  )}

                  {(p.status === 'completed' || p.status === 'failed' || p.status === 'cancelled') && onClearP2PTransfer && (
                    <button
                      onClick={() => onClearP2PTransfer(p.id)}
                      className="p-1 rounded hover:bg-white/10"
                      style={{ color: 'var(--text-muted)' }}
                      title="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {p.status === 'transferring' && (
                <div className="progress-track" style={{ height: 4 }}>
                  <div className="progress-fill" style={{ width: `${p.progress}%` }} />
                </div>
              )}

              {p.status === 'completed' && p.direction === 'receive' && p.downloadUrl && (
                <div className="pt-1 flex justify-end">
                  <a
                    href={p.downloadUrl}
                    download={p.fileName}
                    className="btn-accent px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 rounded-lg"
                  >
                    <Download size={13} /> Save to Device
                  </a>
                </div>
              )}

              {p.error && (
                <p className="text-xs text-red-400">{p.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Uploads in Progress */}
      {uploads.length > 0 && (
        <div className="px-3 mb-2 space-y-2">
          {uploads.map(u => (
            <div key={u.id} className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex justify-between items-center text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                <span className="truncate flex-1 mr-2">{u.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span>{u.error ? '❌' : u.done ? '✅' : `${u.progress}%`}</span>
                  {!u.done && !u.error && !u.cancelled && (
                    <button
                      onClick={() => onCancelUpload(u.id)}
                      className="flex items-center justify-center w-5 h-5 rounded-full hover:bg-red-500/20 transition-colors"
                      style={{ color: '#ef4444' }}
                      title="Cancel upload"
                      aria-label="Cancel upload"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              {!u.error && (
                <div className="progress-track" style={{ height: 4 }}>
                  <div className="progress-fill" style={{ width: `${u.progress}%` }} />
                </div>
              )}
              {u.error && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{u.error}</p>}
            </div>
          ))}
        </div>
      )}

      {/* File List & Controls */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {files.length === 0 ? (
          <div className="text-center pt-12" style={{ color: 'var(--text-faint)' }}>
            <p className="text-4xl mb-3">📁</p>
            <p className="text-sm font-medium">No files uploaded yet</p>
            <p className="text-xs mt-1">Upload documents, code archives, videos, or photos</p>
          </div>
        ) : (
          <>
            {/* Action Bar */}
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {files.length} {files.length === 1 ? 'file' : 'files'} · {formatFileSize(totalBytes)} total
              </p>

              <div className="flex items-center gap-2">
                {selectedFileIds.size === 0 ? (
                  <>
                    <button onClick={selectAll} className="btn-ghost px-2 py-1 text-xs" aria-label="Select all files">
                      Select All
                    </button>
                    <button
                      onClick={() => downloadZip(files)}
                      className="btn-accent flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
                      aria-label="Download all files as zip"
                    >
                      <Download size={12} /> Download All (Zip)
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={deselectAll} className="btn-ghost px-2 py-1 text-xs" aria-label="Clear selection">
                      Clear ({selectedFileIds.size})
                    </button>
                    <button
                      onClick={() => downloadZip(files.filter(f => selectedFileIds.has(f.id)))}
                      className="btn-accent flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
                      aria-label="Download selected as zip"
                    >
                      <Download size={12} /> Zip ({selectedFileIds.size})
                    </button>
                    <button
                      onClick={() => downloadSequential(files.filter(f => selectedFileIds.has(f.id)))}
                      className="btn-accent flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
                      aria-label="Download selected individually"
                    >
                      <Download size={12} /> Individual
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Active Batch Download Banner */}
            {downloadProgress && (
              <div className="mb-3 p-3 rounded-lg flex items-center justify-between gap-2"
                style={{ background: 'var(--accent-glow)', border: '1px solid var(--accent)' }}>
                <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                  Downloading {downloadProgress.current} of {downloadProgress.total} files...
                </span>
                <button
                  onClick={handleCancelDownload}
                  className="btn-accent flex items-center gap-1 px-2 py-1 text-xs"
                  style={{ background: '#ef4444' }}
                  aria-label="Cancel active download"
                >
                  <X size={12} /> Cancel
                </button>
              </div>
            )}

            {/* Grid of Files */}
            <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {files.map(f => (
                <FileCard
                  key={f.id}
                  file={f}
                  roomId={roomId}
                  encryptionKey={encryptionKey}
                  selected={selectedFileIds.has(f.id)}
                  onSelect={toggleFileSelection}
                  onDelete={onDeleteFile}
                  onPreview={onPreviewFile}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

