import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Service-Role-Client: umgeht RLS. Nur im Worker verwenden, nie im Client.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
