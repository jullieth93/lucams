-- 2026-11-04 · Flag `Contact.isStaff` — separación persona-equipo (guardrails staff=cliente).
-- Contexto: un miembro del equipo (AdminUser) también puede comprar como cliente con el mismo
-- correo (dogfooding legítimo — la compra real LCM-2026-0004 destapó el bug de zona horaria).
-- NO se prohíbe; se GOBIERNA: la marca permite (a) excluir al equipo de la inteligencia
-- comercial (segmentos Ley 1581, RFM, LTV) para no contaminar decisiones con compras internas,
-- y (b) auditar con flag `selfDealing` las acciones admin sobre pedidos del propio actor.
-- Columna anulable-aditiva (default false): cero bloqueo, 100 % retrocompatible.
-- La tabla Contact ya tiene RLS deny-by-default (migración 051) — no requiere SQL espejo nuevo.

ALTER TABLE "public"."Contact"
  ADD COLUMN IF NOT EXISTS "isStaff" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Contact_isStaff_idx"
  ON "public"."Contact"("isStaff")
  WHERE "isStaff" = true;
