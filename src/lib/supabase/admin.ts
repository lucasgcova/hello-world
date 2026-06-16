import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client for privileged, server-only operations (bypasses RLS).
// NEVER import this into client components. Returns null if the key is unset.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
