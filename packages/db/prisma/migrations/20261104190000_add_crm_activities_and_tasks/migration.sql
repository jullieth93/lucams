-- S22 (Fase 10): Motor transversal de actividades (`ContactActivity`) y tareas (`Task`) del CRM operativo.
-- Seguridad cero suposiciones:
--  1) CREATE TABLE + índices + FKs + CHECK constraints de dominio.
--  2) ENABLE ROW LEVEL SECURITY explícita en ambas tablas.
--  3) REVOKE ALL para `anon` y `authenticated`, y REVOKE DML para `service_role` (cero exposición PostgREST).
--  4) Verificación inline `DO $$ ... RAISE EXCEPTION $$` para fallar el deploy si falta cualquier candado.

CREATE TABLE IF NOT EXISTS "public"."ContactActivity" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "orderId" TEXT,
  "supportTicketId" TEXT,
  "authorAdminId" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'NOTE',
  "body" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContactActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContactActivity_kind_check" CHECK (
    "kind" IN ('NOTE', 'CALL', 'WHATSAPP', 'EMAIL', 'SYSTEM')
  )
);

CREATE TABLE IF NOT EXISTS "public"."Task" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "ownerAdminId" TEXT,
  "createdByAdminId" TEXT,
  "contactId" TEXT,
  "orderId" TEXT,
  "supportTicketId" TEXT,
  "warrantyClaimId" TEXT,
  "retractRequestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Task_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Task_status_check" CHECK (
    "status" IN ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED')
  ),
  CONSTRAINT "Task_priority_check" CHECK (
    "priority" IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')
  )
);

CREATE INDEX IF NOT EXISTS "ContactActivity_contactId_createdAt_idx"
  ON "public"."ContactActivity"("contactId", "createdAt");

CREATE INDEX IF NOT EXISTS "ContactActivity_orderId_createdAt_idx"
  ON "public"."ContactActivity"("orderId", "createdAt");

CREATE INDEX IF NOT EXISTS "ContactActivity_supportTicketId_createdAt_idx"
  ON "public"."ContactActivity"("supportTicketId", "createdAt");

CREATE INDEX IF NOT EXISTS "ContactActivity_authorAdminId_idx"
  ON "public"."ContactActivity"("authorAdminId");

CREATE INDEX IF NOT EXISTS "Task_status_dueAt_idx"
  ON "public"."Task"("status", "dueAt");

CREATE INDEX IF NOT EXISTS "Task_ownerAdminId_status_dueAt_idx"
  ON "public"."Task"("ownerAdminId", "status", "dueAt");

CREATE INDEX IF NOT EXISTS "Task_contactId_status_idx"
  ON "public"."Task"("contactId", "status");

CREATE INDEX IF NOT EXISTS "Task_orderId_status_idx"
  ON "public"."Task"("orderId", "status");

CREATE INDEX IF NOT EXISTS "Task_supportTicketId_status_idx"
  ON "public"."Task"("supportTicketId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContactActivity_contactId_fkey'
  ) THEN
    ALTER TABLE "public"."ContactActivity"
      ADD CONSTRAINT "ContactActivity_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "public"."Contact"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContactActivity_orderId_fkey'
  ) THEN
    ALTER TABLE "public"."ContactActivity"
      ADD CONSTRAINT "ContactActivity_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContactActivity_supportTicketId_fkey'
  ) THEN
    ALTER TABLE "public"."ContactActivity"
      ADD CONSTRAINT "ContactActivity_supportTicketId_fkey"
      FOREIGN KEY ("supportTicketId") REFERENCES "public"."SupportTicket"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContactActivity_authorAdminId_fkey'
  ) THEN
    ALTER TABLE "public"."ContactActivity"
      ADD CONSTRAINT "ContactActivity_authorAdminId_fkey"
      FOREIGN KEY ("authorAdminId") REFERENCES "public"."AdminUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_ownerAdminId_fkey'
  ) THEN
    ALTER TABLE "public"."Task"
      ADD CONSTRAINT "Task_ownerAdminId_fkey"
      FOREIGN KEY ("ownerAdminId") REFERENCES "public"."AdminUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_createdByAdminId_fkey'
  ) THEN
    ALTER TABLE "public"."Task"
      ADD CONSTRAINT "Task_createdByAdminId_fkey"
      FOREIGN KEY ("createdByAdminId") REFERENCES "public"."AdminUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_contactId_fkey'
  ) THEN
    ALTER TABLE "public"."Task"
      ADD CONSTRAINT "Task_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "public"."Contact"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_orderId_fkey'
  ) THEN
    ALTER TABLE "public"."Task"
      ADD CONSTRAINT "Task_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_supportTicketId_fkey'
  ) THEN
    ALTER TABLE "public"."Task"
      ADD CONSTRAINT "Task_supportTicketId_fkey"
      FOREIGN KEY ("supportTicketId") REFERENCES "public"."SupportTicket"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_warrantyClaimId_fkey'
  ) THEN
    ALTER TABLE "public"."Task"
      ADD CONSTRAINT "Task_warrantyClaimId_fkey"
      FOREIGN KEY ("warrantyClaimId") REFERENCES "public"."WarrantyClaim"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_retractRequestId_fkey'
  ) THEN
    ALTER TABLE "public"."Task"
      ADD CONSTRAINT "Task_retractRequestId_fkey"
      FOREIGN KEY ("retractRequestId") REFERENCES "public"."RetractRequest"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Blindaje explícito RLS + REVOKE ALL (cero suposiciones sobre event triggers).
ALTER TABLE "public"."ContactActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Task" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."ContactActivity" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."Task" FROM anon, authenticated;

REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."ContactActivity" FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."Task" FROM service_role;

DO $$
DECLARE
  unprotected_count int;
  leaked_grants int;
BEGIN
  SELECT count(*) INTO unprotected_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('ContactActivity', 'Task')
    AND rowsecurity = false;

  IF unprotected_count > 0 THEN
    RAISE EXCEPTION '% tabla(s) CRM sin RLS habilitada', unprotected_count;
  END IF;

  SELECT count(*) INTO leaked_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('ContactActivity', 'Task')
    AND (
      grantee IN ('anon', 'authenticated')
      OR (grantee = 'service_role'
          AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
    );

  IF leaked_grants > 0 THEN
    RAISE EXCEPTION 'Tablas CRM conservan % grants no autorizados en PostgREST', leaked_grants;
  END IF;
END $$;
