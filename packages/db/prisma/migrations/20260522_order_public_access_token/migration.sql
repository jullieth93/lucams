-- Public access token: guest checkout puede ver su pedido via /pedido/<token>
-- sin login. Lucy 2026-05-22.
ALTER TABLE "Order" ADD COLUMN "publicAccessToken" TEXT;
CREATE UNIQUE INDEX "Order_publicAccessToken_key" ON "Order"("publicAccessToken");
