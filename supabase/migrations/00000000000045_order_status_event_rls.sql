-- RLS deny-by-default para el historial de estados del pedido (migración Prisma
-- 20261029120000_order_status_events). Lo escribe/lee solo el backend
-- privilegiado (transitionOrder en la saga, crons y acciones admin); no hay
-- acceso PostgREST para clientes — mismo patrón que el ledger Wompi (042).

ALTER TABLE public."OrderStatusEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."OrderStatusEvent" FROM anon, authenticated;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('OrderStatusEvent')
    AND rowsecurity = false;
  IF n > 0 THEN
    RAISE EXCEPTION 'OrderStatusEvent sin RLS habilitada';
  END IF;
  RAISE NOTICE 'OK: OrderStatusEvent con RLS habilitada y sin grants de cliente.';
END $$;
