-- ADR-131 (2026-10-13) — Render de producción ASÍNCRONO: saca el render de los
-- PNG 300 DPI del request síncrono de "Agregar al carrito" (finalizeDesign).
-- Un set de calendario ×3 = 36 páginas renderizadas en la Server Action con
-- maxDuration=60 → Vercel mataba la función (500/504) y el cliente esperaba
-- "Guardando…" a ciegas. Ahora finalize sube el preview, crea el RenderJob y
-- responde; el worker (/api/cron/process-render-jobs, pg_cron migración 041 +
-- kick acotado en el propio finalize) procesa página por página con progreso
-- real (doneUnits) y reintentos acotados.
--
--   - UN job por diseño (RenderJob_designId_key): re-finalizar resetea la fila.
--   - FK ON DELETE CASCADE: las purgas de retención (purgeDesignBatch borra la
--     fila Design) cancelan el job huérfano sin barrido extra.
--   - attempts cuenta FALLOS/reclamos de lease, no ticks de cron.
--   - RLS habilitado sin policies (server-only vía service role; mismo patrón
--     que AdminRecoveryCode en 20260926120000).
--
-- Aditiva y reversible (DROP TABLE + DROP TYPE). Escrita a mano y aplicada con
-- `migrate deploy` — `migrate dev` no funciona contra esta DB (shadow DB en
-- Supabase, convención del repo).

CREATE TYPE "RenderJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

CREATE TABLE "RenderJob" (
  "id" TEXT NOT NULL,
  "designId" TEXT NOT NULL,
  "status" "RenderJobStatus" NOT NULL DEFAULT 'PENDING',
  "totalUnits" INTEGER NOT NULL,
  "doneUnits" INTEGER NOT NULL DEFAULT 0,
  "paths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "calendarYear" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RenderJob_designId_key" ON "RenderJob"("designId");
CREATE INDEX "RenderJob_status_updatedAt_idx" ON "RenderJob"("status", "updatedAt");

-- FK + RLS solo si el rol migrador es DUEÑO de la tabla recién creada (mismo
-- guard que 20260926120000_admin_recovery_code: en ambientes donde la tabla ya
-- existiera creada por otro rol, ADD CONSTRAINT / ENABLE RLS fallarían con
-- "must be owner").
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'RenderJob' AND tableowner = current_user
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'RenderJob_designId_fkey'
    ) THEN
      ALTER TABLE "RenderJob"
        ADD CONSTRAINT "RenderJob_designId_fkey"
        FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    ALTER TABLE "RenderJob" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
