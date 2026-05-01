import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// If the keys are missing, we still export a client but it will throw errors on use
// We handle the missing keys warning in App.tsx
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
