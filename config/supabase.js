import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

const { url, serviceRoleKey } = config.supabase;

if (!url || !serviceRoleKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

// Service role client (bypasses RLS)
export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Optional health check
export const testConnection = async () => {
  const { error } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .limit(1);

  if (error && error.code !== 'PGRST116') {
    console.error('❌ Supabase connection failed:', error.message);
    return false;
  }

  console.log('✅ Supabase connected');
  return true;
};
