import { useState, FormEvent } from 'react';
import { Fingerprint, Lock, KeyRound, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { verifyRoomPasskey, setRoomLocked } from '../utils/webAuthn';

interface Props {
  roomId: string;
  onUnlocked: () => void;
  onLeaveRoom: () => void;
}

export function LockScreen({ roomId, onUnlocked, onLeaveRoom }: Props) {
  const [loading, setLoading] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [showPassphraseInput, setShowPassphraseInput] = useState(false);

  const handleBiometricUnlock = async () => {
    setLoading(true);
    try {
      const verified = await verifyRoomPasskey(roomId);
      if (verified) {
        toast.success('Room unlocked with Biometrics');
        onUnlocked();
      } else {
        toast.error('Biometric verification cancelled or failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Biometric verification failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePassphraseUnlock = (e: FormEvent) => {
    e.preventDefault();
    if (passphrase.trim().toUpperCase() === roomId.toUpperCase()) {
      setRoomLocked(roomId, false);
      toast.success('Room unlocked');
      onUnlocked();
    } else {
      toast.error('Incorrect room code passphrase');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
      style={{
        background: 'rgba(10, 10, 10, 0.95)',
        backdropFilter: 'blur(20px)',
        color: 'var(--text)',
      }}
    >
      <div
        className="w-full max-w-sm p-8 rounded-3xl text-center shadow-2xl space-y-6"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
      >
        <div
          className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(96,165,250,0.2), rgba(96,165,250,0.05))',
            border: '1px solid var(--accent)',
            boxShadow: '0 0 30px rgba(96,165,250,0.25)',
          }}
        >
          <Lock size={32} style={{ color: 'var(--accent)' }} />
        </div>

        <div>
          <h2 className="text-2xl font-bold tracking-tight">Session Locked</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Room <span className="font-mono text-accent font-bold">{roomId}</span> is secured
          </p>
        </div>

        <button
          onClick={handleBiometricUnlock}
          disabled={loading}
          className="btn-accent w-full py-3.5 text-base font-semibold flex items-center justify-center gap-2.5 shadow-lg"
          style={{ boxShadow: '0 4px 20px rgba(96,165,250,0.3)' }}
        >
          <Fingerprint size={20} />
          {loading ? 'Authenticating…' : 'Unlock with Biometrics'}
        </button>

        {!showPassphraseInput ? (
          <button
            onClick={() => setShowPassphraseInput(true)}
            className="btn-ghost w-full py-2 text-xs flex items-center justify-center gap-1.5"
            style={{ color: 'var(--text-muted)' }}
          >
            <KeyRound size={13} />
            Unlock with Room Code
          </button>
        ) : (
          <form onSubmit={handlePassphraseUnlock} className="space-y-2 text-left">
            <label className="block text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
              ENTER ROOM CODE AS PASSPHRASE
            </label>
            <div className="flex gap-2">
              <input
                className="input-dark flex-1 px-3 py-2 text-sm font-mono uppercase tracking-widest"
                placeholder={roomId}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn-accent px-4 py-2 text-xs font-semibold">
                Unlock
              </button>
            </div>
          </form>
        )}

        <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onLeaveRoom}
            className="btn-ghost w-full py-2 text-xs flex items-center justify-center gap-1.5 text-red-400 hover:bg-red-500/10"
          >
            <LogOut size={13} />
            Leave Session
          </button>
        </div>
      </div>
    </div>
  );
}
