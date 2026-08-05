-- Centro de notificaciones del admin (2026-08-05 — docs/PLAN_CENTRO_NOTIFICACIONES.md):
-- tabla Notification, feed in-app de eventos del sistema (alertas, crons que
-- fallan, cotizaciones nuevas, resumen diario) que reemplaza el spam de email
-- operativo. type/severity como TEXT (agregar tipos no exige migración).
-- dedupKey agrupa repeticiones de la misma alerta (anti-ruido); readAt es la
-- única mutación (marcar leída). Escrita a mano (migrate dev no puede levantar
-- shadow DB en Supabase por la extensión pg_trgm de una migración vieja).
-- Aplicar con `make migrate`. RLS deny-by-default en
-- supabase/migrations/00000000000024_rls_notifications.sql.

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "actionUrl" TEXT,
    "actionLabel" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "dedupKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_readAt_createdAt_idx" ON "Notification"("readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_dedupKey_createdAt_idx" ON "Notification"("dedupKey", "createdAt");
