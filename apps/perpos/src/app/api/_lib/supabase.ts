import { createClient } from '@supabase/supabase-js';

const supabaseUrl = () =>
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

/** Admin client — bypasses RLS. Use only in server-side API routes. */
export function createAdminClient() {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) throw new Error('Missing Supabase admin env vars');
  return createClient(url, key);
}

/** Authed client — respects RLS using the caller's Bearer token. */
export function createAuthedClient(accessToken: string) {
  const url = supabaseUrl();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !key) throw new Error('Missing Supabase anon env vars');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
