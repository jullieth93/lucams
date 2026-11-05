-- Contadores diarios anónimos del embudo tienda + Estudio ([ANA-01], Fase 2).
-- Cero PII, cero sessionId, cero customerId, cero IP, cero cookies.
-- Incluye CHECK (count >= 0), RLS habilitada y REVOKE explícito desde DDL-time.

-- CreateTable
CREATE TABLE "FunnelEventDaily" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "eventName" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL DEFAULT '',
    "editorKind" TEXT NOT NULL DEFAULT 'all',
    "deviceCategory" TEXT NOT NULL DEFAULT 'unknown',
    "errorCode" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunnelEventDaily_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FunnelEventDaily_count_nonneg_chk" CHECK ("count" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "FunnelEventDaily_day_eventName_productSlug_editorKind_devic_key" ON "FunnelEventDaily"("day", "eventName", "productSlug", "editorKind", "deviceCategory", "errorCode");

-- CreateIndex
CREATE INDEX "FunnelEventDaily_day_eventName_idx" ON "FunnelEventDaily"("day", "eventName");

-- CreateIndex
CREATE INDEX "FunnelEventDaily_productSlug_day_idx" ON "FunnelEventDaily"("productSlug", "day");

-- Seguridad mandatoria desde DDL-time (defensa en profundidad junto con migración Supabase 050)
ALTER TABLE "FunnelEventDaily" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "FunnelEventDaily" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "FunnelEventDaily" FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE "FunnelEventDaily" FROM service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = 'FunnelEventDaily'
      AND rowsecurity = false
  ) THEN
    RAISE EXCEPTION 'FunnelEventDaily quedó sin RLS habilitada';
  END IF;
END $$;

