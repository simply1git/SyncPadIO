/**
 * Keep-Alive Service
 * Lightweight background ping service to prevent Supabase Free Tier auto-pause.
 * - Pings once on initialization
 * - Runs every 15 minutes ONLY when tab is visible
 * - Fully stops when the page is unloaded
 */
import { supabase } from '../supabaseClient';

const PING_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let isServiceRunning = false;
let pingIntervalId: ReturnType<typeof setInterval> | null = null;

export const pingSupabase = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('rooms').select('id').limit(1);
    if (error) {
      if (import.meta.env.DEV) console.warn('[KeepAlive] Supabase ping notice:', error.message);
      return false;
    }
    if (import.meta.env.DEV) console.log('[KeepAlive] Supabase ping successful');
    return true;
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[KeepAlive] Supabase ping failed:', err);
    return false;
  }
};

export const startKeepAliveService = (): (() => void) => {
  if (isServiceRunning) return () => {};
  isServiceRunning = true;

  // Run initial ping after 5 seconds
  const initTimeout = setTimeout(() => {
    if (!document.hidden) pingSupabase();
  }, 5000);

  // Periodic ping every 15 minutes if active
  pingIntervalId = setInterval(() => {
    if (!document.hidden) {
      pingSupabase();
    }
  }, PING_INTERVAL_MS);

  // Cleanup handler
  return () => {
    clearTimeout(initTimeout);
    if (pingIntervalId) clearInterval(pingIntervalId);
    isServiceRunning = false;
  };
};

export default {
  startKeepAliveService,
  pingSupabase,
};
