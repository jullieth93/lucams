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
      // B-2 (auditoría 2026-08-24): `Secure` explícito en despliegues HTTPS
      // (prod/preview) — sin él, la cookie sb-* viajaría por HTTP plano en el
      // primer contacto pre-HSTS. `httpOnly` queda en false (default del
      // paquete): el browser client lee la sesión desde document.cookie
      // (reto MFA, lib/supabase/browser.ts) — la exposición a XSS la mitiga
      // la CSP por nonce que setea proxy.ts, no httpOnly.
      cookieOptions: {
        secure: process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview",
        sameSite: "lax",
      },
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
