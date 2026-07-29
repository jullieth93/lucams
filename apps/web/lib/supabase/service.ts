/*
 * Cliente Supabase con secret key — bypassa RLS, server-only.
 *
 * Mapea al rol Postgres `service_role`. Acceso TOTAL a todas las tablas.
 * Usar SOLO cuando se necesite operar fuera del scope del usuario:
 *   - Webhooks (Wompi, Aveonline) — el "user" es el sistema externo.
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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Inicialización PEREZOSA (lazy). Antes el cliente se creaba al importar el módulo, así que
// cualquier import de este archivo con NEXT_PUBLIC_SUPABASE_URL vacía/ausente reventaba con
// "supabaseUrl is required" — rompía el job de tests de CI (env Supabase vacía a propósito para
// saltar los tests que exigen Supabase real) y cualquier build/contexto sin esa var. Con lazy, el
// cliente se crea recién en el primer USO real; importar el módulo es siempre seguro.
let _client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _client;
}

// Proxy que difiere la creación al primer acceso de propiedad, manteniendo la API idéntica
// (`supabaseService.storage.from(...)`, `.auth.admin...`, `.from(...)`) sin tocar los call sites.
export const supabaseService: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
