/*
 * verify-security-posture.mjs — Verificación en SOLO LECTURA (SELECT puro) de la
 * postura de seguridad en Postgres / Supabase Storage (Fase 0 · Auditoría 2026-11).
 *
 * Comprueba sin suposiciones en el ambiente conectado (LOCAL / STG / PRD):
 *   1. 0 tablas en `public` (excepto `_prisma*`) con `rowsecurity = false`.
 *   2. 0 privilegios sobre tablas de `public` para `anon` o `authenticated`.
 *   3. 0 privilegios DML (`SELECT/INSERT/UPDATE/DELETE`) sobre tablas de `public` para `service_role`.
 *   4. Buckets sensibles (`customer-uploads`, `production-assets`, `design-previews`) con `public = false`.
 *   5. Event trigger `enforce_rls_on_new_table_trg` presente y habilitado (`tgenabled != 'D'`).
 *
 * Uso (estrictamente read-only, exit 1 ante cualquier desviación):
 *   cd packages/db && npx dotenv -e ../../.env.local -- node scripts/verify-security-posture.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

let failures = 0;

function reportCheck(label, rows, formatRow) {
  if (rows.length === 0) {
    console.log(`  [OK]   ${label}`);
    return;
  }
  failures += 1;
  console.error(`  [FAIL] ${label} (${rows.length} hallazgo(s)):`);
  for (const row of rows) {
    console.error(`         - ${formatRow(row)}`);
  }
}

try {
  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log(" VERIFICACIÓN READ-ONLY DE POSTURA RLS / GRANTS / STORAGE");
  console.log("══════════════════════════════════════════════════════════════════\n");

  const tablesWithoutRls = await prisma.$queryRaw`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND rowsecurity = false
      AND tablename NOT LIKE '_prisma%'
    ORDER BY tablename
  `;
  reportCheck(
    "Toda tabla de public (excepto _prisma*) tiene RLS activa",
    tablesWithoutRls,
    (r) => r.tablename,
  );

  const clientRoleGrants = await prisma.$queryRaw`
    SELECT grantee, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated')
    ORDER BY grantee, table_name, privilege_type
  `;
  reportCheck(
    "0 grants en tablas de public para anon / authenticated",
    clientRoleGrants,
    (r) => `${r.grantee} -> ${r.table_name} (${r.privilege_type})`,
  );

  const serviceRoleDmlGrants = await prisma.$queryRaw`
    SELECT table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee = 'service_role'
      AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    ORDER BY table_name, privilege_type
  `;
  reportCheck(
    "0 grants DML en tablas de public para service_role",
    serviceRoleDmlGrants,
    (r) => `service_role -> ${r.table_name} (${r.privilege_type})`,
  );

  const exposedPrivateBuckets = await prisma.$queryRaw`
    SELECT id, public
    FROM storage.buckets
    WHERE id IN ('customer-uploads', 'production-assets', 'design-previews')
      AND public IS DISTINCT FROM false
    ORDER BY id
  `;
  reportCheck(
    "Buckets privados (customer-uploads, production-assets, design-previews) con public = false",
    exposedPrivateBuckets,
    (r) => `${r.id} (public=${String(r.public)})`,
  );

  const eventTriggers = await prisma.$queryRaw`
    SELECT evtname, evtenabled
    FROM pg_event_trigger
    WHERE evtname = 'enforce_rls_on_new_table_trg'
  `;
  const missingTrigger =
    eventTriggers.length === 0 || eventTriggers[0].evtenabled === "D"
      ? [{ status: eventTriggers.length === 0 ? "MISSING" : `DISABLED (${eventTriggers[0].evtenabled})` }]
      : [];
  reportCheck(
    "Event trigger enforce_rls_on_new_table_trg activo",
    missingTrigger,
    (r) => r.status,
  );

  const eventTriggerFnRows = await prisma.$queryRaw`
    SELECT
      p.prosrc,
      p.proconfig,
      has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'enforce_rls_on_new_table'
      AND p.pronargs = 0
  `;
  const unhardenedTriggerFn = [];
  if (eventTriggerFnRows.length === 0) {
    unhardenedTriggerFn.push({ reason: "MISSING public.enforce_rls_on_new_table()" });
  } else {
    const fn = eventTriggerFnRows[0];
    const hasSafeSearchPath = (fn.proconfig ?? []).some((cfg) =>
      /^search_path=(?:""|''|pg_catalog\b)/.test(cfg),
    );
    if (!hasSafeSearchPath) {
      unhardenedTriggerFn.push({ reason: `search_path no endurecido (${JSON.stringify(fn.proconfig)})` });
    }
    if (/format\s*\([^)]*%s/i.test(fn.prosrc)) {
      unhardenedTriggerFn.push({ reason: "format() usa %s en lugar de %I.%I" });
    }
    if (fn.public_exec || fn.anon_exec || fn.authenticated_exec) {
      unhardenedTriggerFn.push({
        reason: `EXECUTE expuesto (public=${String(fn.public_exec)}, anon=${String(fn.anon_exec)}, authenticated=${String(fn.authenticated_exec)})`,
      });
    }
  }
  reportCheck(
    "Función enforce_rls_on_new_table endurecida (search_path fijo, %I.%I y sin EXECUTE público)",
    unhardenedTriggerFn,
    (r) => r.reason,
  );

  console.log("\n══════════════════════════════════════════════════════════════════");
  if (failures > 0) {
    console.error(` Resultado: FALLÓ (${failures} control(es) fuera de invariante)\n`);
    process.exitCode = 1;
  } else {
    console.log(" Resultado: VERIFICADO (6/6 invariantes cumplidos)\n");
  }
} finally {
  await prisma.$disconnect();
}

