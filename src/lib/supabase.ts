import { createClient } from '@supabase/supabase-js';

// Support both Vite (client-side) and Node (server-side) imports
// Supabase is completely optional. It will be active ONLY when the user sets their own credentials in the environment.
const supabaseUrl = 
  (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : undefined) || 
  ((import.meta as any)["env"]?.VITE_SUPABASE_URL) || 
  '';

const supabaseAnonKey = 
  (typeof process !== 'undefined' ? process.env?.SUPABASE_ANON_KEY : undefined) || 
  ((import.meta as any)["env"]?.VITE_SUPABASE_ANON_KEY) || 
  '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseUrl.trim() !== '' && supabaseAnonKey && supabaseAnonKey.trim() !== '');

let supabaseClientInstance: any = null;

export function getSupabase() {
  if (!isSupabaseConfigured) {
    return null;
  }
  if (!supabaseClientInstance) {
    supabaseClientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
  }
  return supabaseClientInstance;
}

