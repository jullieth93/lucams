-- Auditoría de seguridad (docs/audits/auditoria_seguridad_lucams.md) — cierra
-- el hallazgo G-4 [A04]: las policies backstop de la migración 00000000000002
-- son demasiado permisivas si los grants DML reaparecen algún día (hoy están
-- DORMIDAS: anon/authenticated no tienen privilegios de tabla — PostgREST
-- responde 42501 antes de evaluar RLS). Es defensa en profundidad:
--
--   1. `review insert own` no impedía auto-aprobar/auto-destacar reseñas
--      (isApproved=true, featured=true en el INSERT).
--   2. `customer updates own row` permitía al cliente tocarse loyaltyPoints,
--      referralCode y referredById.
--   3. `cart owner all` / `cart item via cart` (FOR ALL) permitían al cliente
--      reescribir CartItem.unitPrice (fijarse precios).
--
-- Modelo de los triggers de guarda: solo bloquean cuando la escritura llega vía
-- PostgREST con JWT de cliente (auth.role() = 'authenticated'). Cuando la app
-- escribe como rol postgres vía Prisma (conexión directa) auth.role() es NULL →
-- permitido; service_role pasa por bypass RLS y auth.role()='service_role' →
-- también permitido. Funciones SECURITY INVOKER (sin DEFINER), search_path = ''
-- y referencias calificadas.
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY, CREATE OR REPLACE
-- FUNCTION, DROP TRIGGER IF EXISTS + CREATE TRIGGER. Re-ejecutable sin error.

-- ════════════════ 1) Review: INSERT sin auto-aprobación ni auto-destaque ════════════════

DROP POLICY IF EXISTS "review insert own" ON "Review";
CREATE POLICY "review insert own" ON "Review"
  FOR INSERT TO authenticated
  WITH CHECK (
    "isApproved" = false
    AND "featured" = false
    AND EXISTS (
      SELECT 1 FROM "Customer" c
      WHERE c.id = "Review"."customerId"
        AND c."supabaseUserId" = (auth.uid())::text
    )
  );

-- ════════════════ 2) Customer: columnas sensibles solo las toca el server ════════════════

CREATE OR REPLACE FUNCTION public.customer_block_sensitive_col_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- auth.role() es NULL en conexiones directas (Prisma/postgres) → permitido.
  IF auth.role() = 'authenticated'
     AND (
       NEW."loyaltyPoints" IS DISTINCT FROM OLD."loyaltyPoints"
       OR NEW."referralCode" IS DISTINCT FROM OLD."referralCode"
       OR NEW."referredById" IS DISTINCT FROM OLD."referredById"
     )
  THEN
    RAISE EXCEPTION 'Customer: loyaltyPoints/referralCode/referredById solo los modifica el servidor'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Función de trigger: nadie debe ejecutarla directamente vía RPC.
REVOKE EXECUTE ON FUNCTION public.customer_block_sensitive_col_update()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customer_block_sensitive_col_update_trg ON "Customer";
CREATE TRIGGER customer_block_sensitive_col_update_trg
  BEFORE UPDATE ON "Customer"
  FOR EACH ROW
  EXECUTE FUNCTION public.customer_block_sensitive_col_update();

-- ════════════════ 3) Cart: FOR ALL dividido por comando ════════════════
-- Misma pertenencia que antes (dueño vía Customer.supabaseUserId); el split
-- acota la superficie y deja el UPDATE bajo USING+WITH CHECK explícitos.

DROP POLICY IF EXISTS "cart owner all" ON "Cart";

DROP POLICY IF EXISTS "cart owner select" ON "Cart";
CREATE POLICY "cart owner select" ON "Cart"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "Cart"."customerId"
      AND c."supabaseUserId" = (auth.uid())::text
  ));

DROP POLICY IF EXISTS "cart owner insert" ON "Cart";
CREATE POLICY "cart owner insert" ON "Cart"
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "Cart"."customerId"
      AND c."supabaseUserId" = (auth.uid())::text
  ));

DROP POLICY IF EXISTS "cart owner update" ON "Cart";
CREATE POLICY "cart owner update" ON "Cart"
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "Cart"."customerId"
      AND c."supabaseUserId" = (auth.uid())::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "Cart"."customerId"
      AND c."supabaseUserId" = (auth.uid())::text
  ));

DROP POLICY IF EXISTS "cart owner delete" ON "Cart";
CREATE POLICY "cart owner delete" ON "Cart"
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "Cart"."customerId"
      AND c."supabaseUserId" = (auth.uid())::text
  ));

-- ════════════════ 4) CartItem: split + guarda de precio ════════════════
-- El cliente puede cambiar qty (y otros campos de personalización), pero
-- unitPrice lo fija el servidor: el trigger rechaza su cambio para
-- authenticated. El INSERT queda acotado a items de carros propios.

DROP POLICY IF EXISTS "cart item via cart" ON "CartItem";

DROP POLICY IF EXISTS "cart item via cart select" ON "CartItem";
CREATE POLICY "cart item via cart select" ON "CartItem"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "Cart" ct
    JOIN "Customer" c ON c.id = ct."customerId"
    WHERE ct.id = "CartItem"."cartId"
      AND c."supabaseUserId" = (auth.uid())::text
  ));

DROP POLICY IF EXISTS "cart item via cart insert" ON "CartItem";
CREATE POLICY "cart item via cart insert" ON "CartItem"
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Cart" ct
    JOIN "Customer" c ON c.id = ct."customerId"
    WHERE ct.id = "CartItem"."cartId"
      AND c."supabaseUserId" = (auth.uid())::text
  ));

DROP POLICY IF EXISTS "cart item via cart update" ON "CartItem";
CREATE POLICY "cart item via cart update" ON "CartItem"
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "Cart" ct
    JOIN "Customer" c ON c.id = ct."customerId"
    WHERE ct.id = "CartItem"."cartId"
      AND c."supabaseUserId" = (auth.uid())::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Cart" ct
    JOIN "Customer" c ON c.id = ct."customerId"
    WHERE ct.id = "CartItem"."cartId"
      AND c."supabaseUserId" = (auth.uid())::text
  ));

DROP POLICY IF EXISTS "cart item via cart delete" ON "CartItem";
CREATE POLICY "cart item via cart delete" ON "CartItem"
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "Cart" ct
    JOIN "Customer" c ON c.id = ct."customerId"
    WHERE ct.id = "CartItem"."cartId"
      AND c."supabaseUserId" = (auth.uid())::text
  ));

CREATE OR REPLACE FUNCTION public.cartitem_block_unitprice_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- qty y demás columnas sí puede tocarlas el cliente; el precio, no.
  IF auth.role() = 'authenticated'
     AND NEW."unitPrice" IS DISTINCT FROM OLD."unitPrice"
  THEN
    RAISE EXCEPTION 'CartItem: unitPrice solo lo modifica el servidor'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cartitem_block_unitprice_update()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cartitem_block_unitprice_update_trg ON "CartItem";
CREATE TRIGGER cartitem_block_unitprice_update_trg
  BEFORE UPDATE ON "CartItem"
  FOR EACH ROW
  EXECUTE FUNCTION public.cartitem_block_unitprice_update();

-- ════════════════ Verificación inline ════════════════
-- Si falta alguna policy o trigger esperado, falla la migración.

DO $$
DECLARE
  faltantes text[];
BEGIN
  SELECT array_agg(v.tabla || '.' || v.objeto) INTO faltantes
  FROM (VALUES
    ('Review',   'review insert own'),
    ('Cart',     'cart owner select'),
    ('Cart',     'cart owner insert'),
    ('Cart',     'cart owner update'),
    ('Cart',     'cart owner delete'),
    ('CartItem', 'cart item via cart select'),
    ('CartItem', 'cart item via cart insert'),
    ('CartItem', 'cart item via cart update'),
    ('CartItem', 'cart item via cart delete')
  ) AS v(tabla, objeto)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = v.tabla
      AND policyname = v.objeto
  );

  IF faltantes IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan policies backstop tras la migración: %', faltantes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'Customer'
      AND t.tgname = 'customer_block_sensitive_col_update_trg' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Falta el trigger customer_block_sensitive_col_update_trg en Customer';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'CartItem'
      AND t.tgname = 'cartitem_block_unitprice_update_trg' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Falta el trigger cartitem_block_unitprice_update_trg en CartItem';
  END IF;

  RAISE NOTICE 'OK: backstop RLS endurecido (Review insert, Customer/CartItem column guards, Cart/CartItem split).';
END $$;
