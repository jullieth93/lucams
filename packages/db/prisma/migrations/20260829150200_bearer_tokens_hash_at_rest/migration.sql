-- F-11 (security audit 2026-08-24): public bearer tokens stored in clear.
--
-- Order.publicAccessToken, Quote.publicAccessToken, Design.shareToken and
-- AbandonedCart.recoverToken were plain TEXT @unique columns holding the
-- bearer token itself (generation was fine — 128-192 bits CSPRNG — but at
-- rest a DB leak, backup or query log with values exposed immediately usable
-- /pedido/<token>, /cotizacion/<token>, /d/<token> and cart-recovery links).
--
-- Fix: hash-at-rest. Add a `<field>Hash` column per model, backfill it with
-- the SHA-256 hex digest of the existing token (links already emailed keep
-- working), enforce uniqueness and drop the plain column. From here on the
-- app hands the plain token out once at creation time and looks up rows by
-- sha256(presented token) — same pattern the repo already used for
-- AdminRecoveryCode. A DB leak no longer exposes usable links.
--
-- Apply WITH the code deploy that reads/writes the *Hash columns: code older
-- than that deploy still references the dropped columns.

-- pgcrypto provides digest() for the backfill (already enabled in the local
-- stack and in the hosted project; IF NOT EXISTS keeps this idempotent).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Order ──────────────────────────────────────────────────────────────────────
ALTER TABLE "Order" ADD COLUMN "publicAccessTokenHash" TEXT;
UPDATE "Order"
SET "publicAccessTokenHash" = encode(digest("publicAccessToken", 'sha256'), 'hex')
WHERE "publicAccessToken" IS NOT NULL;
CREATE UNIQUE INDEX "Order_publicAccessTokenHash_key" ON "Order"("publicAccessTokenHash");
ALTER TABLE "Order" DROP COLUMN "publicAccessToken";

-- Quote ──────────────────────────────────────────────────────────────────────
-- Column is NOT NULL today (every Quote has a token) → the backfill covers all
-- rows and the hash column can go straight to NOT NULL.
ALTER TABLE "Quote" ADD COLUMN "publicAccessTokenHash" TEXT;
UPDATE "Quote"
SET "publicAccessTokenHash" = encode(digest("publicAccessToken", 'sha256'), 'hex');
ALTER TABLE "Quote" ALTER COLUMN "publicAccessTokenHash" SET NOT NULL;
CREATE UNIQUE INDEX "Quote_publicAccessTokenHash_key" ON "Quote"("publicAccessTokenHash");
ALTER TABLE "Quote" DROP COLUMN "publicAccessToken";

-- Design ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Design" ADD COLUMN "shareTokenHash" TEXT;
UPDATE "Design"
SET "shareTokenHash" = encode(digest("shareToken", 'sha256'), 'hex')
WHERE "shareToken" IS NOT NULL;
CREATE UNIQUE INDEX "Design_shareTokenHash_key" ON "Design"("shareTokenHash");
ALTER TABLE "Design" DROP COLUMN "shareToken";

-- AbandonedCart ──────────────────────────────────────────────────────────────
ALTER TABLE "AbandonedCart" ADD COLUMN "recoverTokenHash" TEXT;
UPDATE "AbandonedCart"
SET "recoverTokenHash" = encode(digest("recoverToken", 'sha256'), 'hex')
WHERE "recoverToken" IS NOT NULL;
CREATE UNIQUE INDEX "AbandonedCart_recoverTokenHash_key" ON "AbandonedCart"("recoverTokenHash");
ALTER TABLE "AbandonedCart" DROP COLUMN "recoverToken";
