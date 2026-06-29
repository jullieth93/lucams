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
});
