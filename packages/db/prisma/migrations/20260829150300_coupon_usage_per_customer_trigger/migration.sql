-- G-5 (security audit 2026-08-24): Coupon.maxUsesPerCustomer was enforced by a
-- read-then-write count in the app (priceCouponForCart at checkout, saga at
-- PAID) with no DB guarantee: two concurrent checkouts paying with the same
-- coupon and the same identity both passed the count and both inserted a
-- CouponUsage → double redemption of a "1 per customer" coupon.
--
-- The partial-unique-index fix used for Review does not fit here: the admin
-- CAN create coupons with maxUsesPerCustomer > 1 (features/coupons/schemas.ts
-- allows any int >= 1), so the cap is per-coupon data, not a fixed "1". This
-- trigger enforces the generic case: it serializes concurrent inserts for the
-- same (couponId, identity) with transaction-scoped advisory locks and then
-- re-counts under the lock against Coupon.maxUsesPerCustomer. In READ
-- COMMITTED the count runs on a fresh snapshot after the lock wait, so it sees
-- the winner's committed row (or not, if it rolled back).
--
-- Identity matches the app rule (audit de cupones #4): customerId OR
-- lower(email) — the email anchors the cap for guest checkouts. The loser gets
-- SQLSTATE 23505 on purpose: Prisma maps it to P2002 and the app translates
-- that into the friendly "ya usaste este cupón" handling (see
-- isCouponPerCustomerLimitError in features/coupons/redemption.ts).

CREATE OR REPLACE FUNCTION public.coupon_usage_enforce_per_customer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  max_per_customer int;
  current_uses     int;
BEGIN
  SELECT "maxUsesPerCustomer" INTO max_per_customer
  FROM public."Coupon"
  WHERE id = NEW."couponId" AND "deletedAt" IS NULL;

  -- Coupon without a per-customer cap → nothing to enforce.
  IF max_per_customer IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent inserts of the SAME identity. Fixed lock order
  -- (email key first, customerId key second) → no deadlocks.
  IF NEW."email" IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW."couponId" || '|' || lower(NEW."email")));
  END IF;
  IF NEW."customerId" IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW."couponId" || '|cid|' || NEW."customerId"));
  END IF;

  -- Same identity rule as priceCouponForCart: customerId OR email.
  SELECT count(*) INTO current_uses
  FROM public."CouponUsage"
  WHERE "couponId" = NEW."couponId"
    AND (
      (NEW."email" IS NOT NULL AND lower("email") = lower(NEW."email"))
      OR (NEW."customerId" IS NOT NULL AND "customerId" = NEW."customerId")
    );

  IF current_uses >= max_per_customer THEN
    RAISE EXCEPTION 'coupon_per_customer_limit coupon=%', NEW."couponId"
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "coupon_usage_per_customer_limit" ON "CouponUsage";
CREATE TRIGGER "coupon_usage_per_customer_limit"
  BEFORE INSERT ON "CouponUsage"
  FOR EACH ROW EXECUTE FUNCTION public.coupon_usage_enforce_per_customer();
