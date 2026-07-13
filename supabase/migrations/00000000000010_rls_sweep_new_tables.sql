-- Auditoría 2026-07-13 (mandato #12): las tablas creadas DESPUÉS del sweep de la
-- migración 7 (WarrantyClaim, RetractRequest, ErrorLog con PII/stack traces, etc.)
-- pueden quedar SIN ENABLE ROW LEVEL SECURITY en un build fresco donde las migraciones
-- Prisma que las crean corren antes del sweep. Este sweep se coloca como la ÚLTIMA
-- migración supabase → corre después de que TODAS las tablas existen (el batch supabase
-- se aplica tras `prisma migrate deploy`) y re-asegura RLS en cualquier tabla que quede
-- destapada. Idempotente: solo toca tablas con rowsecurity=false (no-op en dev, que ya
-- tiene RLS en todo).
--
-- Estrategia (igual que la migración 7): DENY-BY-DEFAULT (ENABLE RLS sin políticas). La
-- app opera vía Prisma con el rol privilegiado (bypassa RLS) → no rompe nada; el cliente
-- anon (publishable key) queda sin acceso por PostgREST salvo policy SELECT explícita.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND rowsecurity = false
      AND tablename NOT LIKE '_prisma%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    RAISE NOTICE 'RLS habilitada (sweep) en public.%', r.tablename;
  END LOOP;
END $$;

-- Verificación inline: si queda alguna tabla pública sin RLS, falla la migración.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = false AND tablename NOT LIKE '_prisma%';
  IF n > 0 THEN
    RAISE EXCEPTION 'Quedan % tablas públicas sin RLS tras el sweep', n;
  END IF;
  RAISE NOTICE 'OK: todas las tablas públicas tienen RLS habilitada (sweep).';
END $$;
