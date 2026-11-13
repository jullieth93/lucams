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
  /**
   * Correos objetivo opcionales resueltos en memoria antes de borrar o mutar la entidad
   * (ej. `cod.blocklist.remove`), usados exclusivamente para evaluar `selfDealing` sin
   * persistir PII cruda en `AdminActionLog.metadata`.
   */
  targetEmails?: string[];
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
  "order.refund",
  "order.reconcile",
  "order.transition",
  "order.mark_no_show",
  "cod.blocklist.add_address",
  "cod.blocklist.add",
  "cod.blocklist.remove",
  "design.moderation.approve",
  "design.moderation.reject",
  "retract.approve",
  "retract.reject",
  "retract.receive",
  "retract.refund",
  "retract.assign",
  "warranty.review",
  "warranty.approve",
  "warranty.resolve",
  "warranty.reject",
  "warranty.assign",
  "support.status",
  "support.reply",
  "support.convert_case",
  "review.approve",
  "review.reject",
  "review.feature",
  "review.unfeature",
  "review.archive",
  "review.restore",
  "cod.mark_remitted",
  "cod.flag_discrepancy",
  "contact.merge",
  "contact.merge_reject",
  "contact.merge_reopen",
  "cart_recovery.reminder.send",
  "cart_recovery.reminder.bulk_send",
  "lifecycle.enrollment_pause",
  "lifecycle.enrollment_resume",
  "lifecycle.enrollment_exit",
  "lifecycle.message_retry",
]);

async function resolveTargetEmailsForAudit(entry: AdminAuditEntry): Promise<string[]> {
  switch (entry.entityType) {
    case "Order": {
      const row = await prisma.order.findUnique({
        where: { id: entry.entityId },
        select: { email: true },
      });
      return row?.email ? [row.email] : [];
    }
    case "RetractRequest": {
      const row = await prisma.retractRequest.findUnique({
        where: { id: entry.entityId },
        select: {
          contact: { select: { primaryEmail: true } },
          orderItem: { select: { order: { select: { email: true } } } },
        },
      });
      const email = row?.contact?.primaryEmail ?? row?.orderItem?.order?.email ?? null;
      return email ? [email] : [];
    }
    case "WarrantyClaim": {
      const row = await prisma.warrantyClaim.findUnique({
        where: { id: entry.entityId },
        select: {
          contact: { select: { primaryEmail: true } },
          orderItem: { select: { order: { select: { email: true } } } },
        },
      });
      const email = row?.contact?.primaryEmail ?? row?.orderItem?.order?.email ?? null;
      return email ? [email] : [];
    }
    case "Contact": {
      const row = await prisma.contact.findUnique({
        where: { id: entry.entityId },
        select: { primaryEmail: true },
      });
      return row?.primaryEmail ? [row.primaryEmail] : [];
    }
    case "IdentityMergeCandidate": {
      const row = await prisma.identityMergeCandidate.findUnique({
        where: { id: entry.entityId },
        select: {
          primaryContact: { select: { primaryEmail: true } },
          secondaryContact: { select: { primaryEmail: true } },
        },
      });
      return [row?.primaryContact?.primaryEmail, row?.secondaryContact?.primaryEmail].filter(
        (v): v is string => Boolean(v),
      );
    }
    case "Design": {
      const row = await prisma.design.findUnique({
        where: { id: entry.entityId },
        select: {
          customer: { select: { email: true } },
          orderItems: { select: { order: { select: { email: true } } } },
          quoteItems: { select: { quote: { select: { customerEmail: true } } } },
        },
      });
      return [
        row?.customer?.email,
        ...(row?.orderItems.map((oi) => oi.order.email) ?? []),
        ...(row?.quoteItems.map((qi) => qi.quote.customerEmail) ?? []),
      ].filter((v): v is string => Boolean(v));
    }
    case "SupportTicket": {
      const row = await prisma.supportTicket.findUnique({
        where: { id: entry.entityId },
        select: {
          email: true,
          contact: { select: { primaryEmail: true } },
        },
      });
      return [row?.email, row?.contact?.primaryEmail].filter((v): v is string => Boolean(v));
    }
    case "Review": {
      const row = await prisma.review.findUnique({
        where: { id: entry.entityId },
        select: {
          createdBy: true,
          customer: { select: { email: true } },
        },
      });
      const emails: string[] = [];
      if (row?.customer?.email) emails.push(row.customer.email);
      if (row?.createdBy?.startsWith("review-token:")) {
        const orderNumber = row.createdBy.slice("review-token:".length).trim();
        if (orderNumber) {
          const order = await prisma.order.findUnique({
            where: { number: orderNumber },
            select: { email: true },
          });
          if (order?.email) emails.push(order.email);
        }
      }
      return emails;
    }
    case "BlockedIdentity": {
      const row = await prisma.blockedIdentity.findUnique({
        where: { id: entry.entityId },
        select: { kind: true, value: true },
      });
      return row?.kind === "EMAIL" && row.value ? [row.value] : [];
    }
    case "AbandonedCart": {
      const ids = entry.entityId
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (ids.length === 0) return [];
      const rows = await prisma.abandonedCart.findMany({
        where: { id: { in: ids } },
        select: { email: true },
      });
      return rows.map((r) => r.email).filter((v): v is string => Boolean(v));
    }
    case "LifecycleEnrollment": {
      const row = await prisma.lifecycleEnrollment.findUnique({
        where: { id: entry.entityId },
        select: { contact: { select: { primaryEmail: true } } },
      });
      return row?.contact?.primaryEmail ? [row.contact.primaryEmail] : [];
    }
    case "LifecycleMessage": {
      const row = await prisma.lifecycleMessage.findUnique({
        where: { id: entry.entityId },
        select: {
          metadata: true,
          contact: { select: { primaryEmail: true } },
        },
      });
      const meta =
        row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null;
      const metaEmail =
        typeof meta?.toEmail === "string"
          ? meta.toEmail
          : typeof meta?.recipientEmail === "string"
            ? meta.recipientEmail
            : null;
      return [metaEmail, row?.contact?.primaryEmail].filter((v): v is string => Boolean(v));
    }
    default:
      return [];
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
        const [actor, resolvedTargetEmails] = await Promise.all([
          prisma.adminUser.findUnique({
            where: { id: entry.actorId },
            select: { email: true },
          }),
          resolveTargetEmailsForAudit(entry),
        ]);
        const targetEmails = [...(entry.targetEmails ?? []), ...resolvedTargetEmails];
        const normalizedActorEmail = actor?.email?.trim().toLowerCase();
        if (
          normalizedActorEmail &&
          targetEmails.some((e) => e.trim().toLowerCase() === normalizedActorEmail)
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
