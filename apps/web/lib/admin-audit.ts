/*
 * Audit trail para acciones administrativas.
 *
 * Patrón: cada server action de admin que mute estado (create/update/
 * archive/delete sobre Product, Category, Order, Customer, AdminUser,
 * Review moderation, etc.) registra una fila en `AdminActionLog` con:
 *   - actorId      → AdminUser.id que ejecutó la acción
 *   - action       → string corto en formato `<entidad>.<verbo>` (ej.
 *                    "product.create", "order.refund")
 *   - entityType   → "Product", "Category", "Order"...
 *   - entityId     → id del row afectado
 *   - metadata     → JSON con payload sanitized (sin secrets ni PII más
 *                    allá de lo estrictamente necesario)
 *   - ip / ua      → contexto del request
 *
 * Visible en /admin/auditoria (sub-bloque F). Sirve para postmortem si
 * pasa algo raro: quién hizo qué, cuándo, con qué payload.
 *
 * Uso:
 *
 *   await recordAdminAction({
 *     actorId: session.admin.id,
 *     action: "product.create",
 *     entityType: "Product",
 *     entityId: product.id,
 *     metadata: { slug: product.slug, sku: product.sku },
 *   });
 *
 * No bloquea la acción principal — si falla, loggea pero no propaga.
 * El audit es importante pero no debe romper UX si la DB tiene problemas.
 */

import "server-only";
import { headers } from "next/headers";
import { prisma, type Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/client-ip";

export type AdminAuditEntry = {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

/**
 * Guardrail staff=cliente (2026-11-04) — segregación de funciones: si el actor actúa
 * sobre un registro asociado a SU PROPIO correo (ej. aprobar el reembolso del pedido
 * que él mismo hizo como cliente), la entrada queda marcada `selfDealing: true` y se
 * registra un warn forense. NO bloquea (equipo pequeño: a veces la auto-gestión es
 * inevitable), pero la evidencia queda explícita en /admin/auditoria.
 * Best-effort y fail-open: un error de resolución jamás rompe ni la acción ni el audit.
 */
const SELF_DEALING_SENSITIVE_ACTIONS = new Set([
  "retract.approve",
  "retract.reject",
  "retract.receive",
  "retract.refund",
  "warranty.review",
  "warranty.approve",
  "warranty.resolve",
  "warranty.reject",
  "cod.mark_remitted",
  "cod.flag_discrepancy",
  "contact.merge",
  "contact.merge_reject",
]);

async function resolveTargetEmailForAudit(entry: AdminAuditEntry): Promise<string | null> {
  switch (entry.entityType) {
    case "Order": {
      const row = await prisma.order.findUnique({
        where: { id: entry.entityId },
        select: { email: true },
      });
      return row?.email ?? null;
    }
    case "RetractRequest": {
      const row = await prisma.retractRequest.findUnique({
        where: { id: entry.entityId },
        select: {
          contact: { select: { primaryEmail: true } },
          orderItem: { select: { order: { select: { email: true } } } },
        },
      });
      return row?.contact?.primaryEmail ?? row?.orderItem?.order?.email ?? null;
    }
    case "WarrantyClaim": {
      const row = await prisma.warrantyClaim.findUnique({
        where: { id: entry.entityId },
        select: {
          contact: { select: { primaryEmail: true } },
          orderItem: { select: { order: { select: { email: true } } } },
        },
      });
      return row?.contact?.primaryEmail ?? row?.orderItem?.order?.email ?? null;
    }
    case "Contact": {
      const row = await prisma.contact.findUnique({
        where: { id: entry.entityId },
        select: { primaryEmail: true },
      });
      return row?.primaryEmail ?? null;
    }
    case "IdentityMergeCandidate": {
      const row = await prisma.identityMergeCandidate.findUnique({
        where: { id: entry.entityId },
        select: { primaryContact: { select: { primaryEmail: true } } },
      });
      return row?.primaryContact?.primaryEmail ?? null;
    }
    default:
      return null;
  }
}

export async function recordAdminAction(entry: AdminAuditEntry): Promise<void> {
  try {
    const hdrs = await headers();
    // getClientIp prefiere x-vercel-forwarded-for (no spoofeable) — el IP es rastro forense
    // del audit trail, no puede depender de un header falsificable por el cliente (ADR-062 P1).
    const ip = getClientIp(hdrs);
    const userAgent = hdrs.get("user-agent") ?? null;

    let metadata: Record<string, unknown> = entry.metadata ?? {};
    if (SELF_DEALING_SENSITIVE_ACTIONS.has(entry.action)) {
      try {
        const [actor, targetEmail] = await Promise.all([
          prisma.adminUser.findUnique({
            where: { id: entry.actorId },
            select: { email: true },
          }),
          resolveTargetEmailForAudit(entry),
        ]);
        if (
          actor?.email &&
          targetEmail &&
          actor.email.trim().toLowerCase() === targetEmail.trim().toLowerCase()
        ) {
          metadata = { ...metadata, selfDealing: true };
          logger.warn({
            event: "admin.audit.self_dealing",
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId,
            actorId: entry.actorId,
          });
        }
      } catch {
        // fail-open: la resolución del flag nunca rompe el registro de auditoría
      }
    }

    await prisma.adminActionLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: metadata as Prisma.InputJsonValue,
        ip,
        userAgent,
      },
    });
  } catch (err) {
    logger.warn(
      {
        event: "admin.audit.persist_fail",
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        err: err instanceof Error ? err.message : String(err),
      },
      "Failed to persist admin audit entry",
    );
  }
}
