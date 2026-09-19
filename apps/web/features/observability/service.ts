/*
 * Servicio del panel de salud técnica (Bloque D). Agrega las señales de salud
 * del sistema desde las fuentes en DB (ErrorLog, WebhookEvent, Order, InventoryLog,
 * WebVital) para /admin/observability. Sin dependencias externas.
 */

import "server-only";
import { prisma } from "@/lib/db";

const since = (hours: number) => new Date(Date.now() - hours * 3600 * 1000);

export type TechHealth = {
  errors: {
    last24h: number;
    last7d: number;
    top: Array<{ message: string; routePath: string | null; count: number; lastAt: Date }>;
  };
  clientErrors: {
    openCount: number;
    top: Array<{
      id: string;
      message: string;
      url: string | null;
      count: number;
      lastSeenAt: Date;
    }>;
  };
  webhooks: { total7d: number; processed7d: number; pending: number };
  reconciliation: { count: number; orders: Array<{ number: string; reason: string | null }> };
  stockReverts7d: number;
  vitals7d: { good: number; needsImprovement: number; poor: number };
};

export async function getTechHealth(): Promise<TechHealth> {
  const [
    errors24h,
    errors7d,
    topErrorsRaw,
    webhookTotal7d,
    webhookProcessed7d,
    webhookPending,
    reconCount,
    reconOrders,
    stockReverts7d,
    vitalsRaw,
    clientErrorsOpen,
    clientErrorsTop,
  ] = await Promise.all([
    prisma.errorLog.count({ where: { createdAt: { gte: since(24) } } }),
    prisma.errorLog.count({ where: { createdAt: { gte: since(24 * 7) } } }),
    prisma.errorLog.groupBy({
      by: ["message", "routePath"],
      where: { createdAt: { gte: since(24 * 7) } },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _count: { message: "desc" } },
      take: 10,
    }),
    prisma.webhookEvent.count({ where: { createdAt: { gte: since(24 * 7) } } }),
    prisma.webhookEvent.count({
      where: { createdAt: { gte: since(24 * 7) }, processedAt: { not: null } },
    }),
    prisma.webhookEvent.count({ where: { processedAt: null } }),
    prisma.order.count({ where: { needsReconciliation: true, deletedAt: null } }),
    prisma.order.findMany({
      where: { needsReconciliation: true, deletedAt: null },
      select: { number: true, reconciliationReason: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.inventoryLog.count({
      where: {
        createdAt: { gte: since(24 * 7) },
        reason: { in: ["ORDER_CANCELLED", "ORDER_REFUNDED"] },
      },
    }),
    prisma.webVital.groupBy({
      by: ["rating"],
      where: { createdAt: { gte: since(24 * 7) } },
      _count: { _all: true },
    }),
    prisma.errorReport.count({ where: { status: "OPEN" } }),
    prisma.errorReport.findMany({
      where: { status: "OPEN" },
      orderBy: { lastSeenAt: "desc" },
      take: 10,
      select: { id: true, message: true, url: true, count: true, lastSeenAt: true },
    }),
  ]);

  const ratingCount = (r: string) => vitalsRaw.find((v) => v.rating === r)?._count._all ?? 0;

  return {
    errors: {
      last24h: errors24h,
      last7d: errors7d,
      top: topErrorsRaw.map((e) => ({
        message: e.message,
        routePath: e.routePath,
        count: e._count._all,
        lastAt: e._max.createdAt ?? new Date(0),
      })),
    },
    clientErrors: {
      openCount: clientErrorsOpen,
      top: clientErrorsTop,
    },
    webhooks: {
      total7d: webhookTotal7d,
      processed7d: webhookProcessed7d,
      pending: webhookPending,
    },
    reconciliation: {
      count: reconCount,
      orders: reconOrders.map((o) => ({ number: o.number, reason: o.reconciliationReason })),
    },
    stockReverts7d,
    vitals7d: {
      good: ratingCount("good"),
      needsImprovement: ratingCount("needs-improvement"),
      poor: ratingCount("poor"),
    },
  };
}

export type ErrorReportStatus = "OPEN" | "RESOLVED" | "IGNORED";
/**
 * Cambia el estado de triage de un ErrorReport (OPEN/RESOLVED/IGNORED).
 * Al resolver/ignorar sella `resolvedAt` + `resolvedBy`; al reabrir los limpia.
 */
export async function setErrorReportStatus(id: string, status: ErrorReportStatus, adminId: string) {
  return prisma.errorReport.update({
    where: { id },
    data: {
      status,
      resolvedAt: status === "OPEN" ? null : new Date(),
      resolvedBy: status === "OPEN" ? null : adminId,
    },
  });
}

// ─────────────────── Cuota de Supabase Storage (Fase 3D) ───────────────────

/**
 * Consumo estimado de Supabase Storage por bucket, para el tile de cuota de
 * /admin/observability. SOLO datos de la DB (la Management API de Supabase
 * exige un token que la app no tiene en runtime — feedback Lucy 2026-09-18:
 * número honesto o "N archivos", nunca inventado).
 *
 * Bytes REALES solo donde el schema los guarda:
 *   - customer-uploads → DesignAsset.sizeBytes (privado, fotos del cliente)
 *   - cms-media        → CmsMedia.bytes (público, mediateca)
 * Los demás buckets no persisten bytes por objeto → se reportan como conteo
 * de archivos (design-previews ← Design.previewUrl; production-assets ←
 * Design.productionUrl + productionUrls; product-images ← Product.images +
 * ProductVariant.images de filas vivas). El TOTAL es por tanto un PISO
 * (lower bound), no el consumo exacto del plan.
 */
export type StorageBucketUsage = {
  bucket: string;
  /** Bytes reales sumados desde DB; null = el bucket no guarda tamaños. */
  bytes: number | null;
  files: number;
  /** De dónde sale el número (para la nota del tile). */
  source: string;
};

export type StorageQuota = {
  buckets: StorageBucketUsage[];
  /** Suma de los buckets con bytes reales (piso del consumo total). */
  measuredBytes: number;
};

export async function getStorageQuota(): Promise<StorageQuota> {
  const [cmsMediaAgg, uploadsAgg, previewsCount, productionRows, productImageRows] =
    await Promise.all([
      prisma.cmsMedia.aggregate({ _sum: { bytes: true }, _count: { _all: true } }),
      prisma.designAsset.aggregate({ _sum: { sizeBytes: true }, _count: { _all: true } }),
      prisma.design.count({ where: { previewUrl: { not: null } } }),
      // production-assets: legacy productionUrl (1 PNG) + productionUrls[] (V2,
      // un PNG por imán). cardinality() suma los arrays sin traerlos al cliente.
      prisma.$queryRaw<Array<{ files: bigint }>>`
        SELECT (
          COUNT(*) FILTER (WHERE "productionUrl" IS NOT NULL)
          + COALESCE(SUM(cardinality("productionUrls")), 0)
        )::bigint AS files
        FROM "Design"
      `,
      // product-images: URLs en Product.images + ProductVariant.images (solo
      // filas vivas; las de archivados quedan fuera del número a propósito).
      prisma.$queryRaw<Array<{ files: bigint }>>`
        SELECT (
          (SELECT COALESCE(SUM(cardinality("images")), 0) FROM "Product" WHERE "deletedAt" IS NULL)
          + (SELECT COALESCE(SUM(cardinality("images")), 0) FROM "ProductVariant" WHERE "deletedAt" IS NULL)
        )::bigint AS files
      `,
    ]);

  const buckets: StorageBucketUsage[] = [
    {
      bucket: "customer-uploads",
      bytes: uploadsAgg._sum.sizeBytes ?? 0,
      files: uploadsAgg._count._all,
      source: "DesignAsset.sizeBytes",
    },
    {
      bucket: "cms-media",
      bytes: cmsMediaAgg._sum.bytes ?? 0,
      files: cmsMediaAgg._count._all,
      source: "CmsMedia.bytes",
    },
    {
      bucket: "design-previews",
      bytes: null,
      files: previewsCount,
      source: "Design.previewUrl (sin bytes guardados)",
    },
    {
      bucket: "production-assets",
      bytes: null,
      files: Number(productionRows[0]?.files ?? 0),
      source: "Design.productionUrl + productionUrls (sin bytes guardados)",
    },
    {
      bucket: "product-images",
      bytes: null,
      files: Number(productImageRows[0]?.files ?? 0),
      source: "Product.images + ProductVariant.images (sin bytes guardados)",
    },
  ];

  return {
    buckets,
    measuredBytes: buckets.reduce((acc, b) => acc + (b.bytes ?? 0), 0),
  };
}
