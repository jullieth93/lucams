-- supabase/migrations/00000000000002_rls_policies.sql
--
-- Habilita Row Level Security en TODAS las tablas creadas por Prisma + define
-- policies básicas. Es el cumplimiento del mandato #12 de CLAUDE.md:
--   "Toda tabla con acceso vía anon_key debe tener RLS habilitada."
--
-- Modelo de policies (ver docs/SECURITY.md § RLS por tabla):
--   - Catálogo público (Category/Product/ProductVariant/Review approved/BlogPost
--     publicado): SELECT abierto a anon + authenticated con filtros de visibilidad.
--   - Datos del cliente final (Customer/Address/Cart/Order/etc.): solo el dueño
--     vía auth.uid() = Customer.supabaseUserId. authenticated rol; anon
--     denegado (carros anónimos pasan por service_role server-side).
--   - Datos admin/internos (AdminUser/InventoryLog/Coupon/WebhookEvent/etc.):
--     RLS habilitada SIN policies → deny-by-default para anon y authenticated.
--     Acceso solo vía service_role (que bypasea RLS automáticamente).
--
-- service_role siempre bypasea RLS — no necesita policies.
--
-- Idempotencia: usa DROP POLICY IF EXISTS antes de CREATE POLICY para que
-- el script sea re-ejecutable sin error.
--
-- Cast notation: auth.uid() devuelve uuid; supabaseUserId es text. Usar
-- (auth.uid())::text en comparaciones.

-- ════════════════════════ ENABLE RLS ════════════════════════

ALTER TABLE "Customer"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Address"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminUser"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductVariant"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryLog"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cart"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CartItem"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Coupon"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Review"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AbandonedCart"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyTxn"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Referral"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlogPost"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEvent"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockReservation"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminActionLog"    ENABLE ROW LEVEL SECURITY;

-- ════════════════════════ CATÁLOGO PÚBLICO ════════════════════════

DROP POLICY IF EXISTS "public read active categories" ON "Category";
CREATE POLICY "public read active categories" ON "Category"
  FOR SELECT TO anon, authenticated
  USING ("isActive" = true AND "deletedAt" IS NULL);

DROP POLICY IF EXISTS "public read active products" ON "Product";
CREATE POLICY "public read active products" ON "Product"
  FOR SELECT TO anon, authenticated
  USING ("isActive" = true AND "deletedAt" IS NULL);

DROP POLICY IF EXISTS "public read product variants" ON "ProductVariant";
CREATE POLICY "public read product variants" ON "ProductVariant"
  FOR SELECT TO anon, authenticated
  USING ("deletedAt" IS NULL);

DROP POLICY IF EXISTS "public read approved reviews" ON "Review";
CREATE POLICY "public read approved reviews" ON "Review"
  FOR SELECT TO anon, authenticated
  USING ("isApproved" = true AND "deletedAt" IS NULL);

DROP POLICY IF EXISTS "public read published blog posts" ON "BlogPost";
CREATE POLICY "public read published blog posts" ON "BlogPost"
  FOR SELECT TO anon, authenticated
  USING ("isPublished" = true AND "publishedAt" <= NOW() AND "deletedAt" IS NULL);

-- ════════════════════════ CUSTOMER-OWNED ════════════════════════

-- Customer: el dueño puede leer y actualizar su propio registro.
-- INSERT lo hace el server con service_role en signup.
DROP POLICY IF EXISTS "customer reads own row" ON "Customer";
CREATE POLICY "customer reads own row" ON "Customer"
  FOR SELECT TO authenticated
  USING ("supabaseUserId" = (auth.uid())::text AND "deletedAt" IS NULL);

DROP POLICY IF EXISTS "customer updates own row" ON "Customer";
CREATE POLICY "customer updates own row" ON "Customer"
  FOR UPDATE TO authenticated
  USING ("supabaseUserId" = (auth.uid())::text)
  WITH CHECK ("supabaseUserId" = (auth.uid())::text);

-- Address: full access al dueño (el customer al que pertenece).
DROP POLICY IF EXISTS "address owner all" ON "Address";
CREATE POLICY "address owner all" ON "Address"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "Address"."customerId"
      AND c."supabaseUserId" = (auth.uid())::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "Address"."customerId"
      AND c."supabaseUserId" = (auth.uid())::text
  ));

-- Cart + CartItem: solo carros con customerId que sea del usuario authenticated.
-- Carros anónimos (customerId NULL) pasan por service_role en server.
DROP POLICY IF EXISTS "cart owner all" ON "Cart";
CREATE POLICY "cart owner all" ON "Cart"
  FOR ALL TO authenticated
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

DROP POLICY IF EXISTS "cart item via cart" ON "CartItem";
CREATE POLICY "cart item via cart" ON "CartItem"
  FOR ALL TO authenticated
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

-- Order + OrderItem: el cliente solo lee sus órdenes. Las mutaciones las hace
-- el server (checkout, webhooks Wompi, etc.) via service_role.
DROP POLICY IF EXISTS "order read own" ON "Order";
CREATE POLICY "order read own" ON "Order"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "Order"."customerId"
      AND c."supabaseUserId" = (auth.uid())::text
  ));

DROP POLICY IF EXISTS "order item read via order" ON "OrderItem";
CREATE POLICY "order item read via order" ON "OrderItem"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "Order" o
    JOIN "Customer" c ON c.id = o."customerId"
    WHERE o.id = "OrderItem"."orderId"
      AND c."supabaseUserId" = (auth.uid())::text
  ));

-- LoyaltyTxn: el cliente lee su histórico. Mutaciones via service_role.
DROP POLICY IF EXISTS "loyalty txn read own" ON "LoyaltyTxn";
CREATE POLICY "loyalty txn read own" ON "LoyaltyTxn"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "LoyaltyTxn"."customerId"
      AND c."supabaseUserId" = (auth.uid())::text
  ));

-- Review INSERT: el cliente puede crear sus propias reseñas (queda isApproved
-- = false hasta moderación admin).
DROP POLICY IF EXISTS "review insert own" ON "Review";
CREATE POLICY "review insert own" ON "Review"
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "Review"."customerId"
      AND c."supabaseUserId" = (auth.uid())::text
  ));

-- ════════════════════════ TABLAS DENY-BY-DEFAULT ════════════════════════
-- Las siguientes tablas tienen RLS habilitada SIN policies. Eso significa que
-- ningún SELECT/INSERT/UPDATE/DELETE funciona para anon o authenticated.
-- Solo service_role (server-side) puede tocarlas:
--
--   - AdminUser
--   - InventoryLog
--   - Coupon
--   - AbandonedCart
--   - Referral
--   - WebhookEvent
--   - StockReservation
--   - AdminActionLog
--
-- Esto es intencional: estas tablas no deben ser leídas desde el cliente.
