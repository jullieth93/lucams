/*
 * Inteligencia conductual, retención RFM, margen neto y atribución asistida CRM (`Fase 12 · S27`).
 *
 * Propósito:
 *   Responder en `/admin/metricas` las preguntas de inteligencia comercial nativa de Lucams:
 *     1. ¿Dónde se quedaron los contactos identificables que no cerraron compra (diseños en
 *        borrador, carritos sin recuperar, órdenes sin pago y rechazos Wompi por medio de pago)?
 *     2. ¿Qué productos acumulan mayor intención latente (`WishlistItem` + `BackInStockSubscription`)
 *        cruzada contra inventario disponible real?
 *     3. ¿Cómo se distribuye nuestra base de compradores en niveles RFM (*Campeones*, *Leales*,
 *        *Nuevos prometedores*, *En riesgo > 90d*, *Inactivos > 180d*) y cuál es su margen neto estimado?
 *     4. ¿Qué canales UTM traen mejor LTV y margen neto real?
 *     5. ¿Cuánta venta fue asistida o recuperada gracias al CRM operativo (carritos recuperados,
 *        oportunidades B2B ganadas y pedidos pagados tras acompañamiento en soporte/CRM)?
 */

import "server-only";
import { prisma } from "@/lib/db";

export type RfmTierKey = "champions" | "loyal" | "promising_new" | "at_risk" | "hibernating";

export type RfmTierSummary = {
  key: RfmTierKey;
  label: string;
  description: string;
  contactsCount: number;
  ordersCount: number;
  grossRevenueCents: number;
  estimatedMarginCents: number;
  avgLtvCents: number;
};

export type DeclinedPaymentMethodStat = {
  paymentMethodType: string;
  failedTransactionsCount: number;
  affectedOrdersCount: number;
  failedAmountCents: number;
};

export type ProductIntentSignal = {
  productId: string;
  productName: string;
  productSlug: string;
  wishlistCount: number;
  pendingBackInStockCount: number;
  totalIntentScore: number;
  availableStock: number;
  stockAlert: "RESTOCK_READY_TO_NOTIFY" | "LOW_STOCK_HIGH_INTENT" | "OUT_OF_STOCK_DEMAND" | "OK";
};

export type UtmChannelPerformance = {
  channel: string;
  ordersCount: number;
  uniqueContactsCount: number;
  grossRevenueCents: number;
  avgOrderValueCents: number;
  estimatedMarginCents: number;
};

export type CrmBehavioralIntelligenceReport = {
  windowDays: number;
  dropOffs: {
    draftDesignsCount: number;
    unrecoveredCartsCount: number;
    unrecoveredCartsValueCents: number;
    unpaidPendingOrdersCount: number;
    declinedPaymentsByMethod: DeclinedPaymentMethodStat[];
  };
  intentSignals: ProductIntentSignal[];
  rfm: {
    tiers: RfmTierSummary[];
    totalPaidContacts: number;
    totalGrossRevenueCents: number;
    totalEstimatedMarginCents: number;
    productsWithCostConfiguredRatio: number;
  };
  channelAttribution: UtmChannelPerformance[];
  assistedRecovery: {
    recoveredCartsCount: number;
    recoveredCartsRevenueCents: number;
    wonOpportunitiesCount: number;
    wonOpportunitiesRevenueCents: number;
    crmTouchedOrdersCount: number;
    crmTouchedRevenueCents: number;
    consentedAnnualOccasionsCount: number;
  };
};

const RFM_META: Record<RfmTierKey, { label: string; description: string }> = {
  champions: {
    label: "Campeones",
    description: "3+ compras pagadas y última compra en los últimos 90 días.",
  },
  loyal: {
    label: "Leales",
    description: "2 compras pagadas y última compra en los últimos 90 días.",
  },
  promising_new: {
    label: "Nuevos prometedores",
    description: "1ª compra pagada reciente (últimos 90 días) lista para segunda recompra.",
  },
  at_risk: {
    label: "En riesgo (91–180 días)",
    description: "Compradores verificados que llevan entre 3 y 6 meses sin volver.",
  },
  hibernating: {
    label: "Inactivos (> 180 días)",
    description: "Compradores históricos con más de 6 meses sin compra reciente.",
  },
};

const RFM_ORDER: readonly RfmTierKey[] = [
  "champions",
  "loyal",
  "promising_new",
  "at_risk",
  "hibernating",
];

/**
 * Cuenta rápida de contactos con compra hace 320–370 días y opt-in `NEWSLETTER` activo
 * (usada tanto en `/admin/metricas` como en la señal proactiva de `/admin/hoy`).
 */
export async function countConsentedAnnualOccasionContacts(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ cnt: number }>>`
    WITH latest_newsletter AS (
      SELECT DISTINCT ON (LOWER("email"))
        LOWER("email") AS email,
        "accepted"
      FROM "Consent"
      WHERE "scope" = 'NEWSLETTER' AND "email" IS NOT NULL
      ORDER BY LOWER("email"), "acceptedAt" DESC, "id" DESC
    )
    SELECT COUNT(DISTINCT c."id")::int AS cnt
    FROM "Contact" c
    JOIN latest_newsletter ln ON ln.email = LOWER(c."primaryEmail") AND ln."accepted" = true
    JOIN "Order" o ON o."contactId" = c."id"
    WHERE c."deletedAt" IS NULL
      AND c."anonymizedAt" IS NULL
      AND o."deletedAt" IS NULL
      AND o."status" IN ('PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED')
      AND o."createdAt" BETWEEN (NOW() - INTERVAL '370 days') AND (NOW() - INTERVAL '320 days')
  `;
  return Number(rows[0]?.cnt ?? 0);
}

export async function getCrmBehavioralIntelligence(
  windowDays = 30,
): Promise<CrmBehavioralIntelligenceReport> {
  const safeDays = Math.min(365, Math.max(7, Math.floor(windowDays)));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

  type UnrecoveredCartAggRow = {
    carts_count: number;
    estimated_value_cents: bigint | number;
  };
  type DeclinedRow = {
    method_type: string;
    failed_tx_count: number;
    affected_orders_count: number;
    failed_amount_cents: bigint | number;
  };
  type IntentRow = {
    product_id: string;
    product_name: string;
    product_slug: string;
    wishlist_count: number;
    bis_count: number;
    available_stock: number;
  };
  type RfmRow = {
    tier: RfmTierKey;
    contacts_count: number;
    orders_count: number;
    gross_revenue_cents: bigint | number;
    estimated_margin_cents: bigint | number;
  };
  type ChannelRow = {
    channel: string;
    orders_count: number;
    unique_contacts_count: number;
    gross_revenue_cents: bigint | number;
    estimated_margin_cents: bigint | number;
  };
  type RecoveryAggRow = {
    recovered_carts_count: number;
    recovered_carts_revenue_cents: bigint | number;
    won_opp_count: number;
    won_opp_revenue_cents: bigint | number;
    crm_touched_orders_count: number;
    crm_touched_revenue_cents: bigint | number;
  };
  type CostCoverageRow = {
    active_products: number;
    with_cost: number;
  };

  const [
    draftDesignsCount,
    unpaidPendingOrdersCount,
    unrecoveredCartRows,
    declinedRows,
    intentRows,
    rfmRows,
    channelRows,
    recoveryRows,
    costCoverageRows,
    consentedAnnualOccasionsCount,
  ] = await Promise.all([
    prisma.design.count({
      where: { status: "DRAFT", createdAt: { gte: since } },
    }),
    prisma.order.count({
      where: {
        status: "PENDING_PAYMENT",
        deletedAt: null,
        createdAt: { gte: since },
      },
    }),
    prisma.$queryRaw<UnrecoveredCartAggRow[]>`
      SELECT
        COUNT(DISTINCT ac."id")::int AS carts_count,
        COALESCE(SUM(ci."qty" * COALESCE(pv."price", p."basePrice")), 0)::bigint AS estimated_value_cents
      FROM "AbandonedCart" ac
      LEFT JOIN "Cart" ca ON ca."id" = ac."cartId" AND ca."deletedAt" IS NULL
      LEFT JOIN "CartItem" ci ON ci."cartId" = ca."id"
      LEFT JOIN "ProductVariant" pv ON pv."id" = ci."variantId"
      LEFT JOIN "Product" p ON p."id" = pv."productId"
      WHERE ac."recoveredAt" IS NULL
        AND ac."createdAt" >= ${since}
    `,
    prisma.$queryRaw<DeclinedRow[]>`
      SELECT
        COALESCE(NULLIF(TRIM(wt."paymentMethodType"), ''), 'SIN_CLASIFICAR') AS method_type,
        COUNT(*)::int AS failed_tx_count,
        COUNT(DISTINCT wa."orderId")::int AS affected_orders_count,
        COALESCE(SUM(wt."amountInCents"), 0)::bigint AS failed_amount_cents
      FROM "WompiPaymentTransaction" wt
      JOIN "WompiPaymentAttempt" wa ON wa."id" = wt."attemptId"
      WHERE wt."status" IN ('DECLINED', 'ERROR')
        AND wt."firstSeenAt" >= ${since}
      GROUP BY 1
      ORDER BY failed_tx_count DESC, failed_amount_cents DESC
      LIMIT 8
    `,
    prisma.$queryRaw<IntentRow[]>`
      WITH wl AS (
        SELECT "productId", COUNT(*)::int AS cnt
        FROM "WishlistItem"
        GROUP BY "productId"
      ),
      bis AS (
        SELECT "productId", COUNT(*)::int AS cnt
        FROM "BackInStockSubscription"
        WHERE "notifiedAt" IS NULL
        GROUP BY "productId"
      ),
      stk AS (
        SELECT "productId", COALESCE(SUM("stock"), 0)::int AS available_stock
        FROM "ProductVariant"
        WHERE "isActive" = true AND "deletedAt" IS NULL
        GROUP BY "productId"
      )
      SELECT
        p."id" AS product_id,
        p."name" AS product_name,
        p."slug" AS product_slug,
        COALESCE(wl.cnt, 0)::int AS wishlist_count,
        COALESCE(bis.cnt, 0)::int AS bis_count,
        COALESCE(stk.available_stock, 0)::int AS available_stock
      FROM "Product" p
      LEFT JOIN wl ON wl."productId" = p."id"
      LEFT JOIN bis ON bis."productId" = p."id"
      LEFT JOIN stk ON stk."productId" = p."id"
      WHERE p."deletedAt" IS NULL
        AND (COALESCE(wl.cnt, 0) > 0 OR COALESCE(bis.cnt, 0) > 0)
      ORDER BY (COALESCE(wl.cnt, 0) + COALESCE(bis.cnt, 0) * 2) DESC, p."name" ASC
      LIMIT 8
    `,
    prisma.$queryRaw<RfmRow[]>`
      WITH order_cogs AS (
        SELECT
          oi."orderId" AS order_id,
          COALESCE(SUM(oi."qty" * COALESCE(p."cost", 0)), 0)::bigint AS cogs_cents
        FROM "OrderItem" oi
        JOIN "ProductVariant" pv ON pv."id" = oi."variantId"
        JOIN "Product" p ON p."id" = pv."productId"
        GROUP BY oi."orderId"
      ),
      paid_orders AS (
        SELECT
          o."id",
          o."contactId",
          o."total"::bigint AS total_cents,
          (o."total" - o."shipping" - COALESCE(oc.cogs_cents, 0))::bigint AS margin_cents,
          o."createdAt"
        FROM "Order" o
        LEFT JOIN order_cogs oc ON oc.order_id = o."id"
        WHERE o."contactId" IS NOT NULL
          AND o."deletedAt" IS NULL
          AND o."status" IN ('PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED')
      ),
      per_contact AS (
        SELECT
          c."id" AS contact_id,
          COUNT(po."id")::int AS orders_count,
          COALESCE(SUM(po.total_cents), 0)::bigint AS gross_revenue_cents,
          COALESCE(SUM(po.margin_cents), 0)::bigint AS estimated_margin_cents,
          EXTRACT(EPOCH FROM (NOW() - MAX(po."createdAt"))) / 86400.0 AS recency_days
        FROM "Contact" c
        JOIN paid_orders po ON po."contactId" = c."id"
        WHERE c."deletedAt" IS NULL
          AND c."anonymizedAt" IS NULL
        GROUP BY c."id"
      ),
      tiered AS (
        SELECT
          CASE
            WHEN orders_count >= 3 AND recency_days <= 90 THEN 'champions'
            WHEN orders_count = 2 AND recency_days <= 90 THEN 'loyal'
            WHEN orders_count = 1 AND recency_days <= 90 THEN 'promising_new'
            WHEN recency_days > 90 AND recency_days <= 180 THEN 'at_risk'
            ELSE 'hibernating'
          END AS tier,
          orders_count,
          gross_revenue_cents,
          estimated_margin_cents
        FROM per_contact
      )
      SELECT
        tier,
        COUNT(*)::int AS contacts_count,
        COALESCE(SUM(orders_count), 0)::int AS orders_count,
        COALESCE(SUM(gross_revenue_cents), 0)::bigint AS gross_revenue_cents,
        COALESCE(SUM(estimated_margin_cents), 0)::bigint AS estimated_margin_cents
      FROM tiered
      GROUP BY tier
    `,
    prisma.$queryRaw<ChannelRow[]>`
      WITH order_cogs AS (
        SELECT
          oi."orderId" AS order_id,
          COALESCE(SUM(oi."qty" * COALESCE(p."cost", 0)), 0)::bigint AS cogs_cents
        FROM "OrderItem" oi
        JOIN "ProductVariant" pv ON pv."id" = oi."variantId"
        JOIN "Product" p ON p."id" = pv."productId"
        GROUP BY oi."orderId"
      )
      SELECT
        COALESCE(NULLIF(LOWER(TRIM(o."utmSource")), ''), 'directo / orgánico') AS channel,
        COUNT(*)::int AS orders_count,
        COUNT(DISTINCT COALESCE(o."contactId", LOWER(o."email")))::int AS unique_contacts_count,
        COALESCE(SUM(o."total"), 0)::bigint AS gross_revenue_cents,
        COALESCE(SUM(o."total" - o."shipping" - COALESCE(oc.cogs_cents, 0)), 0)::bigint AS estimated_margin_cents
      FROM "Order" o
      LEFT JOIN order_cogs oc ON oc.order_id = o."id"
      WHERE o."deletedAt" IS NULL
        AND o."status" IN ('PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED')
        AND o."createdAt" >= ${since}
      GROUP BY 1
      ORDER BY gross_revenue_cents DESC, orders_count DESC
      LIMIT 8
    `,
    prisma.$queryRaw<RecoveryAggRow[]>`
      WITH rec_carts AS (
        SELECT
          COUNT(DISTINCT ac."id")::int AS cnt,
          COALESCE(SUM(o."total"), 0)::bigint AS rev
        FROM "AbandonedCart" ac
        LEFT JOIN "Order" o
          ON o."cartId" = ac."cartId"
          AND o."deletedAt" IS NULL
          AND o."status" IN ('PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED')
        WHERE ac."recoveredAt" IS NOT NULL
          AND ac."recoveredAt" >= ${since}
      ),
      won_opp AS (
        SELECT
          COUNT(*)::int AS cnt,
          COALESCE(SUM(COALESCE(co."total", op."expectedAmountCop", 0)), 0)::bigint AS rev
        FROM "Opportunity" op
        LEFT JOIN "Order" co ON co."id" = op."convertedOrderId" AND co."deletedAt" IS NULL
        WHERE op."stage" = 'WON'
          AND op."deletedAt" IS NULL
          AND op."updatedAt" >= ${since}
      ),
      crm_assisted AS (
        SELECT
          COUNT(DISTINCT o."id")::int AS cnt,
          COALESCE(SUM(o."total"), 0)::bigint AS rev
        FROM "Order" o
        WHERE o."deletedAt" IS NULL
          AND o."contactId" IS NOT NULL
          AND o."status" IN ('PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED')
          AND o."createdAt" >= ${since}
          AND (
            EXISTS (
              SELECT 1 FROM "ContactActivity" ca
              WHERE ca."contactId" = o."contactId"
                AND ca."createdAt" <= o."createdAt"
                AND ca."createdAt" >= (o."createdAt" - INTERVAL '14 days')
            )
            OR EXISTS (
              SELECT 1
              FROM "SupportTicket" st
              JOIN "SupportTicketMessage" stm ON stm."ticketId" = st."id"
              WHERE st."contactId" = o."contactId"
                AND stm."authorKind" = 'ADMIN'
                AND stm."isInternal" = false
                AND stm."createdAt" <= o."createdAt"
                AND stm."createdAt" >= (o."createdAt" - INTERVAL '14 days')
            )
          )
      )
      SELECT
        rec_carts.cnt AS recovered_carts_count,
        rec_carts.rev AS recovered_carts_revenue_cents,
        won_opp.cnt AS won_opp_count,
        won_opp.rev AS won_opp_revenue_cents,
        crm_assisted.cnt AS crm_touched_orders_count,
        crm_assisted.rev AS crm_touched_revenue_cents
      FROM rec_carts, won_opp, crm_assisted
    `,
    prisma.$queryRaw<CostCoverageRow[]>`
      SELECT
        COUNT(*)::int AS active_products,
        COUNT(*) FILTER (WHERE "cost" IS NOT NULL AND "cost" > 0)::int AS with_cost
      FROM "Product"
      WHERE "deletedAt" IS NULL
    `,
    countConsentedAnnualOccasionContacts(),
  ]);

  const unrec = unrecoveredCartRows[0];
  const rfmByKey = new Map<RfmTierKey, RfmRow>();
  for (const r of rfmRows) {
    rfmByKey.set(r.tier, r);
  }

  const tiers: RfmTierSummary[] = RFM_ORDER.map((key) => {
    const row = rfmByKey.get(key);
    const contactsCount = Number(row?.contacts_count ?? 0);
    const ordersCount = Number(row?.orders_count ?? 0);
    const grossRevenueCents = Number(row?.gross_revenue_cents ?? 0);
    const estimatedMarginCents = Number(row?.estimated_margin_cents ?? 0);
    return {
      key,
      label: RFM_META[key].label,
      description: RFM_META[key].description,
      contactsCount,
      ordersCount,
      grossRevenueCents,
      estimatedMarginCents,
      avgLtvCents: contactsCount > 0 ? Math.round(grossRevenueCents / contactsCount) : 0,
    };
  });

  const totalPaidContacts = tiers.reduce((acc, t) => acc + t.contactsCount, 0);
  const totalGrossRevenueCents = tiers.reduce((acc, t) => acc + t.grossRevenueCents, 0);
  const totalEstimatedMarginCents = tiers.reduce((acc, t) => acc + t.estimatedMarginCents, 0);

  const cov = costCoverageRows[0];
  const activeProductsCount = Number(cov?.active_products ?? 0);
  const withCostCount = Number(cov?.with_cost ?? 0);
  const productsWithCostConfiguredRatio =
    activeProductsCount > 0 ? withCostCount / activeProductsCount : 0;

  const rec = recoveryRows[0];

  return {
    windowDays: safeDays,
    dropOffs: {
      draftDesignsCount,
      unrecoveredCartsCount: Number(unrec?.carts_count ?? 0),
      unrecoveredCartsValueCents: Number(unrec?.estimated_value_cents ?? 0),
      unpaidPendingOrdersCount,
      declinedPaymentsByMethod: declinedRows.map((d) => ({
        paymentMethodType: d.method_type,
        failedTransactionsCount: Number(d.failed_tx_count),
        affectedOrdersCount: Number(d.affected_orders_count),
        failedAmountCents: Number(d.failed_amount_cents),
      })),
    },
    intentSignals: intentRows.map((r) => {
      const wishlistCount = Number(r.wishlist_count);
      const pendingBackInStockCount = Number(r.bis_count);
      const availableStock = Number(r.available_stock);
      let stockAlert: ProductIntentSignal["stockAlert"] = "OK";
      if (availableStock === 0 && (pendingBackInStockCount > 0 || wishlistCount > 0)) {
        stockAlert = "OUT_OF_STOCK_DEMAND";
      } else if (availableStock > 0 && pendingBackInStockCount > 0) {
        stockAlert = "RESTOCK_READY_TO_NOTIFY";
      } else if (availableStock <= 3 && wishlistCount > 0) {
        stockAlert = "LOW_STOCK_HIGH_INTENT";
      }
      return {
        productId: r.product_id,
        productName: r.product_name,
        productSlug: r.product_slug,
        wishlistCount,
        pendingBackInStockCount,
        totalIntentScore: wishlistCount + pendingBackInStockCount * 2,
        availableStock,
        stockAlert,
      };
    }),
    rfm: {
      tiers,
      totalPaidContacts,
      totalGrossRevenueCents,
      totalEstimatedMarginCents,
      productsWithCostConfiguredRatio,
    },
    channelAttribution: channelRows.map((ch) => {
      const ordersCount = Number(ch.orders_count);
      const grossRevenueCents = Number(ch.gross_revenue_cents);
      return {
        channel: ch.channel,
        ordersCount,
        uniqueContactsCount: Number(ch.unique_contacts_count),
        grossRevenueCents,
        avgOrderValueCents: ordersCount > 0 ? Math.round(grossRevenueCents / ordersCount) : 0,
        estimatedMarginCents: Number(ch.estimated_margin_cents),
      };
    }),
    assistedRecovery: {
      recoveredCartsCount: Number(rec?.recovered_carts_count ?? 0),
      recoveredCartsRevenueCents: Number(rec?.recovered_carts_revenue_cents ?? 0),
      wonOpportunitiesCount: Number(rec?.won_opp_count ?? 0),
      wonOpportunitiesRevenueCents: Number(rec?.won_opp_revenue_cents ?? 0),
      crmTouchedOrdersCount: Number(rec?.crm_touched_orders_count ?? 0),
      crmTouchedRevenueCents: Number(rec?.crm_touched_revenue_cents ?? 0),
      consentedAnnualOccasionsCount,
    },
  };
}
