import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * A Supabase client using the SERVICE ROLE key — bypasses Row Level
 * Security entirely. This is intentional and safe HERE because:
 *
 *   - This file is only ever imported by server-only code (API routes,
 *     scheduled sync jobs) — never by a Client Component, never sent
 *     to the browser.
 *   - SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix) is only
 *     readable server-side in Next.js; it's never bundled into
 *     client-side JS.
 *
 * DO NOT use this client for anything that handles a visitor's own
 * request/session (page loads, user-triggered actions) — use
 * `lib/supabase/server.ts`'s `createClient()` for those, which
 * correctly respects RLS using the visitor's own session. This admin
 * client is only for trusted backend jobs, like the old-site sync
 * route, that intentionally need to write data on behalf of the whole
 * system rather than a specific logged-in user.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}