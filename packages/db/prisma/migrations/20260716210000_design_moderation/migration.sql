-- ADR-062 P0-2 — Moderación de contenido de diseños + consentimiento de derechos de imagen.
--
-- Print-on-demand: cada diseño personalizado se imprime y despacha físicamente, así que Lucy
-- revisa TODOS antes de producir. moderationStatus nace PENDING; el gate bloquea SHIPPED hasta
-- APPROVED. contentRightsAcceptedAt sella (con fecha) el consentimiento de derechos de imagen
-- que el cliente acepta al confirmar el pedido (Ley 1581).

CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Design"
  ADD COLUMN "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "moderationReason" TEXT,
  ADD COLUMN "moderatedAt" TIMESTAMP(3),
  ADD COLUMN "moderatedById" TEXT;

CREATE INDEX "Design_moderationStatus_createdAt_idx" ON "Design" ("moderationStatus", "createdAt");

ALTER TABLE "Order" ADD COLUMN "contentRightsAcceptedAt" TIMESTAMP(3);
