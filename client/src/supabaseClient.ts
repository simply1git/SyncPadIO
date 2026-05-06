import { createClient } from '@supabase/supabase-js';

let supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

// Auto-fix URL if user accidentally included /rest/v1
if (supabaseUrl.endsWith('/rest/v1')) {
  supabaseUrl = supabaseUrl.replace('/rest/v1', '');
} else if (supabaseUrl.endsWith('/rest/v1/')) {
  supabaseUrl = supabaseUrl.replace('/rest/v1/', '');
}

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Validate credentials
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials!');
  console.error('Make sure these environment variables are set:');
  console.error('  - VITE_SUPABASE_URL:', supabaseUrl ? '✓ Set' : '✗ Missing');
  console.error('  - VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓ Set' : '✗ Missing');
  
  if (import.meta.env.DEV) {
    console.warn('📝 For local development, create a .env.local file in the client directory with:');
    console.warn('VITE_SUPABASE_URL=https://your-project.supabase.co');
    console.warn('VITE_SUPABASE_ANON_KEY=your-anon-key-here');
  }
}

// Create client with validation
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Export raw config for XHR-based uploads (progress tracking)
export { supabaseUrl, supabaseAnonKey };

// Export a boolean indicating if credentials are properly configured
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
