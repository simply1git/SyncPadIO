import { useState } from 'react';
import { Shield, ShieldAlert, Fingerprint, Trash2, Lock, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  isWebAuthnSupported,
  hasRoomPasskey,
  registerRoomPasskey,
  removeRoomPasskey,
  setRoomLocked,
} from '../utils/webAuthn';

interface Props {
  roomId: string;
  isOpen: boolean;
  onClose: () => void;
  onLockSession: () => void;
}

export function BiometricModal({ roomId, isOpen, onClose, onLockSession }: Props) {
  const [loading, setLoading] = useState(false);
  const isSupported = isWebAuthnSupported();
  const hasPasskey = hasRoomPasskey(roomId);

  if (!isOpen) return null;

  const handleRegister = async () => {
    setLoading(true);
    try {
      await registerRoomPasskey(roomId, 'Platform Authenticator');
      toast.success('Biometric Passkey registered successfully!');
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = () => {
    removeRoomPasskey(roomId);
    toast.success('Biometric passkey removed from this device');
    onClose();
  };

  const handleLockNow = () => {
    setRoomLocked(roomId, true);
    toast('Session locked with Biometrics', { icon: '🔒' });
    onLockSession();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl transition-all"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="p-2 rounded-xl"
              style={{ background: 'rgba(96,165,250,0.15)', color: 'var(--accent)' }}
            >
              <Fingerprint size={22} />
            </div>
            <div>
              <h3 className="font-bold text-base">Biometric Passkey Security</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Room <span className="font-mono text-xs">{roomId}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost p-1.5 rounded-lg"
            aria-label="Close biometric modal"
          >
            <X size={18} />
          </button>
        </div>

        {!isSupported ? (
          <div
            className="p-4 rounded-xl flex items-start gap-3 text-sm mb-4"
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
          >
            <ShieldAlert size={20} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Hardware Biometrics Unsupported</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Your browser or operating system does not support the WebAuthn standard (Touch ID,
                Face ID, or Windows Hello).
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Lock this session locally using your device&apos;s biometric sensors (Touch ID, Face ID,
              or Windows Hello). Cryptographic keys never leave this device.
            </p>

            {hasPasskey ? (
              <div className="space-y-3">
                <div
                  className="p-3.5 rounded-xl flex items-center justify-between"
                  style={{
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.25)',
                  }}
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
                    <Shield size={16} />
                    <span>Passkey Configured on this Device</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleLockNow}
                    className="btn-accent flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    <Lock size={15} /> Lock Session Now
                  </button>
                  <button
                    onClick={handleRemove}
                    className="btn-ghost px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-1.5"
                    title="Remove passkey"
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <button
                  onClick={handleRegister}
                  disabled={loading}
                  className="btn-accent w-full py-3 text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <Fingerprint size={16} />
                  {loading ? 'Registering Device Sensor…' : 'Enable Biometric Lock'}
                </button>
                <p className="text-[11px] text-center mt-2" style={{ color: 'var(--text-faint)' }}>
                  Enables 1-touch locking & biometric unlock on this device
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
