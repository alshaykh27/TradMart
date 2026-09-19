import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabasePublicEnv } from "./env";

/**
 * Browser Supabase client. Uses only the public (publishable/anon) key, so it
 * is subject to Row Level Security. Never expose the service-role key here.
 */
export function createClient() {
  const { url, anonKey } = getSupabasePublicEnv();
  return createBrowserClient<Database>(url, anonKey);
}
