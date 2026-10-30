import { X, Clock, Zap, CheckCircle2, Shield, Info } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isCreator: boolean;
  keepAlive24h: boolean;
  onToggle24h: (enabled: boolean) => void;
}

export function SessionLifetimeModal({
  isOpen,
  onClose,
  isCreator,
  keepAlive24h,
  onToggle24h,
}: Props) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Session Retention Policy Information"
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 shadow-2xl transition-all"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="p-2 rounded-xl"
              style={{
                background: keepAlive24h ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.08)',
                color: keepAlive24h ? 'var(--accent)' : 'var(--text)',
              }}
            >
              {keepAlive24h ? <Clock size={22} /> : <Zap size={22} />}
            </div>
            <div>
              <h3 className="font-bold text-base">Session Retention Policy</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                How this room and its data expire
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost p-1.5 rounded-lg"
            aria-label="Close retention modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Current Active Status Banner */}
        <div
          className="p-3.5 rounded-xl mb-5 flex items-start gap-3"
          style={{
            background: keepAlive24h ? 'rgba(96,165,250,0.1)' : 'rgba(245,158,11,0.1)',
            border: keepAlive24h ? '1px solid rgba(96,165,250,0.25)' : '1px solid rgba(245,158,11,0.25)',
          }}
        >
          <div className="mt-0.5">
            {keepAlive24h ? (
              <Clock size={18} className="text-accent" />
            ) : (
              <Zap size={18} className="text-amber-400" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: keepAlive24h ? 'var(--accent)' : '#f59e0b' }}>
                {keepAlive24h ? '24-Hour Safe Room Active' : 'Default Ephemeral Mode Active'}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-white/10 text-white/80">
                Current Mode
              </span>
            </div>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {keepAlive24h
                ? 'This session is configured to stay preserved for 24 hours of inactivity. It will not be deleted when peers leave or disconnect.'
                : 'This session is in standard ephemeral mode. It automatically purges 5 minutes after all users leave, or after 1 hour of total inactivity.'}
            </p>
          </div>
        </div>

        {/* Informative Side-by-Side Comparison */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {/* Default Ephemeral Card */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${!keepAlive24h ? 'ring-2 ring-amber-400/40' : 'opacity-70'}`}
            style={{
              background: 'var(--surface-2)',
              borderColor: !keepAlive24h ? '#f59e0b' : 'var(--border)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                <Zap size={15} />
                <span>Default Ephemeral</span>
              </div>
              {!keepAlive24h && <CheckCircle2 size={14} className="text-amber-400" />}
            </div>
            <ul className="text-[11px] space-y-1.5" style={{ color: 'var(--text-muted)' }}>
              <li>• Purged 5m after all users leave</li>
              <li>• Purged after 1h idle</li>
              <li>• Maximum zero-footprint privacy</li>
              <li>• Ideal for quick transient transfers</li>
            </ul>
          </div>

          {/* 24-Hour Safe Room Card */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${keepAlive24h ? 'ring-2 ring-accent/40' : 'opacity-70'}`}
            style={{
              background: 'var(--surface-2)',
              borderColor: keepAlive24h ? 'var(--accent)' : 'var(--border)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-accent font-semibold text-xs">
                <Clock size={15} />
                <span>Creator 24h Safe Room</span>
              </div>
              {keepAlive24h && <CheckCircle2 size={14} className="text-accent" />}
            </div>
            <ul className="text-[11px] space-y-1.5" style={{ color: 'var(--text-muted)' }}>
              <li>• Preserved for full 24 hours</li>
              <li>• Stays alive even when empty</li>
              <li>• Resets 24h on any peer action</li>
              <li>• Ideal for all-day collaboration</li>
            </ul>
          </div>
        </div>

        {/* Creator Control or Guest Notice */}
        {isCreator ? (
          <div
            className="p-4 rounded-xl space-y-3"
            style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-accent" />
                <span className="text-xs font-bold text-accent">Room Creator Controls</span>
              </div>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                You are Creator
              </span>
            </div>

            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              As the room creator, you can switch this room between Ephemeral and 24-Hour Safe mode at any time. Changes take effect across all connected peers immediately.
            </p>

            <button
              onClick={() => onToggle24h(!keepAlive24h)}
              className="btn-accent w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
            >
              {keepAlive24h ? (
                <>
                  <Zap size={14} /> Switch to Default Ephemeral Mode
                </>
              ) : (
                <>
                  <Clock size={14} /> Enable 24-Hour Safe Room Retention
                </>
              )}
            </button>
          </div>
        ) : (
          <div
            className="p-3.5 rounded-xl flex items-center gap-2.5 text-xs"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            <Info size={16} className="flex-shrink-0 text-accent" />
            <span>
              You joined as a guest. The retention policy is managed by the room creator.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
