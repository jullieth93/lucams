-- F-07 (auditoría 2026-09-19) — tabla SecurityEvent: persistencia durable de
-- eventos de seguridad rechazados (login fallido cliente/admin, firma/secreto
-- de webhook inválido). Antes solo iban a logs efímeros de Vercel con la IP
-- redactada: prevenidos pero invisibles y no investigables.
-- ipHash guarda hashIp() (SHA-256 truncado a 16 hex) — la IP es dato personal
-- (Ley 1581) y jamás se persiste en claro. Append-only; la purga a los 180
-- días corre en el cron purge-event-logs (event-log-retention.ts).
-- RLS: la habilita el event trigger enforce_rls_on_new_table al crear la tabla
-- y la refuerza la migración supabase 036 (deny-by-default, patrón AdminActionLog).

CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "ipHash" TEXT,
    "actorId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");
CREATE INDEX "SecurityEvent_event_createdAt_idx" ON "SecurityEvent"("event", "createdAt");
