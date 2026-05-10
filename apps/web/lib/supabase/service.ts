/*
 * Cliente Supabase con secret key — bypassa RLS, server-only.
 *
 * Mapea al rol Postgres `service_role`. Acceso TOTAL a todas las tablas.
 * Usar SOLO cuando se necesite operar fuera del scope del usuario:
 *   - Webhooks (Wompi, Venndelo) — el "user" es el sistema externo.
 *   - Background jobs (pgmq consumers en Edge Functions / cron).
 *   - Admin tasks puntuales (seed, mantenimiento).
 *   - Tests E2E con setup/teardown.
 *
 * Reglas de uso (docs/SECURITY.md § Backend privilegios):
 *   - Importar SOLO desde código server-only (`'server-only'` enforced).
 *   - NUNCA exponer al cliente — la secret key tiene poder total.
 *   - Loggear con `event: 'service-role-write'` para auditoría.
 *   - `persistSession: false` + `autoRefreshToken: false` porque no hay
 *     sesión humana — el cliente es un singleton sin estado.
 *
 * Referencias:
 *  - docs/INTEGRATIONS.md § 3. Supabase (tres clientes)
 *  - docs/SECURITY.md § Llaves de API + § Datos clasificados
 */

import "server-only";
import { createClient } from "@supabase/supabase-js";

export const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);
