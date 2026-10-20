ALTER TABLE "Design" ADD COLUMN "clientRev" BIGINT NOT NULL DEFAULT 0;

UPDATE "Design"
SET "clientRev" = ("canvasData" ->> 'clientRev')::bigint
WHERE "canvasData" ? 'clientRev'
  AND "canvasData" ->> 'clientRev' ~ '^[0-9]+$';
