import { createClient } from '@supabase/supabase-js';

let supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

// Auto-fix URL if user accidentally included /rest/v1
if (supabaseUrl.endsWith('/rest/v1')) {
  supabaseUrl = supabaseUrl.replace('/rest/v1', '');
} else if (supabaseUrl.endsWith('/rest/v1/')) {
  supabaseUrl = supabaseUrl.replace('/rest/v1/', '');
}

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Check if credentials are properly configured (not empty and not placeholders)
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-project') &&
  !supabaseAnonKey.includes('your-anon-key')
);

// Validate credentials
if (!isSupabaseConfigured) {
  console.error('❌ Missing or placeholder Supabase credentials!');
  console.error('Make sure these environment variables are set to valid values:');
  console.error('  - VITE_SUPABASE_URL:', supabaseUrl ? (supabaseUrl.includes('your-project') ? '⚠️ Placeholder' : '✓ Set') : '✗ Missing');
  console.error('  - VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? (supabaseAnonKey.includes('your-anon-key') ? '⚠️ Placeholder' : '✓ Set') : '✗ Missing');
  
  if (import.meta.env.DEV) {
    console.warn('📝 For local development, create a .env file in the client directory with valid Supabase credentials.');
  }
}

// Create client with validation (disable auth persistence to fix quota errors)
const dummyStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder', {
  auth: { 
    persistSession: false,
    storage: dummyStorage
  }
});

// Export raw config for XHR-based uploads (progress tracking)
export { supabaseUrl, supabaseAnonKey };
