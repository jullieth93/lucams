-- Consentimiento por-subida de derechos de imagen (Ley 1581 + plan de producción).
-- Evidencia por-asset de que quien sube declaró tener derecho a usar la foto y
-- autorizó su impresión. Nullable → los assets previos quedan sin sellar (el gate de
-- moderación manual, ya existente, sigue cubriendo la reimpresión).
-- AlterTable
ALTER TABLE "DesignAsset" ADD COLUMN     "rightsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "rightsPolicyVersion" TEXT;
