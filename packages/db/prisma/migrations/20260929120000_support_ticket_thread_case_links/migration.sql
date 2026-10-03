-- Flujo de solución real para soporte (owner 2026-09-29):
--
--   1. `SupportTicket.orderNumber` — pedido relacionado (Order.number, string
--      "LCM-2026-0001"; NO Int: los números de pedido del negocio llevan prefijo
--      de año). Lo pide el form de /contacto cuando el asunto es de pedido.
--   2. `linkedCaseType`/`linkedCaseId` — enlace al caso especializado
--      (WarrantyClaim o RetractRequest) creado desde /admin/soporte: un ticket
--      GARANTIA_DEVOLUCION entra a la máquina de estados del módulo legal.
--   3. `SupportTicketMessage` — hilo del ticket: respuestas del admin al cliente
--      (visibles en /mi-cuenta/soporte + enviadas por correo) y notas internas
--      (isInternal = true, nunca visibles ni enviadas).
--
-- Aditiva y reversible (DROP TABLE / DROP COLUMN), sin backfill ni locks largos
-- (columnas nullable sin default = metadata-only; tabla nueva vacía). Escrita a
-- mano y aplicada con `migrate deploy` — `migrate dev` no funciona contra esta
-- DB (shadow DB en Supabase, convención del repo). La RLS de la tabla nueva vive
-- en supabase/migrations/00000000000040_rls_support_ticket_message.sql (el RLS
-- es no-Prisma en este repo; el event trigger enforce_rls_on_new_table de la 014
-- ya la auto-habilita y esa migración lo deja explícito con verificación inline).

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN "orderNumber" TEXT,
ADD COLUMN "linkedCaseType" TEXT,
ADD COLUMN "linkedCaseId" TEXT;

-- CreateTable
CREATE TABLE "SupportTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorKind" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportTicket_orderNumber_idx" ON "SupportTicket"("orderNumber");
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
