import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { getSettingValue } from "@/lib/cms";
import { resolveConsentContact } from "@/features/identity/resolution-service";
import { getSiteUrl } from "@/features/emails/layout";
import { renderBackInStockEmail } from "@/features/emails/registry";
import {
  buildCommercialEmailHeaders,
  encodeUnsubscribeParam,
} from "@/features/newsletter/unsubscribe";
import { netAvailableStock } from "@/features/products/fulfillment";

/*
 * "Avísame cuando vuelva" (palanca de ingreso, auditoría 2026-07-13). Suscripción por email a un
 * producto AGOTADO; el cron notifica al reponerse el stock. Funciona para anónimos y logueados.
 */

export async function subscribeBackInStock(
  productId: string,
  email: string,
  customerId: string | null,
  meta?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<{ ok: boolean; reason?: "not_found" | "in_stock" }> {
  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true, publishedOnStorefront: true, deletedAt: null },
    select: {
      id: true,
      fulfillmentMode: true,
      variants: {
        where: { deletedAt: null, isActive: true },
        select: { stock: true, safetyStock: true },
      },
    },
  });
  if (!product) return { ok: false, reason: "not_found" };
  // Solo tiene sentido suscribirse a algo AGOTADO (disponible neto = 0 en todas las variantes activas).
  if (
    product.fulfillmentMode === "MADE_TO_ORDER" ||
    product.variants.some((v) => netAvailableStock(v.stock, v.safetyStock) > 0)
  ) {
    return { ok: false, reason: "in_stock" };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const prev = await prisma.backInStockSubscription.findUnique({
    where: { productId_email: { productId, email: normalizedEmail } },
    select: { notifiedAt: true },
  });
  await prisma.backInStockSubscription.upsert({
    where: { productId_email: { productId, email: normalizedEmail } },
    create: { productId, email: normalizedEmail, customerId },
    update: {
      notifiedAt: null,
      customerId,
      // Si ya fue notificado antes y se resuscribe, abre un nuevo ciclo (turno FIFO nuevo y
      // distinto Idempotency-Key en Resend aunque el nuevo aviso ocurra dentro de 24 h).
      ...(prev?.notifiedAt ? { createdAt: new Date() } : {}),
    },
  });

  // #9 — registrar la base de legitimación (Ley 1581). Es una notificación TRANSACCIONAL pedida por
  // el titular, así que basta consentimiento informado (aviso en UI). Idempotente por versión.
  const version = await getSettingValue("PRIVACY_POLICY_VERSION", "v1 · 2026-09-29");
  const existing = await prisma.consent.findFirst({
    where: { email: normalizedEmail, scope: "BACK_IN_STOCK", accepted: true, version },
    orderBy: { acceptedAt: "desc" },
  });
  if (!existing) {
    const contactId = await resolveConsentContact(prisma, {
      customerId,
      email: normalizedEmail,
      emailVerified: Boolean(customerId),
      verificationSource: "BACK_IN_STOCK",
    });
    await prisma.consent.create({
      data: {
        email: normalizedEmail,
        scope: "BACK_IN_STOCK",
        accepted: true,
        version,
        customerId,
        ...(contactId ? { contactId } : {}),
        ipAddress: meta?.ipAddress ?? null,
        userAgent: meta?.userAgent ?? null,
      },
    });
  }
  return { ok: true };
}

export async function sendBackInStockNotifications(
  now: Date = new Date(),
): Promise<{ sent: number; considered: number }> {
  // Filtrar primero en SQL los productos PHYSICAL_STOCK con disponible neto (stock - safetyStock) > 0
  // para que el límite take: 200 no se consuma con productos que siguen agotados por safetyStock.
  const availableProducts = await prisma.$queryRaw<Array<{ productId: string }>>`
    SELECT DISTINCT pv."productId"
    FROM "ProductVariant" pv
    JOIN "Product" p ON p."id" = pv."productId"
    WHERE pv."deletedAt" IS NULL
      AND pv."isActive" = true
      AND (pv."stock" - GREATEST(pv."safetyStock", 0)) > 0
      AND p."isActive" = true
      AND p."publishedOnStorefront" = true
      AND p."deletedAt" IS NULL
      AND p."fulfillmentMode" = 'PHYSICAL_STOCK'
  `;
  if (availableProducts.length === 0) {
    return { sent: 0, considered: 0 };
  }

  // Suscripciones aún NO notificadas de productos que AHORA tienen disponible neto > 0.
  const subs = await prisma.backInStockSubscription.findMany({
    where: {
      notifiedAt: null,
      productId: { in: availableProducts.map((row) => row.productId) },
    },
    orderBy: { createdAt: "asc" }, // FIFO: primero los que llevan más esperando
    take: 200,
    select: {
      id: true,
      email: true,
      createdAt: true,
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          variants: {
            where: { deletedAt: null, isActive: true },
            select: { stock: true, safetyStock: true },
          },
        },
      },
    },
  });

  // #13 — topar los avisos por producto al disponible neto REALMENTE vendible (FIFO). Si Lucy repone 2
  // unidades netas y hay 50 suscriptores, avisamos solo a los 2 primeros; el resto queda notifiedAt=null
  // para una reposición futura → nadie llega a una PDP agotada por un aviso "¡volvió!".
  const byProduct = new Map<string, typeof subs>();
  for (const s of subs) {
    const list = byProduct.get(s.product.id) ?? [];
    list.push(s);
    byProduct.set(s.product.id, list);
  }
  const eligible: typeof subs = [];
  for (const list of byProduct.values()) {
    const available = list[0].product.variants.reduce(
      (a, v) => a + netAvailableStock(v.stock, v.safetyStock),
      0,
    );
    eligible.push(...list.slice(0, Math.max(0, available)));
  }

  // Correo comercial: aunque es one-shot (solicitado por el titular), Gmail/Yahoo exigen a
  // remitentes masivos List-Unsubscribe One-Click (RFC 8058) y refuerza el art. 8 lit. e) de la
  // Ley 1581 (revocación). Header + enlace visible, igual que cart-recovery/review-request.
  const siteUrl = await getSiteUrl();
  let sent = 0;
  for (const s of eligible) {
    try {
      const unsubscribeUrl = `${siteUrl}/unsubscribe?u=${encodeUnsubscribeParam(s.email)}`;
      const tpl = await renderBackInStockEmail({
        productName: s.product.name,
        productSlug: s.product.slug,
        unsubscribeUrl,
      });
      const result = await sendEmail({
        to: s.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        idempotencyKey: `back-in-stock-${s.id}-${s.createdAt.getTime()}`,
        commercial: true,
        headers: buildCommercialEmailHeaders(s.email, siteUrl),
        tags: [{ name: "type", value: "back_in_stock" }],
      });
      // #18 — breaker abierto (skipped:'circuit-open') = fallo transitorio: NO marcar (aviso one-shot)
      // y cortar el batch; el marcado-sin-envío queda solo para el stub de dev ('no-api-key').
      if (!result.sent && result.skipped && result.reason === "circuit-open") break;
      if (result.sent || result.skipped) {
        await prisma.backInStockSubscription.update({
          where: { id: s.id },
          data: { notifiedAt: now },
        });
        if (result.sent) sent++;
      }
    } catch (err) {
      logger.error({
        event: "back_in_stock.fail",
        subId: s.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  logger.info({
    event: "back_in_stock.batch",
    considered: subs.length,
    notified: eligible.length,
    sent,
  });
  return { sent, considered: subs.length };
}
