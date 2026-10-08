/**
 * Keep-Alive Utility
 * Periodically pings Supabase and Render backend to prevent them from pausing
 * 
 * Render (free tier): Auto-pauses after 30 minutes of inactivity
 * Supabase (free tier): Auto-pauses after 1 week of inactivity
 * 
 * Strategy:
 * - Ping every 3 minutes (aggressive)
 * - If no ping in 5 minutes, trigger emergency ping
 * - Both client and server ping to ensure coverage
 */
import { supabase } from '../supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fxjmaajktqehnaergnky.supabase.co';
const RENDER_URL = import.meta.env.VITE_RENDER_URL || '';

// Keep track of keep-alive status
const keepAliveStatus = {
  lastPingTime: 0,
  successCount: 0,
  failureCount: 0,
  isRunning: false
};

/**
 * Ping a service to keep it active
 */
const pingService = async (url: string, serviceName: string): Promise<boolean> => {
  if (!url) {
    console.warn(`⚠️  ${serviceName} URL not configured`);
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      signal: controller.signal
    }).catch(err => {
      console.warn(`⚠️  Failed to ping ${serviceName}:`, err.message);
      return null;
    }).finally(() => clearTimeout(timeout));

    if (response && response.ok) {
      keepAliveStatus.successCount++;
      keepAliveStatus.lastPingTime = Date.now();
      
      if (import.meta.env.DEV) {
        console.log(`✅ ${serviceName} pinged successfully (${response.status})`);
      }
      return true;
    } else {
      keepAliveStatus.failureCount++;
      console.warn(`⚠️  ${serviceName} ping failed with status ${response?.status}`);
      return false;
    }
  } catch (error) {
    keepAliveStatus.failureCount++;
    console.warn(`⚠️  Error pinging ${serviceName}:`, error);
    return false;
  }
};

/**
 * Ping Supabase database
 */
const pingSupabase = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('rooms').select('id').limit(1);
    if (error) {
      keepAliveStatus.failureCount++;
      console.warn(`⚠️  Supabase ping failed:`, error.message);
      return false;
    }
    
    keepAliveStatus.successCount++;
    keepAliveStatus.lastPingTime = Date.now();
    if (import.meta.env.DEV) console.log(`✅ Supabase pinged successfully`);
    return true;
  } catch (err) {
    keepAliveStatus.failureCount++;
    console.warn(`⚠️  Error pinging Supabase:`, err);
    return false;
  }
};

/**
 * Ping Render backend
 */
const pingRender = async (): Promise<boolean> => {
  if (!RENDER_URL) {
    if (import.meta.env.DEV) console.warn('⚠️  Render URL not configured');
    return false;
  }
  const healthUrl = `${RENDER_URL}/health`;
  return pingService(healthUrl, 'Render');
};

/**
 * Run all keep-alive checks
 */
const runKeepAliveChecks = async (): Promise<void> => {
  if (import.meta.env.DEV) console.log(`⏰ [${new Date().toLocaleTimeString()}] Running keep-alive checks...`);
  
  const [supabaseResult, renderResult] = await Promise.all([
    pingSupabase(),
    pingRender()
  ]);

  if (import.meta.env.DEV) {
    console.log(`📊 Keep-alive status - Supabase: ${supabaseResult ? '✅' : '❌'}, Render: ${renderResult ? '✅' : '❌'}`);
  }
};

/**
 * Start the keep-alive service
 * Pings services every 3 minutes (more aggressive to prevent pause)
 * Also adds an emergency failsafe that triggers if no ping in 5 minutes
 */
export const startKeepAliveService = (): (() => void) => {
  if (keepAliveStatus.isRunning) {
    console.warn('⚠️  Keep-Alive Service is already running');
    return () => {};
  }

  keepAliveStatus.isRunning = true;

  if (import.meta.env.DEV) {
    console.log('🔄 Keep-Alive Service Started');
    console.log(`📍 Supabase: ${SUPABASE_URL}`);
    if (RENDER_URL) console.log(`📍 Render: ${RENDER_URL}`);
    console.log('⏱️  Ping interval: Every 3 minutes');
    console.log('🚨 Emergency failsafe: If no ping in 5 minutes, trigger extra ping');
  }

  // Run immediately on first load
  setTimeout(() => runKeepAliveChecks(), 1000);

  // Main interval: Every 3 minutes (180000ms) - more aggressive than 5 min
  const mainIntervalId = setInterval(() => {
    runKeepAliveChecks().catch(err => 
      console.error('Keep-alive check failed:', err)
    );
  }, 3 * 60 * 1000);

  // Emergency failsafe: Check every minute if we haven't pinged in 5 minutes
  const failsafeIntervalId = setInterval(() => {
    const timeSinceLastPing = (Date.now() - keepAliveStatus.lastPingTime) / 1000 / 60;
    if (timeSinceLastPing > 5) {
      console.warn(`🚨 EMERGENCY: No ping in ${Math.floor(timeSinceLastPing)} minutes! Triggering failsafe ping...`);
      runKeepAliveChecks().catch(err => 
        console.error('Emergency keep-alive check failed:', err)
      );
    }
  }, 1 * 60 * 1000);

  // Return cleanup function
  return () => {
    clearInterval(mainIntervalId);
    clearInterval(failsafeIntervalId);
    keepAliveStatus.isRunning = false;
    if (import.meta.env.DEV) console.log('🔄 Keep-Alive Service Stopped');
  };
};

/**
 * Manual trigger for keep-alive check
 */
export const triggerKeepAlive = async (): Promise<void> => {
  if (import.meta.env.DEV) console.log('🔄 Manual keep-alive trigger');
  await runKeepAliveChecks();
};

/**
 * Get current keep-alive status
 */
export const getKeepAliveStatus = () => keepAliveStatus;

export default {
  startKeepAliveService,
  triggerKeepAlive,
  pingSupabase,
  pingRender,
  getKeepAliveStatus
};
