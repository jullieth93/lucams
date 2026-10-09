-- FLUJO REGALO ("compro yo, lo recibe otra persona" — 2026-10-05).
--
-- El checkout gana un toggle "¿Lo recibe otra persona?" (nombre + teléfono de
-- quien recibe) y un checkbox "Es un regalo" (mensaje para la tarjeta). Estas
-- columnas persisten esa elección en la Order:
--   - recipientName/recipientPhone: destinatario de la guía Aveonline (quien
--     atiende al mensajero). null = lo recibe el comprador (comportamiento
--     histórico, sin cambios).
--   - isGift: el email de confirmación al comprador oculta los precios.
--   - giftMessage: mensaje para la tarjeta (producción/admin).
-- La facturación/documentos quedan SIEMPRE a nombre del comprador.
--
-- Aditiva y reversible (DROP COLUMN), sin backfill: las órdenes existentes
-- quedan con recipient null / isGift=false (= no regalo), que es su realidad.
-- Escrita a mano — `migrate dev` no funciona contra esta DB (shadow DB en
-- Supabase, convención del repo); aplicar con `migrate deploy`.

ALTER TABLE "Order" ADD COLUMN "recipientName" TEXT;
ALTER TABLE "Order" ADD COLUMN "recipientPhone" TEXT;
ALTER TABLE "Order" ADD COLUMN "isGift" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "giftMessage" TEXT;
