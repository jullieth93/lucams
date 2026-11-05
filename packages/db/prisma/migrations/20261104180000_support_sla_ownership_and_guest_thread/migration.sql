-- S21 (Fase 10): Hilo bidireccional para invitados/clientes, ownership de agente,
-- prioridad operativa y relojes de SLA legal colombiano en soporte, garantías y retractos.
-- 100 % aditivo, idempotente y compatible con código previo (Expand-only).

ALTER TABLE "public"."SupportTicket"
  ADD COLUMN IF NOT EXISTS "publicAccessTokenHash" TEXT,
  ADD COLUMN IF NOT EXISTS "assignedToAdminId" TEXT,
  ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS "firstRespondedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "slaDueAt" TIMESTAMP(3);

ALTER TABLE "public"."WarrantyClaim"
  ADD COLUMN IF NOT EXISTS "assignedToAdminId" TEXT,
  ADD COLUMN IF NOT EXISTS "slaDueAt" TIMESTAMP(3);

ALTER TABLE "public"."RetractRequest"
  ADD COLUMN IF NOT EXISTS "assignedToAdminId" TEXT,
  ADD COLUMN IF NOT EXISTS "slaDueAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicket_publicAccessTokenHash_key"
  ON "public"."SupportTicket"("publicAccessTokenHash");

CREATE INDEX IF NOT EXISTS "SupportTicket_assignedToAdminId_status_idx"
  ON "public"."SupportTicket"("assignedToAdminId", "status");

CREATE INDEX IF NOT EXISTS "SupportTicket_slaDueAt_idx"
  ON "public"."SupportTicket"("slaDueAt");

CREATE INDEX IF NOT EXISTS "WarrantyClaim_assignedToAdminId_status_idx"
  ON "public"."WarrantyClaim"("assignedToAdminId", "status");

CREATE INDEX IF NOT EXISTS "WarrantyClaim_slaDueAt_idx"
  ON "public"."WarrantyClaim"("slaDueAt");

CREATE INDEX IF NOT EXISTS "RetractRequest_assignedToAdminId_status_idx"
  ON "public"."RetractRequest"("assignedToAdminId", "status");

CREATE INDEX IF NOT EXISTS "RetractRequest_slaDueAt_idx"
  ON "public"."RetractRequest"("slaDueAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SupportTicket_assignedToAdminId_fkey'
  ) THEN
    ALTER TABLE "public"."SupportTicket"
      ADD CONSTRAINT "SupportTicket_assignedToAdminId_fkey"
      FOREIGN KEY ("assignedToAdminId") REFERENCES "public"."AdminUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WarrantyClaim_assignedToAdminId_fkey'
  ) THEN
    ALTER TABLE "public"."WarrantyClaim"
      ADD CONSTRAINT "WarrantyClaim_assignedToAdminId_fkey"
      FOREIGN KEY ("assignedToAdminId") REFERENCES "public"."AdminUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RetractRequest_assignedToAdminId_fkey'
  ) THEN
    ALTER TABLE "public"."RetractRequest"
      ADD CONSTRAINT "RetractRequest_assignedToAdminId_fkey"
      FOREIGN KEY ("assignedToAdminId") REFERENCES "public"."AdminUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SupportTicket_priority_check'
  ) THEN
    ALTER TABLE "public"."SupportTicket"
      ADD CONSTRAINT "SupportTicket_priority_check"
      CHECK ("priority" IN ('LOW', 'NORMAL', 'HIGH', 'URGENT'));
  END IF;
END $$;

-- Backfill inicial de slaDueAt en casos previos aún sin reloj calculado:
-- 15 días hábiles aprox (~21 días calendario) para PQR/garantías y 15 días calendario exactos (Ley 2439) para retractos.
UPDATE "public"."SupportTicket"
SET "slaDueAt" = "createdAt" + INTERVAL '21 days'
WHERE "slaDueAt" IS NULL;

UPDATE "public"."WarrantyClaim"
SET "slaDueAt" = "requestedAt" + INTERVAL '21 days'
WHERE "slaDueAt" IS NULL;

UPDATE "public"."RetractRequest"
SET "slaDueAt" = COALESCE("approvedAt", "requestedAt") + INTERVAL '15 days'
WHERE "slaDueAt" IS NULL;
