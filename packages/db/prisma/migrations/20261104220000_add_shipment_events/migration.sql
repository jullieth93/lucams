-- 2026-11-04 · Historial granular de eventos del carrier (`ShipmentEvent`) para el timeline
-- enriquecido de /pedido/[token] y la trazabilidad de soporte (feedback owner: el "Estado de tu
-- pedido" era una barra estática sin tiempos ni novedades aunque Aveonline SÍ entrega el
-- historial con `fecha`/`descripcion` en el webhook y en `historicos[]` del polling).
--
-- Seguridad cero suposiciones (mismo patrón que 20261104190000_add_crm_activities_and_tasks):
--  1) CREATE TABLE + índices + FK (ON DELETE CASCADE, igual que OrderStatusEvent).
--  2) ENABLE ROW LEVEL SECURITY explícita.
--  3) REVOKE ALL para `anon`/`authenticated` y REVOKE DML para `service_role` (cero PostgREST).
--  4) Verificación inline `DO $$ ... RAISE EXCEPTION $$` que falla el deploy si falta un candado.
-- Sin PII: solo hitos logísticos del carrier (estado, descripción operativa, fecha).

CREATE TABLE IF NOT EXISTS "public"."ShipmentEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "trackingNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "carrierStatusRaw" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL,
  "dedupKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShipmentEvent_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "public"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ShipmentEvent_status_check" CHECK (
    "status" IN ('PENDING', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'EXCEPTION')
  ),
  CONSTRAINT "ShipmentEvent_source_check" CHECK ("source" IN ('WEBHOOK', 'POLL'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShipmentEvent_dedupKey_key"
  ON "public"."ShipmentEvent"("dedupKey");
CREATE INDEX IF NOT EXISTS "ShipmentEvent_orderId_occurredAt_idx"
  ON "public"."ShipmentEvent"("orderId", "occurredAt");
CREATE INDEX IF NOT EXISTS "ShipmentEvent_trackingNumber_occurredAt_idx"
  ON "public"."ShipmentEvent"("trackingNumber", "occurredAt");

ALTER TABLE "public"."ShipmentEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."ShipmentEvent" FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."ShipmentEvent" FROM service_role;

DO $$
DECLARE
  unprotected_count int;
  leaked_grants int;
BEGIN
  SELECT count(*) INTO unprotected_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename = 'ShipmentEvent'
    AND rowsecurity = false;

  IF unprotected_count > 0 THEN
    RAISE EXCEPTION 'ShipmentEvent sin RLS habilitada';
  END IF;

  SELECT count(*) INTO leaked_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'ShipmentEvent'
    AND (
      grantee IN ('anon', 'authenticated')
      OR (grantee = 'service_role'
          AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
    );

  IF leaked_grants > 0 THEN
    RAISE EXCEPTION 'ShipmentEvent conserva % grants no autorizados en PostgREST', leaked_grants;
  END IF;

  RAISE NOTICE 'OK: ShipmentEvent con RLS activa y 0 grants en PostgREST.';
END $$;
