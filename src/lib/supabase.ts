import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** RLS client for server-side routes using the anon key.
 * Only use if your JWTs include tenant_id and RLS policies are in place.
 */
export function getSupabaseRls(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** Admin-only server use. Never expose key to the browser. */
export function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
