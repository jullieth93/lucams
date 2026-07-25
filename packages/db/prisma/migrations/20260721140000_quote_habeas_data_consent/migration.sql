-- Prueba de la autorización de tratamiento de datos en la cotización (Ley 1581 art. 9).
-- Auditoría 2026-07-21 (hallazgo A1): el formulario de cotización es el ÚNICO flujo que recolecta
-- PII en modo catálogo y lo hacía sin capturar ni conservar la autorización del titular.
--
-- Escrita A MANO a propósito: `prisma migrate diff` arrastra drift preexistente ajeno a este cambio
-- (índices pg_trgm y de PersonalizationTemplate creados por SQL crudo, tabla rate_limit_buckets),
-- y aplicarlo tal cual DROPearía objetos vivos de producción.
--
-- Todo es aditivo y nullable → sin reescritura de tabla ni impacto en filas existentes.

-- Anclaje por teléfono para titulares sin email: la cotización pide WhatsApp y deja el email
-- opcional, así que sin esto la autorización de un invitado quedaría imposible de localizar ante
-- una solicitud de habeas data hecha por WhatsApp.
ALTER TABLE "Consent" ADD COLUMN "phone" TEXT;

CREATE INDEX "Consent_phone_scope_idx" ON "Consent"("phone", "scope");

-- Prueba sobre el propio registro que materializa la PII: cuándo autorizó y qué versión del aviso
-- de privacidad vio. Nullable porque las cotizaciones anteriores a la casilla no la tienen.
ALTER TABLE "Quote" ADD COLUMN "dataConsentAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "dataConsentVersion" TEXT;
