/*
 * Cliente Supabase para uso en Client Components.
 *
 * Mapea al rol Postgres `anon` vía la publishable key. RLS aplica.
 * No tiene acceso a la sesión sin que el usuario haga login (Auth flow
 * normal de Supabase, que escribe cookies → leídas por server.ts en SSR).
 *
 * Referencias:
 *  - docs/INTEGRATIONS.md § 3. Supabase
 *  - docs/SECURITY.md § Llaves de API
 */

import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
