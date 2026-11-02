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
  const activeP2P = p2pTransfers.filter(t => t.status === 'connecting' || t.status === 'transferring');
  const completedP2P = p2pTransfers.filter(t => t.status === 'completed');
  const otherP2P = p2pTransfers.filter(t => t.status === 'failed' || t.status === 'cancelled');
  const totalP2PBytes = completedP2P.reduce((acc, t) => acc + t.fileSize, 0);

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

  const selectAllP2P = () => setSelectedP2PIds(new Set(completedP2P.map(t => t.id)));
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
    const valid = transfersToDownload.filter(t => t.status === 'completed' && t.downloadUrl);
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
    const valid = transfersToDownload.filter(t => t.status === 'completed' && t.downloadUrl);
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
          {/* P2P Dedicated Dropzone */}
          <div className="m-3 space-y-2">
            <div
              className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all ${
                p2pDragActive ? 'drag-active' : ''
              }`}
              style={{
                borderColor: p2pDragActive ? '#38bdf8' : 'rgba(56,189,248,0.3)',
                background: p2pDragActive ? 'rgba(56,189,248,0.15)' : 'rgba(15,23,42,0.4)',
                minHeight: 110,
              }}
              onClick={() => p2pFileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Direct P2P file dropzone"
              onKeyDown={(e) => { if (e.key === 'Enter') p2pFileInputRef.current?.click(); }}
            >
              <div className="w-10 h-10 rounded-xl mb-2 flex items-center justify-center bg-sky-500/15 text-sky-400">
                <Zap size={22} />
              </div>
              <p className="text-sm font-semibold text-white">
                {p2pDragActive
                  ? 'Drop files to stream directly via WebRTC'
                  : 'Drop or browse files to stream directly to peers'}
              </p>
              <p className="text-xs mt-0.5 text-zinc-400">
                Unlimited Size · Zero Server Storage · Multi-file supported
              </p>

              {/* Peer status indication inside dropzone */}
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full"
                style={{
                  background: userCount > 1 ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                  color: userCount > 1 ? '#22c55e' : '#f59e0b',
                  border: userCount > 1 ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(245,158,11,0.3)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                <span>
                  {userCount > 1
                    ? `Ready to stream to ${userCount - 1} connected peer(s)`
                    : 'Invite a peer to room to enable real-time streaming'}
                </span>
              </div>
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

          {/* Active Transfers Banner */}
          {activeP2P.length > 0 && (
            <div className="px-3 mb-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-sky-400 px-1">
                <span className="flex items-center gap-1.5">
                  <Zap size={13} className="animate-pulse" /> Streaming Now ({activeP2P.length})
                </span>
              </div>
              <div className="space-y-2">
                {activeP2P.map((p) => (
                  <P2PFileCard
                    key={p.id}
                    transfer={p}
                    onDownload={handleDownloadSingleP2P}
                    onCancel={onCancelP2PTransfer}
                    onDismiss={onClearP2PTransfer}
                    onPreview={handlePreviewP2P}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed P2P Transfers & Action Bar */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {completedP2P.length === 0 && activeP2P.length === 0 && otherP2P.length === 0 ? (
              <div className="text-center pt-10 px-4" style={{ color: 'var(--text-faint)' }}>
                <div
                  className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                  style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)' }}
                >
                  <Zap size={28} className="text-sky-400" />
                </div>
                <p className="text-base font-semibold text-white">Direct Peer-to-Peer Streaming</p>
                <p className="text-xs mt-1 max-w-sm mx-auto text-zinc-400">
                  Send high-resolution videos, full codebases, or disk images directly from device to device. Zero cloud limits, zero server storage.
                </p>
                <button
                  type="button"
                  onClick={() => p2pFileInputRef.current?.click()}
                  className="mt-4 btn-accent px-4 py-2 text-xs font-semibold inline-flex items-center gap-1.5 rounded-lg"
                >
                  <Zap size={14} /> Select Files to Stream
                </button>
              </div>
            ) : (
              <>
                {/* P2P Action Bar */}
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <p className="text-xs text-zinc-400">
                    {completedP2P.length} {completedP2P.length === 1 ? 'file' : 'files'} · {formatFileSize(totalP2PBytes)} streamed · 0 MB cloud storage
                  </p>

                  <div className="flex items-center gap-2">
                    {selectedP2PIds.size === 0 ? (
                      <>
                        {completedP2P.length > 0 && (
                          <>
                            <button
                              onClick={selectAllP2P}
                              className="btn-ghost px-2 py-1 text-xs"
                              aria-label="Select all P2P files"
                            >
                              Select All
                            </button>
                            <button
                              onClick={() => downloadP2PZip(completedP2P)}
                              className="btn-accent flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
                              aria-label="Download all P2P files as zip"
                            >
                              <Download size={12} /> Save All (Zip)
                            </button>
                          </>
                        )}
                        {(completedP2P.length > 0 || otherP2P.length > 0) && (
                          <button
                            onClick={() => {
                              if (onClearAllCompletedP2P) onClearAllCompletedP2P();
                              else completedP2P.forEach(t => onClearP2PTransfer?.(t.id));
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
                          onClick={() => downloadP2PZip(completedP2P.filter(t => selectedP2PIds.has(t.id)))}
                          className="btn-accent flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
                          aria-label="Download selected P2P files as zip"
                        >
                          <Download size={12} /> Zip ({selectedP2PIds.size})
                        </button>
                        <button
                          onClick={() => downloadP2PSequential(completedP2P.filter(t => selectedP2PIds.has(t.id)))}
                          className="btn-accent flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
                          aria-label="Download selected P2P files individually"
                        >
                          <Download size={12} /> Save ({selectedP2PIds.size})
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

                {/* Grid of Completed and Inactive P2P Transfers */}
                <div
                  className="grid grid-cols-2 gap-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
                >
                  {[...completedP2P, ...otherP2P].map((p) => (
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
