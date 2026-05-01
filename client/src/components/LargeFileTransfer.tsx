import React, { useRef, useState } from 'react';
import { Upload, Download, CheckCircle, AlertCircle, Zap } from 'lucide-react';

interface LargeFileTransferProps {
  onFilesSelected: (files: File[]) => void;
  isTransferring: boolean;
  progress: number;
  speed: number; // bytes/sec
  eta: number; // seconds
  status: 'idle' | 'connecting' | 'connected' | 'transferring' | 'completed' | 'error';
  error?: string;
  dragActive: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

const formatTime = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
};

export const LargeFileTransfer: React.FC<LargeFileTransferProps> = ({
  onFilesSelected,
  isTransferring,
  progress,
  speed,
  eta,
  status,
  error,
  dragActive,
  onDragEnter,
  onDragLeave,
  onDrop,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files) {
      onFilesSelected(Array.from(files));
      if (files.length === 1) {
        setSelectedFile(files[0]);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files) {
      onFilesSelected(Array.from(files));
      if (files.length === 1) {
        setSelectedFile(files[0]);
      }
    }
    onDrop(e);
  };

  const statusColors = {
    idle: 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900',
    connecting: 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900',
    connected: 'border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900',
    transferring: 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900',
    completed: 'border-emerald-300 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900',
    error: 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900',
  };

  const statusIcons = {
    idle: <Upload className="w-6 h-6 text-slate-500" />,
    connecting: <Zap className="w-6 h-6 text-blue-500 animate-pulse" />,
    connected: <Zap className="w-6 h-6 text-green-500" />,
    transferring: <Download className="w-6 h-6 text-amber-500 animate-bounce" />,
    completed: <CheckCircle className="w-6 h-6 text-emerald-500" />,
    error: <AlertCircle className="w-6 h-6 text-red-500" />,
  };

  const statusText = {
    idle: 'Ready for large files',
    connecting: 'Connecting to peer...',
    connected: 'Connected via WebRTC P2P',
    transferring: 'Transferring...',
    completed: 'Transfer complete!',
    error: 'Transfer failed',
  };

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <div
        className={`border-2 rounded-lg p-4 transition-colors ${statusColors[status]}`}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex items-center gap-3 mb-3">
          {statusIcons[status]}
          <div>
            <h3 className="font-semibold text-sm">{statusText[status]}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Peer-to-peer WebRTC transfer • No server upload needed
            </p>
          </div>
        </div>

        {/* Upload Button Area */}
        {status === 'idle' && (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragActive
                ? 'border-blue-500 bg-blue-100 dark:bg-blue-900'
                : 'border-slate-300 dark:border-slate-600'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className="w-10 h-10 mx-auto mb-2 text-slate-400" />
            <p className="text-sm font-medium">Drag files here or click to browse</p>
            <p className="text-xs text-slate-500 mt-1">Supports files up to 5GB per transfer</p>
          </div>
        )}
      </div>

      {/* Transfer Progress */}
      {isTransferring && (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          {/* File Info */}
          {selectedFile && (
            <div className="mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
              <p className="text-sm font-medium">{selectedFile.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatBytes(selectedFile.size)}
              </p>
            </div>
          )}

          {/* Progress Bar */}
          <div className="mb-3">
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-green-500 h-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm font-semibold mt-1">{progress}% complete</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400">Speed</p>
              <p className="text-sm font-semibold">{formatBytes(speed)}/s</p>
            </div>
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400">Time Remaining</p>
              <p className="text-sm font-semibold">{formatTime(eta)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400">Total Size</p>
              <p className="text-sm font-semibold">
                {selectedFile ? formatBytes(selectedFile.size) : '—'}
              </p>
            </div>
          </div>

          {/* Info */}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Direct peer connection • No data stored on servers
          </p>
        </div>
      )}

      {/* Completion */}
      {status === 'completed' && (
        <div className="bg-emerald-50 dark:bg-emerald-900 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <p className="font-semibold text-emerald-900 dark:text-emerald-100">Transfer Complete!</p>
          </div>
          <p className="text-sm text-emerald-800 dark:text-emerald-200">
            {selectedFile && (
              <>
                <strong>{selectedFile.name}</strong> ({formatBytes(selectedFile.size)}) received successfully
              </>
            )}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <p className="font-semibold text-red-900 dark:text-red-100">Transfer Failed</p>
          </div>
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}
    </div>
  );
};
