/**
 * Keep-Alive Utility
 * Periodically pings Supabase and Render backend to prevent them from pausing
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fxjmaajktqehnaergnky.supabase.co';
const RENDER_URL = import.meta.env.VITE_RENDER_URL || '';

// Keep track of last ping times for logging
const lastPingTimes: Record<string, number> = {
  supabase: 0,
  render: 0
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
      lastPingTimes[serviceName.toLowerCase()] = Date.now();
      
      console.log(`✅ ${serviceName} pinged successfully (${response.status})`);
      return true;
    } else {
      console.warn(`⚠️  ${serviceName} ping failed with status ${response?.status}`);
      return false;
    }
  } catch (error) {
    console.warn(`⚠️  Error pinging ${serviceName}:`, error);
    return false;
  }
};

/**
 * Ping Supabase database
 */
const pingSupabase = async (): Promise<boolean> => {
  // Ping a simple Supabase endpoint that doesn't require auth
  const healthUrl = `${SUPABASE_URL}/rest/v1/health`;
  return pingService(healthUrl, 'Supabase');
};

/**
 * Ping Render backend
 */
const pingRender = async (): Promise<boolean> => {
  if (!RENDER_URL) {
    console.warn('⚠️  Render URL not configured');
    return false;
  }
  const healthUrl = `${RENDER_URL}/health`;
  return pingService(healthUrl, 'Render');
};

/**
 * Run all keep-alive checks
 */
const runKeepAliveChecks = async (): Promise<void> => {
  console.log(`⏰ [${new Date().toLocaleTimeString()}] Running keep-alive checks...`);
  
  const [supabaseResult, renderResult] = await Promise.all([
    pingSupabase(),
    pingRender()
  ]);

  console.log(`📊 Keep-alive status - Supabase: ${supabaseResult ? '✅' : '❌'}, Render: ${renderResult ? '✅' : '❌'}`);
};

/**
 * Start the keep-alive service
 * Pings services every 5 minutes
 */
export const startKeepAliveService = (): (() => void) => {
  console.log('🔄 Keep-Alive Service Started');
  console.log(`📍 Supabase: ${SUPABASE_URL}`);
  if (RENDER_URL) console.log(`📍 Render: ${RENDER_URL}`);

  // Run immediately on first load
  setTimeout(() => runKeepAliveChecks(), 2000);

  // Then run every 5 minutes (300000ms)
  const intervalId = setInterval(() => {
    runKeepAliveChecks().catch(err => 
      console.error('Keep-alive check failed:', err)
    );
  }, 5 * 60 * 1000);

  // Return cleanup function
  return () => {
    clearInterval(intervalId);
    console.log('🔄 Keep-Alive Service Stopped');
  };
};

/**
 * Manual trigger for keep-alive check
 */
export const triggerKeepAlive = async (): Promise<void> => {
  console.log('🔄 Manual keep-alive trigger');
  await runKeepAliveChecks();
};

export default {
  startKeepAliveService,
  triggerKeepAlive,
  pingSupabase,
  pingRender
};
