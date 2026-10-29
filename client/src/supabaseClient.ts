import { createClient } from '@supabase/supabase-js';

// Default public backend credentials (active project)
const DEFAULT_SUPABASE_URL = 'https://fxjmaajktqehnaergnky.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4am1hYWprdHFlaG5hZXJnbmt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MDU0MTksImV4cCI6MjA5MzI4MTQxOX0.ZQq6ajWmjHTnQRu4347FN_Vy5B0-n5RVsG3ms0W9Nhg';

let supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;

// Auto-fix URL if user accidentally included /rest/v1
if (supabaseUrl.endsWith('/rest/v1')) {
  supabaseUrl = supabaseUrl.replace('/rest/v1', '');
} else if (supabaseUrl.endsWith('/rest/v1/')) {
  supabaseUrl = supabaseUrl.replace('/rest/v1/', '');
}

// If placeholder was left in .env, fallback to default active backend
if (!supabaseUrl || supabaseUrl.includes('your-project')) {
  supabaseUrl = DEFAULT_SUPABASE_URL;
}

let supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
if (!supabaseAnonKey || supabaseAnonKey.includes('your-anon-key')) {
  supabaseAnonKey = DEFAULT_SUPABASE_ANON_KEY;
}

// Always configured with either custom or default backend
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Create client with validation (disable auth persistence to fix quota errors)
const dummyStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { 
    persistSession: false,
    storage: dummyStorage
  }
});

// Export raw config for XHR-based uploads (progress tracking)
export { supabaseUrl, supabaseAnonKey };
