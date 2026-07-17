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

export async function recordAdminAction(entry: AdminAuditEntry): Promise<void> {
  try {
    const hdrs = await headers();
    // getClientIp prefiere x-vercel-forwarded-for (no spoofeable) — el IP es rastro forense
    // del audit trail, no puede depender de un header falsificable por el cliente (ADR-062 P1).
    const ip = getClientIp(hdrs);
    const userAgent = hdrs.get("user-agent") ?? null;
    await prisma.adminActionLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
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
