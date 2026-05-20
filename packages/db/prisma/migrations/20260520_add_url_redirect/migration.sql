-- Sub-fase C.3 — UrlRedirect admin-managed
--
-- Mapeo arbitrario 301/302 admin-managed (URL legacy → URL nueva).
-- Complementa product-redirects.ts (slugs consolidados, generado por code).
-- Lucy administra desde /admin/redirects.
--
-- Lookup en proxy.ts (Node runtime, Prisma directo) con cache in-memory
-- 60s para no martillear DB en cada request.

CREATE TABLE IF NOT EXISTS "UrlRedirect" (
  "id"          TEXT NOT NULL,
  "fromPath"    TEXT NOT NULL,
  "toPath"      TEXT NOT NULL,
  "statusCode"  INTEGER NOT NULL DEFAULT 301,
  "description" TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "hitCount"    INTEGER NOT NULL DEFAULT 0,
  "lastHitAt"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "createdBy"   TEXT,
  "updatedBy"   TEXT,
  "deletedAt"   TIMESTAMP(3),
  "deletedBy"   TEXT,

  CONSTRAINT "UrlRedirect_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UrlRedirect_fromPath_key" ON "UrlRedirect"("fromPath");
CREATE INDEX IF NOT EXISTS "UrlRedirect_fromPath_isActive_deletedAt_idx" ON "UrlRedirect"("fromPath", "isActive", "deletedAt");
CREATE INDEX IF NOT EXISTS "UrlRedirect_deletedAt_idx" ON "UrlRedirect"("deletedAt");
