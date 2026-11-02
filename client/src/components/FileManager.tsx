import React, { useRef, useState } from 'react';
import {
  Upload,
  Download,
  X,
  Zap,
  Cloud,
  Users,
  Trash2,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { FileCard } from './FileCard';
import { P2PFileCard } from './P2PFileCard';
import { formatFileSize } from '../utils/helpers';
import { downloadFilesAsZip, downloadFilesSequential } from '../utils/zipDownload';
import { triggerSave } from '../utils/download';
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
  onSendP2PFiles?: (files: FileList | File[]) => void;
  onCancelP2PTransfer?: (transferId: string) => void;
  onClearP2PTransfer?: (transferId: string) => void;
  onClearAllCompletedP2P?: () => void;
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
  onSendP2PFiles,
  onCancelP2PTransfer,
  onClearP2PTransfer,
  onClearAllCompletedP2P,
  onCancelUpload,
  onDeleteFile,
  onPreviewFile,
  onActivity,
}: Props) {
  // Mode switcher: 'cloud' or 'p2p'
  const [activeMode, setActiveMode] = useState<'cloud' | 'p2p'>('cloud');

  // Cloud file state
  const [cloudDragActive, setCloudDragActive] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

  // P2P file state
  const [p2pDragActive, setP2pDragActive] = useState(false);
  const [selectedP2PIds, setSelectedP2PIds] = useState<Set<string>>(new Set());

  // Batch download progress
  const [downloadProgress, setDownloadProgress] = useState<{
    type: 'zip' | 'individual';
    current: number;
    total: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const p2pFileInputRef = useRef<HTMLInputElement>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);

  // Cloud file calculations
  const totalCloudBytes = files.reduce((acc, f) => acc + f.size, 0);

  // P2P transfer partitions
  const activeP2P = p2pTransfers.filter(
    t => t.status === 'queued' || t.status === 'connecting' || t.status === 'transferring'
  );
  const p2pDisplayFiles = p2pTransfers.filter(t => t.status === 'completed' || Boolean(t.downloadUrl));
  const otherP2P = p2pTransfers.filter(t => (t.status === 'failed' || t.status === 'cancelled') && !t.downloadUrl);
  const totalP2PBytes = p2pDisplayFiles.reduce((acc, t) => acc + t.fileSize, 0);

  // ── Drag & Drop Handlers for Cloud ─────────────────────────────────────────
  const handleCloudDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setCloudDragActive(true);
  };

  const handleCloudDragLeave = () => setCloudDragActive(false);

  const handleCloudDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setCloudDragActive(false);
    onUploadFiles(e.dataTransfer.files);
  };

  // ── Drag & Drop Handlers for P2P ───────────────────────────────────────────
  const handleP2PDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setP2pDragActive(true);
  };

  const handleP2PDragLeave = () => setP2pDragActive(false);

  const handleP2PDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setP2pDragActive(false);
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

    if (onSendP2PFiles) {
      onSendP2PFiles(e.dataTransfer.files);
    } else if (onSendP2PFile) {
      Array.from(e.dataTransfer.files).forEach(f => onSendP2PFile(f));
    }
  };

  const handleP2PFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (onSendP2PFiles) {
      onSendP2PFiles(e.target.files);
    } else if (onSendP2PFile) {
      Array.from(e.target.files).forEach(f => onSendP2PFile(f));
    }
    e.target.value = '';
  };

  // ── Cloud Selection Handlers ───────────────────────────────────────────────
  const toggleFileSelection = (id: string) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllCloud = () => setSelectedFileIds(new Set(files.map(f => f.id)));
  const deselectAllCloud = () => setSelectedFileIds(new Set());

  // ── P2P Selection Handlers ─────────────────────────────────────────────────
  const toggleP2PSelection = (id: string) => {
    setSelectedP2PIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllP2P = () => setSelectedP2PIds(new Set(p2pDisplayFiles.map(t => t.id)));
  const deselectAllP2P = () => setSelectedP2PIds(new Set());

  // ── Download Handlers ──────────────────────────────────────────────────────
  const handleCancelDownload = () => {
    if (downloadAbortRef.current) {
      downloadAbortRef.current.abort();
      setDownloadProgress(null);
      downloadAbortRef.current = null;
      toast.error('Download cancelled');
    }
  };

  // Cloud Zip
  const downloadCloudZip = async (filesToDownload: FileData[]) => {
    if (filesToDownload.length === 0) return;
    downloadAbortRef.current = new AbortController();
    setDownloadProgress({ type: 'zip', current: 0, total: filesToDownload.length });

    try {
      await downloadFilesAsZip(
        filesToDownload.map(f => ({
          name: f.name,
          url: f.url,
          storage_path: f.storage_path,
          is_encrypted: f.is_encrypted,
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

  // Cloud Sequential
  const downloadCloudSequential = async (filesToDownload: FileData[]) => {
    if (filesToDownload.length === 0) return;
    downloadAbortRef.current = new AbortController();
    setDownloadProgress({ type: 'individual', current: 0, total: filesToDownload.length });

    try {
      await downloadFilesSequential(
        filesToDownload.map(f => ({
          name: f.name,
          url: f.url,
          storage_path: f.storage_path,
          is_encrypted: f.is_encrypted,
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

  // P2P Zip (Zero-Server, In-Memory via JSZip)
  const downloadP2PZip = async (transfersToDownload: P2PTransfer[]) => {
    const valid = transfersToDownload.filter(t => (t.status === 'completed' || t.downloadUrl) && t.downloadUrl);
    if (valid.length === 0) {
      toast.error('No completed P2P files to export');
      return;
    }

    downloadAbortRef.current = new AbortController();
    setDownloadProgress({ type: 'zip', current: 0, total: valid.length });

    try {
      await downloadFilesAsZip(
        valid.map(t => ({
          name: t.fileName,
          url: t.downloadUrl!,
          is_encrypted: false,
        })),
        `SyncPadIO-P2P-${roomId}`,
        (current, total) => setDownloadProgress({ type: 'zip', current, total }),
        downloadAbortRef.current.signal
      );
      toast.success('P2P Zip archive downloaded!');
      setSelectedP2PIds(new Set());
      onActivity();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'P2P Zip creation failed';
      if (msg !== 'Download cancelled') toast.error(msg);
    } finally {
      setDownloadProgress(null);
      downloadAbortRef.current = null;
    }
  };

  // P2P Sequential
  const downloadP2PSequential = async (transfersToDownload: P2PTransfer[]) => {
    const valid = transfersToDownload.filter(t => (t.status === 'completed' || t.downloadUrl) && t.downloadUrl);
    if (valid.length === 0) return;

    downloadAbortRef.current = new AbortController();
    setDownloadProgress({ type: 'individual', current: 0, total: valid.length });

    try {
      await downloadFilesSequential(
        valid.map(t => ({
          name: t.fileName,
          url: t.downloadUrl!,
          is_encrypted: false,
        })),
        (current, total) => setDownloadProgress({ type: 'individual', current, total }),
        downloadAbortRef.current.signal
      );
      toast.success('All selected P2P files saved!');
      setSelectedP2PIds(new Set());
      onActivity();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'P2P download failed';
      if (msg !== 'Download cancelled') toast.error(msg);
    } finally {
      setDownloadProgress(null);
      downloadAbortRef.current = null;
    }
  };

  // Download Single P2P file
  const handleDownloadSingleP2P = (transfer: P2PTransfer) => {
    if (!transfer.downloadUrl) return;
    if (transfer.blob) {
      triggerSave(transfer.blob, transfer.fileName);
    } else {
      const a = document.createElement('a');
      a.href = transfer.downloadUrl;
      a.download = transfer.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    toast.success(`Saved ${transfer.fileName}`);
  };

  // Preview P2P file
  const handlePreviewP2P = (fileData: FileData) => {
    onPreviewFile(fileData);
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* ── Mode Switcher Header ────────────────────────────────────────── */}
      <div className="p-2.5 border-b border-border flex items-center justify-between gap-2 flex-wrap" style={{ background: 'var(--surface-2)' }}>
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-surface border border-border text-xs">
          {/* Cloud Storage Tab */}
          <button
            onClick={() => setActiveMode('cloud')}
            className={`px-3 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              activeMode === 'cloud'
                ? 'bg-accent/15 text-accent shadow-sm border border-accent/30 font-semibold'
                : 'text-text-muted hover:text-text border border-transparent'
            }`}
            style={{ color: activeMode === 'cloud' ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            <Cloud size={13} />
            <span>Cloud Storage</span>
            <span
              className="text-[10px] px-1.5 py-0.2 rounded font-mono"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              {files.length}
            </span>
          </button>

          {/* Direct P2P Stream Tab */}
          <button
            onClick={() => setActiveMode('p2p')}
            className={`px-3 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              activeMode === 'p2p'
                ? 'bg-sky-500/15 text-sky-400 shadow-sm border border-sky-400/30 font-semibold'
                : 'text-text-muted hover:text-text border border-transparent'
            }`}
            style={{ color: activeMode === 'p2p' ? '#38bdf8' : 'var(--text-muted)' }}
          >
            <Zap size={13} className={activeP2P.length > 0 ? 'animate-pulse text-amber-400' : ''} />
            <span>Direct P2P Stream</span>
            {p2pTransfers.length > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold"
                style={{
                  background: activeP2P.length > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(56,189,248,0.2)',
                  color: activeP2P.length > 0 ? '#f59e0b' : '#38bdf8',
                }}
              >
                {p2pTransfers.length}
              </span>
            )}
            <span
              className="hidden sm:inline-block text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.2 rounded"
              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
            >
              Unlimited
            </span>
          </button>
        </div>

        {/* Global Peers / Network Indicator */}
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Users size={13} className={userCount > 1 ? 'text-emerald-400' : 'text-amber-400'} />
          <span className="text-[11px]">
            {userCount > 1 ? `${userCount - 1} peer(s) online` : 'Solo in room'}
          </span>
        </div>
      </div>

      {/* ── Active P2P Banner (Visible on Cloud Tab if transfer is in progress) ── */}
      {activeMode === 'cloud' && activeP2P.length > 0 && (
        <div
          className="mx-3 mt-2.5 p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all cursor-pointer hover:border-accent/40"
          style={{ background: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.3)' }}
          onClick={() => setActiveMode('p2p')}
        >
          <div className="flex items-center gap-2 text-xs">
            <Zap size={15} className="text-amber-400 animate-pulse" />
            <span className="font-semibold text-sky-300">
              {activeP2P.length} P2P Stream in Progress ({activeP2P[0].fileName})
            </span>
            <span className="text-[11px] font-mono text-zinc-300">
              {activeP2P[0].progress}%
            </span>
          </div>
          <button
            type="button"
            className="btn-accent px-2.5 py-1 text-xs font-semibold flex items-center gap-1 rounded"
          >
            <span>View P2P</span>
          </button>
        </div>
      )}

      {/* ── MODE 1: CLOUD STORAGE ───────────────────────────────────────── */}
      {activeMode === 'cloud' && (
        <div
          className="flex flex-col flex-1 overflow-hidden"
          onDragOver={handleCloudDragOver}
          onDragLeave={handleCloudDragLeave}
          onDrop={handleCloudDrop}
        >
          {/* Cloud Dropzone */}
          <div className="m-3 space-y-2">
            <div
              className={`rounded-xl border-2 border-dashed flex items-center justify-center gap-3 cursor-pointer transition-all ${
                cloudDragActive ? 'drag-active' : ''
              }`}
              style={{
                padding: '16px',
                borderColor: cloudDragActive ? 'var(--accent)' : 'var(--border)',
                minHeight: 74,
                background: cloudDragActive ? 'var(--accent-glow)' : 'transparent',
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Upload files dropzone"
              onKeyDown={(e) => { if (e.key === 'Enter') fileInputRef.current?.click(); }}
            >
              <Upload size={20} style={{ color: cloudDragActive ? 'var(--accent)' : 'var(--text-muted)' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: cloudDragActive ? 'var(--accent)' : 'var(--text)' }}>
                  {cloudDragActive ? 'Drop files to upload immediately' : 'Click or drag files to Cloud Storage'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Max 50 MB per file · E2EE Encrypted</p>
              </div>
            </div>

            {/* Hint to switch to P2P for large files */}
            <div
              className="p-2 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-colors hover:bg-white/5"
              style={{ background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.15)' }}
              onClick={() => setActiveMode('p2p')}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-accent" />
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Sending huge files or videos? Stream directly with <span className="font-semibold text-accent">P2P Unlimited Size</span>
                </span>
              </div>
              <span className="text-xs font-semibold text-accent">Switch ⚡</span>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => onUploadFiles(e.target.files)}
            aria-label="Hidden file upload input"
          />

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
                          className="flex items-center justify-center w-5 h-5 rounded-full hover:bg-red-500/20 transition-colors text-red-400"
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
                  {u.error && <p className="text-xs mt-1 text-red-400">{u.error}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Cloud File List */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {files.length === 0 ? (
              <div className="text-center pt-12" style={{ color: 'var(--text-faint)' }}>
                <p className="text-4xl mb-3">📁</p>
                <p className="text-sm font-medium">No cloud files uploaded yet</p>
                <p className="text-xs mt-1">Upload documents, code archives, videos, or photos</p>
              </div>
            ) : (
              <>
                {/* Action Bar */}
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {files.length} {files.length === 1 ? 'file' : 'files'} · {formatFileSize(totalCloudBytes)} total
                  </p>

                  <div className="flex items-center gap-2">
                    {selectedFileIds.size === 0 ? (
                      <>
                        <button onClick={selectAllCloud} className="btn-ghost px-2 py-1 text-xs" aria-label="Select all files">
                          Select All
                        </button>
                        <button
                          onClick={() => downloadCloudZip(files)}
                          className="btn-accent flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
                          aria-label="Download all files as zip"
                        >
                          <Download size={12} /> Download All (Zip)
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={deselectAllCloud} className="btn-ghost px-2 py-1 text-xs" aria-label="Clear selection">
                          Clear ({selectedFileIds.size})
                        </button>
                        <button
                          onClick={() => downloadCloudZip(files.filter(f => selectedFileIds.has(f.id)))}
                          className="btn-accent flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
                          aria-label="Download selected as zip"
                        >
                          <Download size={12} /> Zip ({selectedFileIds.size})
                        </button>
                        <button
                          onClick={() => downloadCloudSequential(files.filter(f => selectedFileIds.has(f.id)))}
                          className="btn-accent flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
                          aria-label="Download selected individually"
                        >
                          <Download size={12} /> Individual
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Batch Download Banner */}
                {downloadProgress && (
                  <div
                    className="mb-3 p-3 rounded-lg flex items-center justify-between gap-2"
                    style={{ background: 'var(--accent-glow)', border: '1px solid var(--accent)' }}
                  >
                    <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                      Downloading {downloadProgress.current} of {downloadProgress.total} files...
                    </span>
                    <button
                      onClick={handleCancelDownload}
                      className="btn-accent flex items-center gap-1 px-2 py-1 text-xs bg-red-500"
                      aria-label="Cancel active download"
                    >
                      <X size={12} /> Cancel
                    </button>
                  </div>
                )}

                {/* Cloud File Grid */}
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
      )}

      {/* ── MODE 2: DIRECT P2P STREAM (WEBRTC) ──────────────────────────── */}
      {activeMode === 'p2p' && (
        <div
          className="flex flex-col flex-1 overflow-hidden"
          onDragOver={handleP2PDragOver}
          onDragLeave={handleP2PDragLeave}
          onDrop={handleP2PDrop}
        >
          {/* P2P Dedicated Dropzone (Identical to Cloud Storage dropzone layout) */}
          <div className="m-3 space-y-2">
            <div
              className={`rounded-xl border-2 border-dashed flex items-center justify-center gap-3 cursor-pointer transition-all ${
                p2pDragActive ? 'drag-active' : ''
              }`}
              style={{
                padding: '16px',
                borderColor: p2pDragActive ? '#38bdf8' : 'var(--border)',
                minHeight: 74,
                background: p2pDragActive ? 'rgba(56,189,248,0.15)' : 'transparent',
              }}
              onClick={() => p2pFileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Direct P2P file dropzone"
              onKeyDown={(e) => { if (e.key === 'Enter') p2pFileInputRef.current?.click(); }}
            >
              <Zap size={20} style={{ color: p2pDragActive ? '#38bdf8' : 'var(--text-muted)' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: p2pDragActive ? '#38bdf8' : 'var(--text)' }}>
                  {p2pDragActive ? 'Drop files to stream immediately' : 'Click or drag files to Direct P2P Stream'}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                    Unlimited Size · Zero Cloud Storage · WebRTC P2P
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: userCount > 1 ? '#22c55e' : '#f59e0b' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    {userCount > 1
                      ? `Ready (${userCount - 1} peer${userCount - 1 > 1 ? 's' : ''} online)`
                      : 'Waiting for peer (invite peer above)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Hint to switch to Cloud Storage for persistent sharing (Exact match to Cloud banner) */}
            <div
              className="p-2 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-colors hover:bg-white/5"
              style={{ background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.15)' }}
              onClick={() => setActiveMode('cloud')}
            >
              <div className="flex items-center gap-2">
                <Cloud size={14} className="text-sky-400" />
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Need to store files when peers are offline? Upload to <span className="font-semibold text-sky-400">Cloud Storage</span>
                </span>
              </div>
              <span className="text-xs font-semibold text-sky-400">Switch ☁️</span>
            </div>
          </div>

          <input
            ref={p2pFileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleP2PFileInput}
            aria-label="Hidden P2P file input"
          />

          {/* Active P2P Streams Strip (Identical to Cloud uploads progress list) */}
          {activeP2P.length > 0 && (
            <div className="px-3 mb-3 space-y-2">
              {activeP2P.map((t) => (
                <div
                  key={t.id}
                  className="p-2.5 rounded-lg border transition-all"
                  style={{
                    background: 'var(--surface)',
                    borderColor: t.status === 'transferring' ? 'rgba(56, 189, 248, 0.4)' : 'var(--border)',
                  }}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-2 truncate">
                      <Zap
                        size={13}
                        className={t.status === 'transferring' ? 'text-sky-400 animate-pulse' : 'text-amber-400'}
                      />
                      <span className="font-medium truncate" style={{ color: 'var(--text)' }} title={t.fileName}>
                        {t.fileName}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        ({formatFileSize(t.fileSize)})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-zinc-300">
                        {t.status === 'queued'
                          ? 'Queued'
                          : t.status === 'connecting'
                          ? 'Connecting…'
                          : `${t.progress}%${t.speed > 0 ? ` · ${(t.speed / (1024 * 1024)).toFixed(1)} MB/s` : ''}`}
                      </span>
                      {onCancelP2PTransfer && (
                        <button
                          onClick={() => onCancelP2PTransfer(t.id)}
                          className="btn-ghost p-1 text-red-400 hover:text-red-300 transition-colors"
                          title="Cancel P2P transfer"
                          aria-label={`Cancel transfer of ${t.fileName}`}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${t.status === 'queued' ? 0 : t.progress}%`,
                        background: 'linear-gradient(90deg, #38bdf8, #60a5fa)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Completed P2P Transfers & Action Bar */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {p2pDisplayFiles.length === 0 && activeP2P.length === 0 && otherP2P.length === 0 ? (
              <div className="text-center pt-12" style={{ color: 'var(--text-faint)' }}>
                <p className="text-4xl mb-3">⚡</p>
                <p className="text-sm font-medium">No P2P files streamed yet</p>
                <p className="text-xs mt-1">
                  Stream high-res media, huge folders, or datasets directly device-to-device with 0 KB cloud limits
                </p>
              </div>
            ) : (
              <>
                {/* P2P Action Bar (Identical layout and controls to Cloud Action Bar) */}
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {p2pDisplayFiles.length} {p2pDisplayFiles.length === 1 ? 'file' : 'files'} · {formatFileSize(totalP2PBytes)} total
                  </p>

                  <div className="flex items-center gap-2">
                    {selectedP2PIds.size === 0 ? (
                      <>
                        {p2pDisplayFiles.length > 0 && (
                          <>
                            <button
                              onClick={selectAllP2P}
                              className="btn-ghost px-2 py-1 text-xs"
                              aria-label="Select all P2P files"
                            >
                              Select All
                            </button>
                            <button
                              onClick={() => downloadP2PZip(p2pDisplayFiles)}
                              className="btn-accent flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
                              aria-label="Download all P2P files as zip"
                            >
                              <Download size={12} /> Download All (Zip)
                            </button>
                          </>
                        )}
                        {(p2pDisplayFiles.length > 0 || otherP2P.length > 0) && (
                          <button
                            onClick={() => {
                              if (onClearAllCompletedP2P) onClearAllCompletedP2P();
                              else p2pDisplayFiles.forEach(t => onClearP2PTransfer?.(t.id));
                            }}
                            className="btn-ghost p-1 text-zinc-400 hover:text-red-400 rounded"
                            title="Clear completed transfer history"
                            aria-label="Clear all completed"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          onClick={deselectAllP2P}
                          className="btn-ghost px-2 py-1 text-xs"
                          aria-label="Clear P2P selection"
                        >
                          Clear ({selectedP2PIds.size})
                        </button>
                        <button
                          onClick={() => downloadP2PZip(p2pDisplayFiles.filter(t => selectedP2PIds.has(t.id)))}
                          className="btn-accent flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
                          aria-label="Download selected P2P files as zip"
                        >
                          <Download size={12} /> Zip ({selectedP2PIds.size})
                        </button>
                        <button
                          onClick={() => downloadP2PSequential(p2pDisplayFiles.filter(t => selectedP2PIds.has(t.id)))}
                          className="btn-accent flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
                          aria-label="Download selected P2P files individually"
                        >
                          <Download size={12} /> Individual
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Batch P2P Download Progress Banner */}
                {downloadProgress && (
                  <div
                    className="mb-3 p-3 rounded-lg flex items-center justify-between gap-2"
                    style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.4)' }}
                  >
                    <span className="text-xs font-medium text-white">
                      Packaging {downloadProgress.current} of {downloadProgress.total} P2P files...
                    </span>
                    <button
                      onClick={handleCancelDownload}
                      className="btn-accent flex items-center gap-1 px-2 py-1 text-xs bg-red-500"
                      aria-label="Cancel active P2P export"
                    >
                      <X size={12} /> Cancel
                    </button>
                  </div>
                )}

                {/* Grid of Completed and Inactive P2P Transfers (Matching Cloud Storage responsive grid exactly) */}
                <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                  {[...p2pDisplayFiles, ...otherP2P].map((p) => (
                    <P2PFileCard
                      key={p.id}
                      transfer={p}
                      selected={selectedP2PIds.has(p.id)}
                      onSelect={toggleP2PSelection}
                      onDownload={handleDownloadSingleP2P}
                      onCancel={onCancelP2PTransfer}
                      onDismiss={onClearP2PTransfer}
                      onPreview={handlePreviewP2P}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
