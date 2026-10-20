-- RLS deny-by-default para el ledger Wompi (migración Prisma
-- 20261017120000_wompi_payment_ledger). Solo el backend privilegiado puede
-- leer/escribir intentos y transacciones; no hay acceso PostgREST para clientes.

ALTER TABLE public."WompiPaymentAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WompiPaymentTransaction" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."WompiPaymentAttempt" FROM anon, authenticated;
REVOKE ALL ON TABLE public."WompiPaymentTransaction" FROM anon, authenticated;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('WompiPaymentAttempt', 'WompiPaymentTransaction')
    AND rowsecurity = false;
  IF n > 0 THEN
    RAISE EXCEPTION 'Quedan % tablas del ledger Wompi sin RLS', n;
  END IF;
  RAISE NOTICE 'OK: ledger Wompi con RLS habilitada y sin grants de cliente.';
END $$;
