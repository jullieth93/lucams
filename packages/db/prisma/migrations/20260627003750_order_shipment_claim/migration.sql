-- #11-P1 (verificación post-launch Bloque A 2026-06-27) — claim atómico de guía.
-- Cierra el hueco de doble-guía concurrente: dos processPaidOrder sobre una orden
-- ya PAID con trackingNumber=null (createShipment lento/fallido en un pase previo)
-- saltaban la $transaction de stock y ambas llegaban a createShipment → 2 guías
-- Aveonline. Con un updateMany condicional sobre shipmentClaimedAt, solo un proceso
-- gana el claim antes de llamar a Aveonline.
ALTER TABLE "Order" ADD COLUMN "shipmentClaimedAt" TIMESTAMP(3);
