import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-Role-Client ohne Session/RLS – nur serverseitig (Route Handlers,
 * Webhooks, Cron). Nie in Client-Komponenten importieren.
 *
 * Braucht `SUPABASE_SERVICE_ROLE_KEY` (+ `SUPABASE_URL` bzw. den public URL)
 * in der Server-Umgebung (apps/web/.env.local).
 */
export function createAdminClient() {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nicht gesetzt (apps/web/.env.local)",
    );
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
