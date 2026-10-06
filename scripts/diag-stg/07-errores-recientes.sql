-- Fase 0 · Errores recientes de plataforma (ErrorLog servidor + ErrorReport cliente)
-- Ejecutar contra la DB de STG. Alimenta la clasificación de los "Últimos 20
-- errores" de /admin/performance: el digest permite agrupar ocurrencias del
-- mismo fallo y cruzar con Vercel Logs (en prod Next enmascara los mensajes).
-- Ref: plan de maduración 2026-10 · apps/web/lib/error-capture.ts.

-- 1) Últimos 30 errores de servidor (vista cruda, igual al panel admin + digest)
SELECT "createdAt",
       "routeType",
       COALESCE("routePath", "requestPath") AS ruta,
       method,
       digest,
       left(message, 300) AS mensaje
FROM "ErrorLog"
ORDER BY "createdAt" DESC
LIMIT 30;

-- 2) Errores agrupados por digest (los repetidos primero) — prioriza el fix
SELECT digest,
       count(*)                        AS ocurrencias,
       max("createdAt")                AS ultima_vez,
       COALESCE(max("routePath"), max("requestPath")) AS ruta,
       left(max(message), 300)         AS mensaje
FROM "ErrorLog"
WHERE "createdAt" > now() - interval '14 days'
GROUP BY digest
ORDER BY ocurrencias DESC, ultima_vez DESC
LIMIT 20;

-- 3) Stack completo de un digest puntual (reemplazar el valor)
-- SELECT "createdAt", message, stack
-- FROM "ErrorLog"
-- WHERE digest = 'REEMPLAZAR_DIGEST'
-- ORDER BY "createdAt" DESC
-- LIMIT 1;

-- 4) Errores de cliente (navegador) sin resolver, deduplicados por fingerprint
SELECT "fingerprint",
       count         AS reportes,
       "lastSeenAt"  AS ultima_vez,
       left(message, 300) AS mensaje
FROM "ErrorReport"
WHERE status <> 'RESOLVED'
  AND "lastSeenAt" > now() - interval '14 days'
ORDER BY count DESC, "lastSeenAt" DESC
LIMIT 20;
