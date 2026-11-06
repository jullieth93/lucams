UPDATE "LifecycleMessage"
SET "ctaUrl" = COALESCE("metadata"->>'targetPath', '/')
WHERE "ctaUrl" LIKE '%/j/%';

ALTER TABLE "LifecycleMessage" ADD COLUMN IF NOT EXISTS "convertedOrderId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LifecycleMessage_convertedOrderId_fkey') THEN
    ALTER TABLE "LifecycleMessage" ADD CONSTRAINT "LifecycleMessage_convertedOrderId_fkey"
      FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "LifecycleMessage_convertedOrderId_key" ON "LifecycleMessage"("convertedOrderId");
