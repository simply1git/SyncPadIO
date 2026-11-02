import { X, Smartphone, Monitor, Download, Share2, PlusSquare, Zap, ShieldCheck } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isIOS: boolean;
  hasNativePrompt: boolean;
  onInstall: () => Promise<boolean>;
}

export function InstallModal({
  isOpen,
  onClose,
  isIOS,
  hasNativePrompt,
  onInstall,
}: Props) {
  if (!isOpen) return null;

  const handleInstallClick = async () => {
    const success = await onInstall();
    if (success) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-5 shadow-2xl relative"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="btn-ghost absolute top-3.5 right-3.5 p-1 rounded-full text-zinc-400 hover:text-white"
          aria-label="Close install modal"
        >
          <X size={16} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(56,189,248,0.2), rgba(59,130,246,0.3))',
              border: '1px solid rgba(56,189,248,0.4)',
            }}
          >
            <Download size={20} className="text-sky-400" />
          </div>
          <div>
            <h3 className="text-base font-bold tracking-tight">Install SyncPadIO App</h3>
            <p className="text-xs text-zinc-400">Desktop & Mobile Standalone Experience</p>
          </div>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="p-2.5 rounded-xl border border-white/5 bg-white/[0.02]">
            <Zap size={14} className="text-amber-400 mb-1" />
            <p className="text-xs font-semibold">Line-Speed P2P</p>
            <p className="text-[10px] text-zinc-400">Direct disk streams without browser RAM bloat</p>
          </div>
          <div className="p-2.5 rounded-xl border border-white/5 bg-white/[0.02]">
            <ShieldCheck size={14} className="text-emerald-400 mb-1" />
            <p className="text-xs font-semibold">Zero URL Bar</p>
            <p className="text-[10px] text-zinc-400">Distraction-free native window & app icon</p>
          </div>
        </div>

        {/* Platform-Specific Install Action */}
        {hasNativePrompt ? (
          <div className="space-y-3">
            <p className="text-xs text-zinc-300">
              Install SyncPadIO on your device to launch from your desktop taskbar, dock, or phone home screen.
            </p>
            <button
              onClick={handleInstallClick}
              className="w-full btn-accent py-2.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg"
            >
              <Download size={16} />
              Install Application Now
            </button>
          </div>
        ) : isIOS ? (
          <div className="space-y-2.5 p-3 rounded-xl border border-sky-500/20 bg-sky-500/5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-sky-300">
              <Smartphone size={15} />
              <span>Install on iPhone / iPad (Safari)</span>
            </div>
            <ol className="space-y-2 text-zinc-300 text-[11px] list-decimal list-inside">
              <li>
                Tap the <Share2 size={12} className="inline mx-1 text-sky-400" /> <strong>Share</strong> icon in the bottom Safari toolbar.
              </li>
              <li>
                Scroll down and select <PlusSquare size={12} className="inline mx-1 text-sky-400" /> <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong>Add</strong> in the top-right corner to finish.
              </li>
            </ol>
          </div>
        ) : (
          <div className="space-y-2 text-xs text-zinc-300">
            <p>
              To install on your current browser:
            </p>
            <div className="p-3 rounded-xl border border-white/10 bg-white/5 space-y-1 text-[11px]">
              <p>• <strong>Chrome / Edge / Brave:</strong> Click the install icon in the right side of the address bar <code>(⊕)</code>.</p>
              <p>• <strong>Android:</strong> Open browser menu <code>(⋮)</code> and tap <strong>Install App</strong>.</p>
            </div>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-500">
          <span>Works offline with Service Workers</span>
          <span className="flex items-center gap-1 font-mono">
            <Monitor size={11} /> Win / Mac / Linux / iOS / Android
          </span>
        </div>
      </div>
    </div>
  );
}
