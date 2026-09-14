-- N-10a (2026-09-12): DROP de 3 modelos sin lecturas ni escrituras en código
-- productivo y con 0 filas en los 3 ambientes (auditoría 2026-09-11, higiene
-- de schema):
--
--   - SiteEvent: eventos custom de funnel — nunca se escribió un solo evento
--     (la observabilidad quedó cubierta por WebVital + ErrorReport + AlertState).
--   - RecommendationLog: tracking de recomendaciones (PLAN_CATALOG_V2 6.10) —
--     ningún flujo (/api/catalog/recommend, cross-sell, related PDP, bot) llegó
--     a crear logs. Su único toque de código era el unlink GDPR en
--     features/account/delete-service.ts (retirado con el modelo).
--   - StockReservation: reserva de stock con TTL (ADR-014, decisión diferida
--     que quedó descartada) — la protección real contra oversold es el UPDATE
--     atómico (UPDATE … WHERE stock>=qty) + needsReconciliation
--     (apps/web/features/orders/stock.ts). Su cron SQL
--     `stock_reservation_cleanup` se des-agenda en
--     supabase/migrations/00000000000033_drop_stock_reservation_cleanup_job.sql.
--
-- BlogPost y LoyaltyTxn se CONSERVAN (FUTURO_APROBADO — PLAN/ROADMAP F5).
--
-- Escrita a mano y aplicada con `prisma migrate deploy` — `migrate dev` no
-- funciona contra esta DB (shadow DB sin pg_trgm, P3006 documentado en el
-- header de 20260911120000). IF EXISTS + CASCADE: segura de re-aplicar y cubre
-- los objetos dependientes propios de cada tabla (índices y sus FKs).

DROP TABLE IF EXISTS "SiteEvent" CASCADE;
DROP TABLE IF EXISTS "RecommendationLog" CASCADE;
DROP TABLE IF EXISTS "StockReservation" CASCADE;
