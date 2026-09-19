-- 2026-09-18 — EmailTemplateOverride: textos clave de las plantillas
-- transaccionales editables desde /admin/email-templates (Fase 4, feedback
-- Lucy 2026-09-18). Antes solo el asunto/preheader del newsletter welcome se
-- podía editar (bloques CMS email.welcome.*); el resto del copy transaccional
-- exigía tocar código. Acá se guarda SOLO el override (templateId + key) — el
-- copy base sigue en features/emails/templates y es el fallback si la fila no
-- existe. Escrita a mano (migrate dev no puede levantar shadow DB en Supabase
-- por la extensión pg_trgm de una migración vieja). Aplicar con
-- `make migrate`. RLS deny-by-default en
-- supabase/migrations/00000000000034_rls_email_template_overrides.sql.

-- CreateTable
CREATE TABLE "EmailTemplateOverride" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "EmailTemplateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplateOverride_templateId_key_key" ON "EmailTemplateOverride"("templateId", "key");
