-- F-24 (pre-launch audit 2026-09-04): money and stock integrity was 100%
-- app-layer. No CHECK constraint exists anywhere in the schema (grep evidence:
-- packages/db/prisma/migrations only ever adds PK/FK constraints). A single
-- app bug, a failed saga step or a manual SQL fix could persist a negative
-- price, negative stock or a qty=0 line, and every downstream total would
-- silently inherit the corruption (Wompi charges, COD reconciliation, DIAN
-- invoicing).
--
-- This migration adds the first CHECK constraints of the schema:
--   - `>= 0` on every cents-COP column (prices, totals, discounts, refunds,
--     applied coupon amounts) and on stock counters;
--   - `> 0` on quantities that are meaningless at zero (cart/order/quote line
--     qty, stock reservations, coupon usage caps, wholesale tier minimums,
--     product min/max order quantities).
--
-- NOT VALID + VALIDATE (per table, back to back): ADD CONSTRAINT ... NOT
-- VALID is metadata-only (no table scan, writes not blocked) and is still
-- enforced for NEW writes from the moment it is created; VALIDATE CONSTRAINT
-- then scans existing rows holding SHARE UPDATE EXCLUSIVE, which does not
-- block reads or writes. CONVENTIONS.md § migration strategy documents
-- NOT VALID → VALIDATE for foreign keys; extending the same pattern to CHECK
-- constraints is deliberate (same lock profile) and this file is the first
-- precedent. There is no integrity gap between the two statements.
--
-- Naming: `<Table>_<column>_nonnegative_check` / `<Table>_<column>_positive_check`
-- (CONVENTIONS.md § DB naming: `<table>_<column>_check`; the infix keeps the
-- predicate readable in violation error messages).
--
-- Prisma cannot express CHECK constraints — same situation as the partial
-- unique index on InventoryLog (migration 20260626224910), which is
-- documented inline in schema.prisma. Every model touched here carries an
-- inline NOTA pointing at this migration; do NOT regenerate a diff migration
-- that drops these constraints (Prisma does not see them, so it will not).
--
-- Retro-compatibility evidence (checked against the app layer, 2026-09-04):
--   - Coupon.value stays >= 0 (not > 0): features/coupons/schemas.ts allows
--     value min 0 because FREE_SHIPPING coupons ignore `value`.
--   - CartItem.qty > 0 is safe: UpdateQtySchema accepts qty=0 but
--     features/cart/service.ts:529-535 DELETES the row instead of persisting
--     0; AddToCartSchema enforces min 1.
--   - Nullable columns keep accepting NULL (CHECK passes on NULL).
--
-- Deliberately NOT covered (out of F-24 scope, documented for follow-up):
--   - InventoryLog.delta / LoyaltyTxn.delta: ledger deltas are legitimately
--     negative (stock reversal, points redemption).
--   - Customer.loyaltyPoints: a points balance, not cents/stock. Candidate
--     for a follow-up once redemption paths are reviewed for transient
--     negatives.
--   - Cross-column rules (Order.total = subtotal - discount + shipping + tax;
--     Coupon PERCENT value <= 100): valuable, but they are semantic rules,
--     not sign rules.
--   - OrderItem/CartItem have no `total`/`quantity` columns (line totals are
--     computed in app); the real column names (qty, unitPrice) are used.
--
-- PRE-FLIGHT IN STG (retro-compat gate): VALIDATE below fails loudly if any
-- legacy row violates a check. Before running `prisma migrate deploy` in STG,
-- this battery must return 0 rows per line (it mirrors every constraint):
--   SELECT 'Product.basePrice' col, count(*) n FROM "Product" WHERE "basePrice" < 0
--   UNION ALL SELECT 'Product.compareAtPrice', count(*) FROM "Product" WHERE "compareAtPrice" < 0
--   UNION ALL SELECT 'Product.cost', count(*) FROM "Product" WHERE "cost" < 0
--   UNION ALL SELECT 'Product.minimumQuantity', count(*) FROM "Product" WHERE "minimumQuantity" <= 0
--   UNION ALL SELECT 'Product.maximumQuantity', count(*) FROM "Product" WHERE "maximumQuantity" <= 0
--   UNION ALL SELECT 'Product.premadeSurcharge', count(*) FROM "Product" WHERE "premadeSurcharge" < 0
--   UNION ALL SELECT 'ProductVariant.price', count(*) FROM "ProductVariant" WHERE "price" < 0
--   UNION ALL SELECT 'ProductVariant.compareAtPrice', count(*) FROM "ProductVariant" WHERE "compareAtPrice" < 0
--   UNION ALL SELECT 'ProductVariant.stock', count(*) FROM "ProductVariant" WHERE "stock" < 0
--   UNION ALL SELECT 'CartItem.qty', count(*) FROM "CartItem" WHERE "qty" <= 0
--   UNION ALL SELECT 'CartItem.unitPrice', count(*) FROM "CartItem" WHERE "unitPrice" < 0
--   UNION ALL SELECT 'Order.subtotal', count(*) FROM "Order" WHERE "subtotal" < 0
--   UNION ALL SELECT 'Order.discount', count(*) FROM "Order" WHERE "discount" < 0
--   UNION ALL SELECT 'Order.shipping', count(*) FROM "Order" WHERE "shipping" < 0
--   UNION ALL SELECT 'Order.tax', count(*) FROM "Order" WHERE "tax" < 0
--   UNION ALL SELECT 'Order.total', count(*) FROM "Order" WHERE "total" < 0
--   UNION ALL SELECT 'Order.refundAmount', count(*) FROM "Order" WHERE "refundAmount" < 0
--   UNION ALL SELECT 'OrderItem.qty', count(*) FROM "OrderItem" WHERE "qty" <= 0
--   UNION ALL SELECT 'OrderItem.unitPrice', count(*) FROM "OrderItem" WHERE "unitPrice" < 0
--   UNION ALL SELECT 'Coupon.value', count(*) FROM "Coupon" WHERE "value" < 0
--   UNION ALL SELECT 'Coupon.minOrder', count(*) FROM "Coupon" WHERE "minOrder" < 0
--   UNION ALL SELECT 'Coupon.maxUses', count(*) FROM "Coupon" WHERE "maxUses" <= 0
--   UNION ALL SELECT 'Coupon.usedCount', count(*) FROM "Coupon" WHERE "usedCount" < 0
--   UNION ALL SELECT 'Coupon.maxUsesPerCustomer', count(*) FROM "Coupon" WHERE "maxUsesPerCustomer" <= 0
--   UNION ALL SELECT 'Coupon.requiresMinQuantity', count(*) FROM "Coupon" WHERE "requiresMinQuantity" <= 0
--   UNION ALL SELECT 'CouponUsage.amount', count(*) FROM "CouponUsage" WHERE "amount" < 0
--   UNION ALL SELECT 'Quote.subtotal', count(*) FROM "Quote" WHERE "subtotal" < 0
--   UNION ALL SELECT 'Quote.total', count(*) FROM "Quote" WHERE "total" < 0
--   UNION ALL SELECT 'QuoteItem.unitPrice', count(*) FROM "QuoteItem" WHERE "unitPrice" < 0
--   UNION ALL SELECT 'QuoteItem.quantity', count(*) FROM "QuoteItem" WHERE "quantity" <= 0
--   UNION ALL SELECT 'WholesaleTier.minQty', count(*) FROM "WholesaleTier" WHERE "minQty" <= 0
--   UNION ALL SELECT 'WholesaleTier.unitPrice', count(*) FROM "WholesaleTier" WHERE "unitPrice" < 0
--   UNION ALL SELECT 'StockReservation.qty', count(*) FROM "StockReservation" WHERE "qty" <= 0
--   UNION ALL SELECT 'CodReconciliation.expectedAmount', count(*) FROM "CodReconciliation" WHERE "expectedAmount" < 0
--   UNION ALL SELECT 'CodReconciliation.remittedAmount', count(*) FROM "CodReconciliation" WHERE "remittedAmount" < 0
--   UNION ALL SELECT 'RetractRequest.refundAmount', count(*) FROM "RetractRequest" WHERE "refundAmount" < 0
--   UNION ALL SELECT 'Material.stock', count(*) FROM "Material" WHERE "stock" < 0
--   UNION ALL SELECT 'Material.minStock', count(*) FROM "Material" WHERE "minStock" < 0
--   UNION ALL SELECT 'Material.costPerUnit', count(*) FROM "Material" WHERE "costPerUnit" < 0;
-- This migration modifies NO data: a failed VALIDATE leaves the offending
-- rows intact for manual correction before re-running the deploy.

-- ──────────────── Product ────────────────
ALTER TABLE "Product" ADD CONSTRAINT "Product_basePrice_nonnegative_check" CHECK ("basePrice" >= 0) NOT VALID;
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_basePrice_nonnegative_check";
ALTER TABLE "Product" ADD CONSTRAINT "Product_compareAtPrice_nonnegative_check" CHECK ("compareAtPrice" >= 0) NOT VALID;
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_compareAtPrice_nonnegative_check";
ALTER TABLE "Product" ADD CONSTRAINT "Product_cost_nonnegative_check" CHECK ("cost" >= 0) NOT VALID;
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_cost_nonnegative_check";
ALTER TABLE "Product" ADD CONSTRAINT "Product_minimumQuantity_positive_check" CHECK ("minimumQuantity" > 0) NOT VALID;
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_minimumQuantity_positive_check";
ALTER TABLE "Product" ADD CONSTRAINT "Product_maximumQuantity_positive_check" CHECK ("maximumQuantity" > 0) NOT VALID;
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_maximumQuantity_positive_check";
ALTER TABLE "Product" ADD CONSTRAINT "Product_premadeSurcharge_nonnegative_check" CHECK ("premadeSurcharge" >= 0) NOT VALID;
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_premadeSurcharge_nonnegative_check";

-- ──────────────── ProductVariant ────────────────
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_price_nonnegative_check" CHECK ("price" >= 0) NOT VALID;
ALTER TABLE "ProductVariant" VALIDATE CONSTRAINT "ProductVariant_price_nonnegative_check";
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_compareAtPrice_nonnegative_check" CHECK ("compareAtPrice" >= 0) NOT VALID;
ALTER TABLE "ProductVariant" VALIDATE CONSTRAINT "ProductVariant_compareAtPrice_nonnegative_check";
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_stock_nonnegative_check" CHECK ("stock" >= 0) NOT VALID;
ALTER TABLE "ProductVariant" VALIDATE CONSTRAINT "ProductVariant_stock_nonnegative_check";

-- ──────────────── CartItem ────────────────
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_qty_positive_check" CHECK ("qty" > 0) NOT VALID;
ALTER TABLE "CartItem" VALIDATE CONSTRAINT "CartItem_qty_positive_check";
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_unitPrice_nonnegative_check" CHECK ("unitPrice" >= 0) NOT VALID;
ALTER TABLE "CartItem" VALIDATE CONSTRAINT "CartItem_unitPrice_nonnegative_check";

-- ──────────────── Order ────────────────
ALTER TABLE "Order" ADD CONSTRAINT "Order_subtotal_nonnegative_check" CHECK ("subtotal" >= 0) NOT VALID;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_subtotal_nonnegative_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_discount_nonnegative_check" CHECK ("discount" >= 0) NOT VALID;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_discount_nonnegative_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_shipping_nonnegative_check" CHECK ("shipping" >= 0) NOT VALID;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_shipping_nonnegative_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_tax_nonnegative_check" CHECK ("tax" >= 0) NOT VALID;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_tax_nonnegative_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_total_nonnegative_check" CHECK ("total" >= 0) NOT VALID;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_total_nonnegative_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_refundAmount_nonnegative_check" CHECK ("refundAmount" >= 0) NOT VALID;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_refundAmount_nonnegative_check";

-- ──────────────── OrderItem ────────────────
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_qty_positive_check" CHECK ("qty" > 0) NOT VALID;
ALTER TABLE "OrderItem" VALIDATE CONSTRAINT "OrderItem_qty_positive_check";
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_unitPrice_nonnegative_check" CHECK ("unitPrice" >= 0) NOT VALID;
ALTER TABLE "OrderItem" VALIDATE CONSTRAINT "OrderItem_unitPrice_nonnegative_check";

-- ──────────────── Coupon / CouponUsage ────────────────
-- value stays >= 0 (not > 0): FREE_SHIPPING coupons carry value 0 — see header.
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_value_nonnegative_check" CHECK ("value" >= 0) NOT VALID;
ALTER TABLE "Coupon" VALIDATE CONSTRAINT "Coupon_value_nonnegative_check";
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_minOrder_nonnegative_check" CHECK ("minOrder" >= 0) NOT VALID;
ALTER TABLE "Coupon" VALIDATE CONSTRAINT "Coupon_minOrder_nonnegative_check";
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_maxUses_positive_check" CHECK ("maxUses" > 0) NOT VALID;
ALTER TABLE "Coupon" VALIDATE CONSTRAINT "Coupon_maxUses_positive_check";
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_usedCount_nonnegative_check" CHECK ("usedCount" >= 0) NOT VALID;
ALTER TABLE "Coupon" VALIDATE CONSTRAINT "Coupon_usedCount_nonnegative_check";
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_maxUsesPerCustomer_positive_check" CHECK ("maxUsesPerCustomer" > 0) NOT VALID;
ALTER TABLE "Coupon" VALIDATE CONSTRAINT "Coupon_maxUsesPerCustomer_positive_check";
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_requiresMinQuantity_positive_check" CHECK ("requiresMinQuantity" > 0) NOT VALID;
ALTER TABLE "Coupon" VALIDATE CONSTRAINT "Coupon_requiresMinQuantity_positive_check";

ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_amount_nonnegative_check" CHECK ("amount" >= 0) NOT VALID;
ALTER TABLE "CouponUsage" VALIDATE CONSTRAINT "CouponUsage_amount_nonnegative_check";

-- ──────────────── Quote / QuoteItem ────────────────
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_subtotal_nonnegative_check" CHECK ("subtotal" >= 0) NOT VALID;
ALTER TABLE "Quote" VALIDATE CONSTRAINT "Quote_subtotal_nonnegative_check";
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_total_nonnegative_check" CHECK ("total" >= 0) NOT VALID;
ALTER TABLE "Quote" VALIDATE CONSTRAINT "Quote_total_nonnegative_check";

ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_unitPrice_nonnegative_check" CHECK ("unitPrice" >= 0) NOT VALID;
ALTER TABLE "QuoteItem" VALIDATE CONSTRAINT "QuoteItem_unitPrice_nonnegative_check";
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quantity_positive_check" CHECK ("quantity" > 0) NOT VALID;
ALTER TABLE "QuoteItem" VALIDATE CONSTRAINT "QuoteItem_quantity_positive_check";

-- ──────────────── WholesaleTier ────────────────
ALTER TABLE "WholesaleTier" ADD CONSTRAINT "WholesaleTier_minQty_positive_check" CHECK ("minQty" > 0) NOT VALID;
ALTER TABLE "WholesaleTier" VALIDATE CONSTRAINT "WholesaleTier_minQty_positive_check";
ALTER TABLE "WholesaleTier" ADD CONSTRAINT "WholesaleTier_unitPrice_nonnegative_check" CHECK ("unitPrice" >= 0) NOT VALID;
ALTER TABLE "WholesaleTier" VALIDATE CONSTRAINT "WholesaleTier_unitPrice_nonnegative_check";

-- ──────────────── StockReservation ────────────────
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_qty_positive_check" CHECK ("qty" > 0) NOT VALID;
ALTER TABLE "StockReservation" VALIDATE CONSTRAINT "StockReservation_qty_positive_check";

-- ──────────────── CodReconciliation ────────────────
ALTER TABLE "CodReconciliation" ADD CONSTRAINT "CodReconciliation_expectedAmount_nonnegative_check" CHECK ("expectedAmount" >= 0) NOT VALID;
ALTER TABLE "CodReconciliation" VALIDATE CONSTRAINT "CodReconciliation_expectedAmount_nonnegative_check";
ALTER TABLE "CodReconciliation" ADD CONSTRAINT "CodReconciliation_remittedAmount_nonnegative_check" CHECK ("remittedAmount" >= 0) NOT VALID;
ALTER TABLE "CodReconciliation" VALIDATE CONSTRAINT "CodReconciliation_remittedAmount_nonnegative_check";

-- ──────────────── RetractRequest ────────────────
ALTER TABLE "RetractRequest" ADD CONSTRAINT "RetractRequest_refundAmount_nonnegative_check" CHECK ("refundAmount" >= 0) NOT VALID;
ALTER TABLE "RetractRequest" VALIDATE CONSTRAINT "RetractRequest_refundAmount_nonnegative_check";

-- ──────────────── Material ────────────────
ALTER TABLE "Material" ADD CONSTRAINT "Material_stock_nonnegative_check" CHECK ("stock" >= 0) NOT VALID;
ALTER TABLE "Material" VALIDATE CONSTRAINT "Material_stock_nonnegative_check";
ALTER TABLE "Material" ADD CONSTRAINT "Material_minStock_nonnegative_check" CHECK ("minStock" >= 0) NOT VALID;
ALTER TABLE "Material" VALIDATE CONSTRAINT "Material_minStock_nonnegative_check";
ALTER TABLE "Material" ADD CONSTRAINT "Material_costPerUnit_nonnegative_check" CHECK ("costPerUnit" >= 0) NOT VALID;
ALTER TABLE "Material" VALIDATE CONSTRAINT "Material_costPerUnit_nonnegative_check";

-- ──────────────── Inline verification ────────────────
-- Same fail-loud style as supabase/migrations/00000000000028: if any expected
-- constraint is missing or left unvalidated, the migration fails so the
-- deploy cannot report success on a partial state.

DO $$
DECLARE
  missing     text[];
  unvalidated text[];
BEGIN
  SELECT array_agg(v.cname) INTO missing
  FROM (VALUES
    ('Product_basePrice_nonnegative_check'),
    ('Product_compareAtPrice_nonnegative_check'),
    ('Product_cost_nonnegative_check'),
    ('Product_minimumQuantity_positive_check'),
    ('Product_maximumQuantity_positive_check'),
    ('Product_premadeSurcharge_nonnegative_check'),
    ('ProductVariant_price_nonnegative_check'),
    ('ProductVariant_compareAtPrice_nonnegative_check'),
    ('ProductVariant_stock_nonnegative_check'),
    ('CartItem_qty_positive_check'),
    ('CartItem_unitPrice_nonnegative_check'),
    ('Order_subtotal_nonnegative_check'),
    ('Order_discount_nonnegative_check'),
    ('Order_shipping_nonnegative_check'),
    ('Order_tax_nonnegative_check'),
    ('Order_total_nonnegative_check'),
    ('Order_refundAmount_nonnegative_check'),
    ('OrderItem_qty_positive_check'),
    ('OrderItem_unitPrice_nonnegative_check'),
    ('Coupon_value_nonnegative_check'),
    ('Coupon_minOrder_nonnegative_check'),
    ('Coupon_maxUses_positive_check'),
    ('Coupon_usedCount_nonnegative_check'),
    ('Coupon_maxUsesPerCustomer_positive_check'),
    ('Coupon_requiresMinQuantity_positive_check'),
    ('CouponUsage_amount_nonnegative_check'),
    ('Quote_subtotal_nonnegative_check'),
    ('Quote_total_nonnegative_check'),
    ('QuoteItem_unitPrice_nonnegative_check'),
    ('QuoteItem_quantity_positive_check'),
    ('WholesaleTier_minQty_positive_check'),
    ('WholesaleTier_unitPrice_nonnegative_check'),
    ('StockReservation_qty_positive_check'),
    ('CodReconciliation_expectedAmount_nonnegative_check'),
    ('CodReconciliation_remittedAmount_nonnegative_check'),
    ('RetractRequest_refundAmount_nonnegative_check'),
    ('Material_stock_nonnegative_check'),
    ('Material_minStock_nonnegative_check'),
    ('Material_costPerUnit_nonnegative_check')
  ) AS v(cname)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND c.conname = v.cname
      AND c.contype = 'c'
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing CHECK constraints after migration: %', missing;
  END IF;

  SELECT array_agg(c.conname) INTO unvalidated
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND c.contype = 'c'
    AND NOT c.convalidated
    AND c.conname IN (
      'Product_basePrice_nonnegative_check',
      'Product_compareAtPrice_nonnegative_check',
      'Product_cost_nonnegative_check',
      'Product_minimumQuantity_positive_check',
      'Product_maximumQuantity_positive_check',
      'Product_premadeSurcharge_nonnegative_check',
      'ProductVariant_price_nonnegative_check',
      'ProductVariant_compareAtPrice_nonnegative_check',
      'ProductVariant_stock_nonnegative_check',
      'CartItem_qty_positive_check',
      'CartItem_unitPrice_nonnegative_check',
      'Order_subtotal_nonnegative_check',
      'Order_discount_nonnegative_check',
      'Order_shipping_nonnegative_check',
      'Order_tax_nonnegative_check',
      'Order_total_nonnegative_check',
      'Order_refundAmount_nonnegative_check',
      'OrderItem_qty_positive_check',
      'OrderItem_unitPrice_nonnegative_check',
      'Coupon_value_nonnegative_check',
      'Coupon_minOrder_nonnegative_check',
      'Coupon_maxUses_positive_check',
      'Coupon_usedCount_nonnegative_check',
      'Coupon_maxUsesPerCustomer_positive_check',
      'Coupon_requiresMinQuantity_positive_check',
      'CouponUsage_amount_nonnegative_check',
      'Quote_subtotal_nonnegative_check',
      'Quote_total_nonnegative_check',
      'QuoteItem_unitPrice_nonnegative_check',
      'QuoteItem_quantity_positive_check',
      'WholesaleTier_minQty_positive_check',
      'WholesaleTier_unitPrice_nonnegative_check',
      'StockReservation_qty_positive_check',
      'CodReconciliation_expectedAmount_nonnegative_check',
      'CodReconciliation_remittedAmount_nonnegative_check',
      'RetractRequest_refundAmount_nonnegative_check',
      'Material_stock_nonnegative_check',
      'Material_minStock_nonnegative_check',
      'Material_costPerUnit_nonnegative_check'
    );

  IF unvalidated IS NOT NULL THEN
    RAISE EXCEPTION 'CHECK constraints left NOT VALID (existing rows violate them — see pre-flight query in header): %', unvalidated;
  END IF;

  RAISE NOTICE 'OK: 39 money/stock CHECK constraints added and validated (F-24).';
END $$;
