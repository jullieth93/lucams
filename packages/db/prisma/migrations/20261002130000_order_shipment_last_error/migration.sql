-- Paquete G (2026-10-02) — trazabilidad del último intento fallido de
-- generación de guía Aveonline.
--
-- Hoy, cuando createShipment falla (ej. "Guía Anulada automáticamente"), el
-- mensaje crudo de la transportadora solo queda en los logs y el admin ve un
-- throw genérico en el detalle del pedido. Esta columna persiste el intento
-- fallido SANITIZADO (sin PII: emails/teléfonos enmascarados con scrubPii) con
-- shape { message, at, carrier, destination {city, department}, timeout }.
-- La saga la escribe al fallar y la limpia al persistir el tracking.
--
-- Nullable: órdenes sin fallo de guía (o anteriores a esta ola) quedan en null.
-- Aditiva y reversible (DROP COLUMN), sin backfill ni locks largos (Postgres
-- añade columnas nullable sin default como metadata-only). Escrita a mano y
-- aplicada con `migrate deploy` — `migrate dev` no funciona contra esta DB
-- (shadow DB en Supabase, convención del repo).

ALTER TABLE "Order" ADD COLUMN "shipmentLastError" JSONB;
