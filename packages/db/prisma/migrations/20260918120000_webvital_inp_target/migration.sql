-- 2026-09-18 — WebVital.target: selector CSS del elemento que produjo el INP
-- (web-vitals attribution.interactionTarget). Permite correlacionar las
-- alertas "Interaction Timing" de Vercel con el elemento exacto.
ALTER TABLE "WebVital" ADD COLUMN "target" TEXT;
