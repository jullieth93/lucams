-- Bloque D — captura de errores del servidor en DB (sin Sentry). Alimentada por
-- instrumentation.onRequestError. Append-only; fuente del panel /admin/observability.
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "digest" TEXT,
    "stack" TEXT,
    "routePath" TEXT,
    "requestPath" TEXT,
    "method" TEXT,
    "routeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");
CREATE INDEX "ErrorLog_digest_createdAt_idx" ON "ErrorLog"("digest", "createdAt");
