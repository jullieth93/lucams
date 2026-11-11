/*
 * Guard anti-reincidencia de RLS (Bloque C / R4, Lucy 2026-06-27).
 *
 * Falla si CUALQUIER tabla del schema public queda sin RLS habilitada. Justo
 * lo que pasó con las 17 tablas creadas después del 2026-05-12: nadie lo notó
 * porque no había verificación automatizada. Este test cierra ese hueco.
 *
 * Requiere DATABASE_URL (rol privilegiado, lee pg_tables). Sin DB → skipIf.
 */

import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("RLS coverage — toda tabla pública tiene candado", () => {
  it("ninguna tabla de public (excepto _prisma_*) está sin RLS", async () => {
    const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND rowsecurity = false
        AND tablename NOT LIKE '_prisma%'
      ORDER BY tablename
    `;
    const sinRls = rows.map((r) => r.tablename);
    // Si esto falla: agrega la(s) tabla(s) a una migración con
    // ENABLE ROW LEVEL SECURITY (ver supabase/migrations/...rls...).
    expect(sinRls).toEqual([]);
  });

  it("SEC-04: enforce_rls_on_new_table fija search_path, usa %I.%I (sin %s) y revoca EXECUTE público", async () => {
    const fnRows = await prisma.$queryRaw<
      Array<{
        prosrc: string;
        proconfig: string[] | null;
        public_exec: boolean;
        anon_exec: boolean;
        authenticated_exec: boolean;
      }>
    >`
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

    expect(fnRows).toHaveLength(1);
    const fn = fnRows[0]!;

    // 1. search_path fijo/vacío obligatorio (no mutable / no NULL).
    expect(fn.proconfig ?? []).toEqual(
      expect.arrayContaining([expect.stringMatching(/^search_path=(?:""|''|pg_catalog\b)/)]),
    );

    // 2. Prohibido interpolar identificadores con %s en format(); exigir %I.%I.
    expect(fn.prosrc).not.toMatch(/format\s*\([^)]*%s/i);
    expect(fn.prosrc).toContain("ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY");
    expect(fn.prosrc).toContain("REVOKE ALL ON TABLE %I.%I FROM anon, authenticated");
    expect(fn.prosrc).toContain(
      "REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I FROM service_role",
    );

    // 3. Roles de API / PUBLIC no deben tener EXECUTE sobre la función DDL.
    expect(fn.public_exec).toBe(false);
    expect(fn.anon_exec).toBe(false);
    expect(fn.authenticated_exec).toBe(false);
  });

  it("SEC-04: DDL real en tabla nueva con caracteres especiales aplica RLS + REVOKE automáticamente", async () => {
    // Identificador deliberadamente hostil (mayúsculas, espacio, punto y comilla doble)
    // para demostrar que format('%I.%I', schema_name, relname) cita de forma segura.
    const tableName = `_sec04_DdlTest "Quote.Table`;
    const quotedIdent = `"${tableName.replace(/"/g, '""')}"`;

    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS public.${quotedIdent}`);
    try {
      await prisma.$executeRawUnsafe(
        `CREATE TABLE public.${quotedIdent} (id integer PRIMARY KEY, secret_note text)`,
      );

      // En Supabase local/cloud, los default privileges pueden dejar grants cuyo grantor
      // sea el dueño de la tabla; aquí el dueño es el rol de DATABASE_URL (postgres),
      // así que el event trigger debe dejar RLS activa y 0 grants expuestos.
      const rlsRows = await prisma.$queryRaw<Array<{ rowsecurity: boolean }>>`
        SELECT rowsecurity
        FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
          AND tablename = ${tableName}
      `;
      expect(rlsRows).toEqual([{ rowsecurity: true }]);

      const residualGrants = await prisma.$queryRaw<
        Array<{ grantee: string; privilege_type: string }>
      >`
        SELECT grantee, privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND table_name = ${tableName}
          AND (
            grantee IN ('anon', 'authenticated')
            OR (
              grantee = 'service_role'
              AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
            )
          )
      `;
      expect(residualGrants).toEqual([]);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS public.${quotedIdent}`);
    }
  });
});
