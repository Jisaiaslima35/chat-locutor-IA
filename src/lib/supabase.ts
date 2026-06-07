import { createClient } from '@supabase/supabase-js';

// Support both Vite (client-side) and Node (server-side) imports
const defaultUrl = 'https://ihwkzqjliulchfdusfcp.supabase.co';
const defaultKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlod2t6cWpsaXVsY2hmZHVzZmNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzkzMTIsImV4cCI6MjA5NjM1NTMxMn0.C51LCPek0-3gnTWno9Xc7c-dgP2l8dRe5uAm0YRuRRU';

const supabaseUrl = 
  (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : undefined) || 
  ((import.meta as any)["env"]?.VITE_SUPABASE_URL) || 
  defaultUrl;

const supabaseAnonKey = 
  (typeof process !== 'undefined' ? process.env?.SUPABASE_ANON_KEY : undefined) || 
  ((import.meta as any)["env"]?.VITE_SUPABASE_ANON_KEY) || 
  defaultKey;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

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
