ALTER TABLE "Design" ADD COLUMN "archivedFrom" "DesignStatus";

UPDATE "Design"
SET "archivedFrom" = 'USED_IN_ORDER'
WHERE "status" = 'ARCHIVED'
  AND EXISTS (
    SELECT 1
    FROM "OrderItem" AS "oi"
    WHERE "oi"."designId" = "Design"."id"
  );

UPDATE "Design"
SET "archivedFrom" = 'READY'
WHERE "status" = 'ARCHIVED'
  AND "archivedFrom" IS NULL;
