-- Decisión de negocio 2026-07-29: la logística es Aveonline; Venndelo sale del código,
-- del schema y de los docs. Verificado ANTES de migrar: 0 WebhookEvent con source VENNDELO
-- y 0 Order con venndeloShipmentId no-nulo → el DROP no pierde datos.
-- Escrita a mano porque `migrate dev` no puede levantar la shadow DB en este entorno
-- (P3006: pg_trgm ausente en la shadow de una migración vieja); se aplica con `migrate deploy`.

-- AlterEnum (patrón estándar Prisma para quitar un valor de enum)
BEGIN;
CREATE TYPE "WebhookSource_new" AS ENUM ('WOMPI', 'RESEND', 'AVEONLINE');
ALTER TABLE "WebhookEvent" ALTER COLUMN "source" TYPE "WebhookSource_new" USING ("source"::text::"WebhookSource_new");
ALTER TYPE "WebhookSource" RENAME TO "WebhookSource_old";
ALTER TYPE "WebhookSource_new" RENAME TO "WebhookSource";
DROP TYPE "WebhookSource_old";
COMMIT;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "venndeloShipmentId";
