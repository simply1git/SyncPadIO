import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
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

// Export a boolean indicating if credentials are properly configured
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
