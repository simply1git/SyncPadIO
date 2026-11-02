/**
 * Audio, Haptics, and Screen Wake Lock Utilities
 * Designed for mobile-first P2P transfer feedback & reliability
 */

// ── Web Audio Chime Synthesis ──────────────────────────────────────────────
let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioCtx();
    }
    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {
        // User gesture may be required; ignore silently
      });
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

/**
 * Plays a modern, pleasant synthesized two-tone success chime
 * (Zero MP3 files, zero network request, works offline)
 */
export function playSuccessChime(): void {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;

    // Tone 1: D5 (587.33 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.15);

    // Tone 2: A5 (880 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.08);

    gain2.gain.setValueAtTime(0.001, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.15, now + 0.10);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.08);
    osc2.stop(now + 0.36);
  } catch {
    // Graceful fallback if audio is restricted
  }
}

// ── Mobile Haptic Vibration ────────────────────────────────────────────────
/**
 * Triggers subtle tactile haptic pulses on mobile devices
 */
export function triggerHapticSuccess(): void {
  if (typeof window !== 'undefined' && 'navigator' in window && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([35, 45, 35]);
    } catch {
      // Ignored
    }
  }
}

// ── Screen Wake Lock (Prevents Mobile Sleep During Large Transfers) ──────────
class WakeLockController {
  private sentinel: unknown = null;
  private activeCount = 0;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.activeCount > 0) {
          this.acquireLock();
        }
      });
    }
  }

  public retain(): void {
    this.activeCount++;
    if (this.activeCount === 1) {
      this.acquireLock();
    }
  }

  public release(): void {
    if (this.activeCount > 0) {
      this.activeCount--;
      if (this.activeCount === 0) {
        this.dropLock();
      }
    }
  }

  private async acquireLock(): Promise<void> {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as unknown as { wakeLock?: { request: (type: string) => Promise<{ release: () => Promise<void> }> } };
    if (!nav.wakeLock?.request) return;

    try {
      this.sentinel = await nav.wakeLock.request('screen');
    } catch {
      this.sentinel = null;
    }
  }

  private dropLock(): void {
    if (this.sentinel && typeof (this.sentinel as { release: () => Promise<void> }).release === 'function') {
      try {
        (this.sentinel as { release: () => Promise<void> }).release().catch(() => {});
      } catch {
        // Ignored
      }
      this.sentinel = null;
    }
  }
}

export const wakeLock = new WakeLockController();
