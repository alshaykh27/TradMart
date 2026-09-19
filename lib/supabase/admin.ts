import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseServiceEnv } from "./env";

/**
 * Privileged server-only Supabase client. Uses the service-role key, which
 * bypasses Row Level Security. Import this ONLY from server code (Route
 * Handlers, Server Functions, webhooks). The `server-only` import makes any
 * attempt to use it in a Client Component fail at build time, so the secret
 * can never reach the browser.
 */
export function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseServiceEnv();

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
