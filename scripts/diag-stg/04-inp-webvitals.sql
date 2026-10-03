-- Fase 0 · Diagnóstico INP (PDTA: interaction timings >200ms y >500ms en Vercel)
-- Ejecutar contra la DB de STG. La tabla WebVital captura el elemento exacto
-- de cada interacción lenta (columna `target`, desde 2026-09-18).
-- Ref: docs/audits/2026-09-18-responsive-ux-estudios-admin.md §D.

-- p50/p75/p95 de INP por ruta
SELECT route,
       count(*)                       AS muestras,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY value) AS p50_ms,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY value) AS p95_ms
FROM "WebVital"
WHERE name = 'INP'
  AND "createdAt" > now() - interval '14 days'
GROUP BY route
ORDER BY p75_ms DESC;

-- Elementos (target) con peor INP en el estudio
SELECT route, target,
       count(*)                       AS muestras,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY value) AS p95_ms,
       max(value)                     AS max_ms
FROM "WebVital"
WHERE name = 'INP'
  AND route LIKE '/estudio%'
  AND "createdAt" > now() - interval '14 days'
GROUP BY route, target
HAVING count(*) >= 3
ORDER BY p75_ms DESC
LIMIT 30;

-- Qué buscar (candidatos de la auditoría §E-4):
--  - input[type=file] / sidebar  -> upscale + unsharp mask en main thread
--    (app/estudio/[slug]/client-photo-upscale.ts)
--  - botón "Vista previa" / 3D   -> snapshots Konva toDataURL por slot
--    (studio-editor.tsx:2233-2282, :2553)
--  - canvas / slot               -> re-cache de filtros por frame de zoom
--    (studio-slot.tsx:2450-2462) y smartcrop (:2486)
