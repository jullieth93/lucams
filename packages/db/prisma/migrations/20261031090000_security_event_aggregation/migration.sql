-- LUC-SEC-008 (2026-10-31) — agregación anti-amplificación de SecurityEvent:
-- una fila por (evento, outcome, ipHash, actorId, hash metadata, minuto),
-- no por request. `count` acumula ocurrencias; `dedupKey` es la clave única
-- del bucket (nullable: las filas pre-008 no la tienen; Postgres admite
-- múltiples NULL en el unique).

ALTER TABLE "SecurityEvent" ADD COLUMN "count" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SecurityEvent" ADD COLUMN "dedupKey" TEXT;

CREATE UNIQUE INDEX "SecurityEvent_dedupKey_key" ON "SecurityEvent"("dedupKey");
