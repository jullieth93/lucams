/*
 * Cliente Supabase para uso server-side bajo la sesión del usuario.
 *
 * Usa la publishable key (rol Postgres `anon`) + cookies del request → RLS
 * aplica con el `auth.uid()` del usuario autenticado. Sirve para:
 *   - Server Components (page.tsx, layout.tsx)
 *   - Route Handlers en app/api
 *   - Server Actions
 *
 * Importante (Next.js 16):
 *   - `cookies()` de `next/headers` es **async** — siempre `await`.
 *   - En Server Components el cookie store es read-only; `cookieStore.set()`
 *     puede tirar. Lo envolvemos en try/catch silencioso porque el refresh
 *     de tokens lo maneja `proxy.ts` (middleware) por separado.
 *
 * Crear un cliente nuevo por request — **NO** compartir entre requests.
 *
 * Referencias:
 *  - @supabase/ssr docs: https://supabase.com/docs/guides/auth/server-side
 *  - Next.js 16 async cookies: docs/CONVENTIONS.md (breaking changes)
 *  - docs/INTEGRATIONS.md § 3. Supabase
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components no pueden mutar cookies.
            // proxy.ts (middleware) se encarga del refresh.
          }
        },
      },
    },
  );
}
