import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  CameraDevice,
} from 'html5-qrcode';
import {
  X,
  Camera,
  SwitchCamera,
  Upload,
  AlertCircle,
  CheckCircle2,
  ScanLine,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { parseQrCodeData } from '../utils/helpers';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (roomCode: string, encryptionKey?: string) => void;
}

export function QRScannerModal({ isOpen, onClose, onScanSuccess }: Props) {
  const containerId = 'syncpad-qr-scanner-viewport';
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(0);
  const [isInitializing, setIsInitializing] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
      } catch {
        // Ignored
      }
      try {
        scannerRef.current.clear();
      } catch {
        // Ignored
      }
      scannerRef.current = null;
    }
  }, []);

  const handleDecodedText = useCallback(
    async (decodedText: string) => {
      const { roomCode, encryptionKey } = parseQrCodeData(decodedText);
      if (!roomCode) {
        toast.error('Scanned QR code does not contain a valid SyncPadIO room', { duration: 3000 });
        return;
      }

      setDetectedCode(roomCode);
      toast.success(`Room code detected: ${roomCode}`, { icon: '⚡' });

      // Cleanly stop camera
      await stopScanner();

      // Brief delay to give visual confirmation
      setTimeout(() => {
        onScanSuccess(roomCode, encryptionKey);
        onClose();
      }, 400);
    },
    [onScanSuccess, onClose, stopScanner]
  );

  const startScanner = useCallback(
    async (cameraId?: string) => {
      setIsInitializing(true);
      setCameraError(null);

      // Clean up previous instance if running
      await stopScanner();

      const el = document.getElementById(containerId);
      if (!el) {
        setIsInitializing(false);
        return;
      }

      try {
        const scanner = new Html5Qrcode(containerId, {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        });
        scannerRef.current = scanner;

        // Fetch camera devices
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            setCameras(devices);
          }
        } catch {
          // Camera enumeration not supported or failed, continue with default
        }

        const config = {
          fps: 12,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1.0,
        };

        const targetConstraint = cameraId || { facingMode: 'environment' };

        try {
          await scanner.start(
            targetConstraint,
            config,
            (decodedText) => handleDecodedText(decodedText),
            () => {
              // Ignore frame decode errors
            }
          );
        } catch (firstErr) {
          // Fallback to user-facing camera if environment facingMode failed
          if (!cameraId) {
            await scanner.start(
              { facingMode: 'user' },
              config,
              (decodedText) => handleDecodedText(decodedText),
              () => {
                // Ignore frame decode errors
              }
            );
          } else {
            throw firstErr;
          }
        }

        setIsInitializing(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[QRScanner] Camera start failed:', msg);
        setIsInitializing(false);
        if (msg.includes('NotAllowedError') || msg.includes('Permission denied')) {
          setCameraError('Camera access was denied. Please allow camera permissions in your browser, or upload a QR screenshot.');
        } else {
          setCameraError('Camera not available or not detected. You can upload a QR image/screenshot below.');
        }
      }
    },
    [handleDecodedText, stopScanner]
  );

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      startScanner();
    }, 150);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      stopScanner();
    };
  }, [isOpen, onClose, startScanner, stopScanner]);

  const handleSwitchCamera = async () => {
    if (cameras.length <= 1) return;
    const nextIdx = (selectedCameraIndex + 1) % cameras.length;
    setSelectedCameraIndex(nextIdx);
    await startScanner(cameras[nextIdx].id);
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    try {
      let scanner = scannerRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;
      }
      const result = await scanner.scanFile(file, false);
      await handleDecodedText(result);
    } catch {
      toast.error('No QR code detected in this image. Try another screenshot or clear picture.');
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Scan Session QR Code"
    >
      <div
        className="modal-box p-5 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-accent/10 text-accent">
              <ScanLine size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                Scan Session QR Code
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Point camera at room code or upload a screenshot
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close QR scanner"
            className="btn-ghost p-1.5 rounded-lg text-text-muted hover:text-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Viewfinder Window */}
        <div className="relative rounded-xl overflow-hidden bg-black/80 aspect-square flex items-center justify-center border border-border">
          {/* html5-qrcode target mounting element */}
          <div
            id={containerId}
            className="w-full h-full object-cover"
            style={{ width: '100%', height: '100%' }}
          />

          {/* Scanner Overlay Visual Target */}
          {!cameraError && !detectedCode && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-52 h-52 border-2 border-dashed border-accent/60 rounded-2xl flex items-center justify-center">
                {/* 4 Corner Targeting Marks */}
                <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-accent rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-accent rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-accent rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-accent rounded-br-lg" />

                {/* Laser animation line */}
                <div
                  className="absolute left-2 right-2 h-0.5 bg-accent qr-scanner-laser"
                  style={{
                    boxShadow: '0 0 12px var(--accent), 0 0 24px var(--accent)',
                  }}
                />

                <span className="text-[11px] font-mono tracking-wide px-2 py-0.5 rounded bg-black/70 text-accent/90 border border-accent/20">
                  Align QR Code
                </span>
              </div>
            </div>
          )}

          {/* Camera Loading Spinner */}
          {isInitializing && !cameraError && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              <span className="text-xs text-text-muted">Activating camera…</span>
            </div>
          )}

          {/* Scanned Success Match Overlay */}
          {detectedCode && (
            <div className="absolute inset-0 bg-emerald-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-2 animate-fadeIn">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
                <CheckCircle2 size={28} />
              </div>
              <span className="text-sm font-bold text-emerald-300">Room Detected</span>
              <span className="font-mono text-base font-bold tracking-widest text-white px-3 py-1 rounded-md bg-black/40 border border-emerald-500/30">
                {detectedCode}
              </span>
            </div>
          )}

          {/* Camera Error / Fallback Box */}
          {cameraError && (
            <div className="absolute inset-0 p-5 flex flex-col items-center justify-center text-center bg-black/90">
              <AlertCircle size={32} className="text-amber-400 mb-2" />
              <p className="text-xs text-text-muted mb-4 max-w-[240px]">
                {cameraError}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-accent px-4 py-2 text-xs font-semibold flex items-center gap-2"
              >
                <Upload size={14} />
                Upload QR Screenshot
              </button>
            </div>
          )}
        </div>

        {/* Action Controls Bar */}
        <div className="mt-3 flex items-center justify-between gap-2">
          {/* Camera Switcher (shown if multiple cameras detected) */}
          {cameras.length > 1 && !cameraError ? (
            <button
              type="button"
              onClick={handleSwitchCamera}
              className="btn-ghost text-xs px-2.5 py-1.5 rounded-lg border border-border flex items-center gap-1.5 text-text-muted hover:text-text"
              title="Switch Camera"
            >
              <SwitchCamera size={14} className="text-accent" />
              <span>Flip Camera</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-text-muted">
              <Camera size={13} className="text-accent" />
              <span>Auto-detecting QR</span>
            </div>
          )}

          {/* Image Upload Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFilePicked}
            accept="image/*"
            className="hidden"
            id="qr-image-upload-input"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessingFile}
            className="btn-ghost text-xs px-2.5 py-1.5 rounded-lg border border-border flex items-center gap-1.5 text-text-muted hover:text-text hover:border-accent transition-all"
            title="Upload a QR code screenshot or image"
          >
            <Upload size={13} className="text-accent" />
            <span>{isProcessingFile ? 'Scanning file…' : 'Scan Image'}</span>
          </button>
        </div>

        {/* Footer Hint */}
        <p className="mt-3 pt-2 text-[10px] text-center border-t border-border/50 text-text-muted flex items-center justify-center gap-1">
          <Sparkles size={11} className="text-accent" />
          <span>Zero-Knowledge: keys in QR URLs are decrypted strictly in memory</span>
        </p>
      </div>
    </div>
  );
}
