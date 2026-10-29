import React, { useRef, useState } from 'react';
import { Upload, Download, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { FileCard } from './FileCard';
import { formatFileSize } from '../utils/helpers';
import { downloadFilesAsZip, downloadFilesSequential } from '../utils/zipDownload';
import { FileData, UploadItem } from '../types';

interface Props {
  files: FileData[];
  uploads: UploadItem[];
  roomId: string;
  encryptionKey?: string;
  onUploadFiles: (files: FileList | null) => void;
  onCancelUpload: (id: string) => void;
  onDeleteFile: (id: string, url: string) => void;
  onPreviewFile: (file: FileData) => void;
  onActivity: () => void;
}

export function FileManager({
  files,
  uploads,
  roomId,
  encryptionKey,
  onUploadFiles,
  onCancelUpload,
  onDeleteFile,
  onPreviewFile,
  onActivity,
}: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<{ type: 'zip' | 'individual'; current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      {/* Drop Zone */}
      <div
        className={`m-3 rounded-xl border-2 border-dashed flex items-center justify-center gap-3 cursor-pointer transition-all ${dragActive ? 'drag-active' : ''}`}
        style={{
          padding: '20px',
          borderColor: dragActive ? 'var(--accent)' : 'var(--border)',
          minHeight: 80,
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
            {dragActive ? 'Drop files to upload immediately' : 'Click or drag files here'}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Max 50 MB per file · Any format</p>
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

