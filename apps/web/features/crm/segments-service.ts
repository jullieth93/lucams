/*
 * Segmentación comercial CRM con gate duro Ley 1581 (`Fase 12 · S25`).
 *
 * Propósito:
 *   Construir audiencias accionables para campañas comerciales (Resend / email marketing)
 *   basadas en comportamiento real del grafo `Contact`:
 *     1. `vip` — Recurrentes VIP (>= 3 pedidos pagados).
 *     2. `gift_buyers` — Compradores de regalos (`Order.isGift = true` pagado).
 *     3. `winback_90d` — Reactivación (> 90 días desde la última compra pagada).
 *     4. `annual_occasion` — Ocasión anual (compra pagada hace 320–370 días).
 *     5. `high_intent_no_order` — Alta intención sin compra (carrito abandonado,
 *        cotización, oportunidad B2B, favoritos o alerta de stock, con 0 compras).
 *
 * Garantía no negociable de privacidad (Ley 1581 de 2012):
 *   - El ledger `Consent(scope = 'NEWSLETTER')` es append-only; una baja escribe una
 *     fila posterior con `accepted = false`.
 *   - Ningún contacto sin `primaryEmail` válido, borrado/anonimizado, sin opt-in
 *     explícito `NEWSLETTER` o con baja posterior aparece JAMÁS en `items` ni en el
 *     CSV exportable.
 *   - Para contactos que cumplen el criterio conductual pero NO tienen opt-in vigente,
 *     solo se computa el agregado `excludedNoOptInCount` (cero PII expuesta).
 */

import "server-only";
import { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";

export const CRM_SEGMENT_KEYS = [
  "vip",
  "gift_buyers",
  "winback_90d",
  "annual_occasion",
  "high_intent_no_order",
] as const;

export type CrmSegmentKey = (typeof CRM_SEGMENT_KEYS)[number];

export function isCrmSegmentKey(value: unknown): value is CrmSegmentKey {
  return typeof value === "string" && (CRM_SEGMENT_KEYS as readonly string[]).includes(value);
}

export type CrmSegmentDefinition = {
  key: CrmSegmentKey;
  label: string;
  shortLabel: string;
  description: string;
  recommendedPlaybook: string;
};

export const CRM_SEGMENT_DEFINITIONS: Record<CrmSegmentKey, CrmSegmentDefinition> = {
  vip: {
    key: "vip",
    label: "Recurrentes VIP (3+ compras)",
    shortLabel: "VIP 3+",
    description:
      "Clientes con 3 o más pedidos pagados acumulados en su historial unificado (invitado + cuenta).",
    recommendedPlaybook:
      "Acceso anticipado a colecciones de temporada, lanzamientos del Estudio o beneficio exclusivo de fidelidad.",
  },
  gift_buyers: {
    key: "gift_buyers",
    label: "Compradores de regalos",
    shortLabel: "Regalos",
    description:
      "Clientes que han enviado al menos un pedido pagado marcado como regalo para otra persona.",
    recommendedPlaybook:
      "Campañas previas a Día de la Madre, Amor y Amistad, grados y Navidad con empaque listo para regalar.",
  },
  winback_90d: {
    key: "winback_90d",
    label: "Reactivación (> 90 días sin comprar)",
    shortLabel: "Win-back 90d",
    description: "Compradores verificados cuya última orden pagada ocurrió hace más de 90 días.",
    recommendedPlaybook:
      "Recordatorio cálido con nuevos productos personalizables o incentivo acotado de regreso.",
  },
  annual_occasion: {
    key: "annual_occasion",
    label: "Ocasión anual (hace 11–12 meses)",
    shortLabel: "Ocasión anual",
    description:
      "Clientes que compraron hace 320 a 370 días (cumpleaños, aniversario o fecha especial próxima a repetirse).",
    recommendedPlaybook:
      "Mensaje oportuno tipo «Se acerca una fecha especial: renueva tus recuerdos en imán este año».",
  },
  high_intent_no_order: {
    key: "high_intent_no_order",
    label: "Alta intención sin compra",
    shortLabel: "Alta intención",
    description:
      "Contactos con 0 pedidos pagados pero con carrito abandonado, cotización, oportunidad B2B, favoritos o alerta de stock.",
    recommendedPlaybook:
      "Resolución de dudas sobre tiempos de producción, guía rápida del Estudio y prueba social verificada.",
  },
};

export type CrmSegmentSummaryCounter = {
  key: CrmSegmentKey;
  consentedCount: number;
  excludedNoOptInCount: number;
};

export type CrmSegmentMember = {
  contactId: string;
  email: string;
  displayName: string | null;
  paidOrdersCount: number;
  giftOrdersCount: number;
  lifetimePaidCopCents: number;
  lastPaidOrderAt: Date | null;
  lastUtmSource: string | null;
  intentSignals: string[];
  consentAcceptedAt: Date;
  consentVersion: string;
};

export type CrmSegmentListResult = {
  segment: CrmSegmentDefinition;
  counters: CrmSegmentSummaryCounter[];
  items: CrmSegmentMember[];
  total: number;
  excludedNoOptInCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const DEFAULT_PAGE_SIZE = 25;

/**
 * CTE base que calcula:
 *   1. Último estado de consentimiento `NEWSLETTER` por email normalizado.
 *   2. Métricas de compra e intención por `Contact` activo (no borrado ni anonimizado).
 */
const SEGMENT_BASE_CTE = Prisma.sql`
  WITH latest_newsletter AS (
    SELECT DISTINCT ON (LOWER("email"))
      LOWER("email") AS email,
      "accepted",
      "acceptedAt",
      "version"
    FROM "Consent"
    WHERE "scope" = 'NEWSLETTER'
      AND "email" IS NOT NULL
    ORDER BY LOWER("email"), "acceptedAt" DESC, "id" DESC
  ),
  paid_orders_agg AS (
    SELECT
      o."contactId" AS contact_id,
      COUNT(*)::int AS paid_orders_count,
      COUNT(*) FILTER (WHERE o."isGift" = true)::int AS gift_orders_count,
      COALESCE(SUM(o."total"), 0)::bigint AS lifetime_paid_cents,
      MAX(o."createdAt") AS last_paid_order_at,
      BOOL_OR(
        o."createdAt" BETWEEN (NOW() - INTERVAL '370 days') AND (NOW() - INTERVAL '320 days')
      ) AS has_annual_occasion_order,
      (
        ARRAY_REMOVE(ARRAY_AGG(o."utmSource" ORDER BY o."createdAt" DESC), NULL)
      )[1] AS last_utm_source
    FROM "Order" o
    WHERE o."contactId" IS NOT NULL
      AND o."deletedAt" IS NULL
      AND o."status" IN ('PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED')
    GROUP BY o."contactId"
  ),
  contact_signals AS (
    SELECT
      c."id" AS contact_id,
      LOWER(c."primaryEmail") AS email,
      c."displayName" AS display_name,
      COALESCE(po.paid_orders_count, 0)::int AS paid_orders_count,
      COALESCE(po.gift_orders_count, 0)::int AS gift_orders_count,
      COALESCE(po.lifetime_paid_cents, 0)::bigint AS lifetime_paid_cents,
      po.last_paid_order_at,
      COALESCE(po.has_annual_occasion_order, false) AS has_annual_occasion_order,
      po.last_utm_source,
      EXISTS (
        SELECT 1 FROM "AbandonedCart" ac
        WHERE ac."contactId" = c."id" AND ac."recoveredAt" IS NULL
      ) AS has_abandoned_cart,
      EXISTS (
        SELECT 1 FROM "Quote" q
        WHERE q."contactId" = c."id" AND q."deletedAt" IS NULL
      ) AS has_quote,
      EXISTS (
        SELECT 1 FROM "Opportunity" op
        WHERE op."contactId" = c."id" AND op."deletedAt" IS NULL
      ) AS has_opportunity,
      EXISTS (
        SELECT 1
        FROM "Customer" cu
        JOIN "WishlistItem" wi ON wi."customerId" = cu."id"
        WHERE cu."contactId" = c."id" AND cu."deletedAt" IS NULL
      ) AS has_wishlist,
      EXISTS (
        SELECT 1
        FROM "BackInStockSubscription" bis
        LEFT JOIN "Customer" cu ON cu."id" = bis."customerId"
        WHERE (
          (cu."contactId" = c."id" AND cu."deletedAt" IS NULL)
          OR LOWER(bis."email") = LOWER(c."primaryEmail")
        )
      ) AS has_back_in_stock,
      COALESCE(ln."accepted", false) AS newsletter_opted_in,
      ln."acceptedAt" AS consent_accepted_at,
      ln."version" AS consent_version
    FROM "Contact" c
    LEFT JOIN paid_orders_agg po ON po.contact_id = c."id"
    LEFT JOIN latest_newsletter ln ON ln.email = LOWER(c."primaryEmail")
    WHERE c."deletedAt" IS NULL
      AND c."anonymizedAt" IS NULL
      AND c."primaryEmail" IS NOT NULL
  )
`;

function segmentConditionSql(segmentKey: CrmSegmentKey): Prisma.Sql {
  switch (segmentKey) {
    case "vip":
      return Prisma.sql`paid_orders_count >= 3`;
    case "gift_buyers":
      return Prisma.sql`gift_orders_count >= 1`;
    case "winback_90d":
      return Prisma.sql`paid_orders_count >= 1 AND last_paid_order_at < (NOW() - INTERVAL '90 days')`;
    case "annual_occasion":
      return Prisma.sql`has_annual_occasion_order = true`;
    case "high_intent_no_order":
      return Prisma.sql`paid_orders_count = 0 AND (has_abandoned_cart OR has_quote OR has_opportunity OR has_wishlist OR has_back_in_stock)`;
  }
}

type RawSegmentMemberRow = {
  contact_id: string;
  email: string;
  display_name: string | null;
  paid_orders_count: number;
  gift_orders_count: number;
  lifetime_paid_cents: bigint | number;
  last_paid_order_at: Date | null;
  last_utm_source: string | null;
  has_abandoned_cart: boolean;
  has_quote: boolean;
  has_opportunity: boolean;
  has_wishlist: boolean;
  has_back_in_stock: boolean;
  consent_accepted_at: Date;
  consent_version: string;
};

function mapSegmentMemberRow(row: RawSegmentMemberRow): CrmSegmentMember {
  const intentSignals: string[] = [];
  if (row.paid_orders_count >= 3) intentSignals.push(`${row.paid_orders_count} compras pagadas`);
  else if (row.paid_orders_count > 0)
    intentSignals.push(
      `${row.paid_orders_count} ${row.paid_orders_count === 1 ? "compra" : "compras"}`,
    );
  if (row.gift_orders_count > 0)
    intentSignals.push(
      `${row.gift_orders_count} ${row.gift_orders_count === 1 ? "regalo" : "regalos"}`,
    );
  if (row.has_abandoned_cart) intentSignals.push("Carrito abandonado");
  if (row.has_quote) intentSignals.push("Cotización");
  if (row.has_opportunity) intentSignals.push("Oportunidad B2B");
  if (row.has_wishlist) intentSignals.push("Favoritos");
  if (row.has_back_in_stock) intentSignals.push("Alerta de stock");

  return {
    contactId: row.contact_id,
    email: row.email,
    displayName: row.display_name,
    paidOrdersCount: Number(row.paid_orders_count),
    giftOrdersCount: Number(row.gift_orders_count),
    lifetimePaidCopCents: Number(row.lifetime_paid_cents),
    lastPaidOrderAt: row.last_paid_order_at,
    lastUtmSource: row.last_utm_source,
    intentSignals,
    consentAcceptedAt: row.consent_accepted_at,
    consentVersion: row.consent_version,
  };
}

function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Consulta paginada de un segmento comercial + contadores globales de los 5 segmentos.
 * Solo devuelve filas con `newsletter_opted_in = true`.
 */
export async function listCrmSegmentMembers(opts: {
  segment?: CrmSegmentKey;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<CrmSegmentListResult> {
  const segmentKey: CrmSegmentKey = opts.segment ?? "vip";
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? DEFAULT_PAGE_SIZE));
  const q = opts.q?.trim().toLowerCase() ?? "";

  const searchFilter = q
    ? Prisma.sql`AND (
        email LIKE ${`%${escapeLikePattern(q)}%`} ESCAPE '\\'
        OR LOWER(COALESCE(display_name, '')) LIKE ${`%${escapeLikePattern(q)}%`} ESCAPE '\\'
      )`
    : Prisma.empty;

  const activeSegmentWhere = segmentConditionSql(segmentKey);

  type CounterSummaryRow = {
    vip_in: number;
    vip_out: number;
    gift_in: number;
    gift_out: number;
    winback_in: number;
    winback_out: number;
    annual_in: number;
    annual_out: number;
    intent_in: number;
    intent_out: number;
    filtered_consented_total: number;
  };

  const [counterRows, memberRows] = await Promise.all([
    prisma.$queryRaw<CounterSummaryRow[]>`
      ${SEGMENT_BASE_CTE}
      SELECT
        COUNT(*) FILTER (WHERE paid_orders_count >= 3 AND newsletter_opted_in = true)::int AS vip_in,
        COUNT(*) FILTER (WHERE paid_orders_count >= 3 AND newsletter_opted_in = false)::int AS vip_out,
        COUNT(*) FILTER (WHERE gift_orders_count >= 1 AND newsletter_opted_in = true)::int AS gift_in,
        COUNT(*) FILTER (WHERE gift_orders_count >= 1 AND newsletter_opted_in = false)::int AS gift_out,
        COUNT(*) FILTER (
          WHERE paid_orders_count >= 1
            AND last_paid_order_at < (NOW() - INTERVAL '90 days')
            AND newsletter_opted_in = true
        )::int AS winback_in,
        COUNT(*) FILTER (
          WHERE paid_orders_count >= 1
            AND last_paid_order_at < (NOW() - INTERVAL '90 days')
            AND newsletter_opted_in = false
        )::int AS winback_out,
        COUNT(*) FILTER (WHERE has_annual_occasion_order = true AND newsletter_opted_in = true)::int AS annual_in,
        COUNT(*) FILTER (WHERE has_annual_occasion_order = true AND newsletter_opted_in = false)::int AS annual_out,
        COUNT(*) FILTER (
          WHERE paid_orders_count = 0
            AND (has_abandoned_cart OR has_quote OR has_opportunity OR has_wishlist OR has_back_in_stock)
            AND newsletter_opted_in = true
        )::int AS intent_in,
        COUNT(*) FILTER (
          WHERE paid_orders_count = 0
            AND (has_abandoned_cart OR has_quote OR has_opportunity OR has_wishlist OR has_back_in_stock)
            AND newsletter_opted_in = false
        )::int AS intent_out,
        COUNT(*) FILTER (
          WHERE (${activeSegmentWhere})
            AND newsletter_opted_in = true
            ${searchFilter}
        )::int AS filtered_consented_total
      FROM contact_signals
    `,
    prisma.$queryRaw<RawSegmentMemberRow[]>`
      ${SEGMENT_BASE_CTE}
      SELECT
        contact_id,
        email,
        display_name,
        paid_orders_count,
        gift_orders_count,
        lifetime_paid_cents,
        last_paid_order_at,
        last_utm_source,
        has_abandoned_cart,
        has_quote,
        has_opportunity,
        has_wishlist,
        has_back_in_stock,
        consent_accepted_at,
        consent_version
      FROM contact_signals
      WHERE (${activeSegmentWhere})
        AND newsletter_opted_in = true
        ${searchFilter}
      ORDER BY lifetime_paid_cents DESC, last_paid_order_at DESC NULLS LAST, email ASC
      LIMIT ${pageSize}
      OFFSET ${(page - 1) * pageSize}
    `,
  ]);

  const c = counterRows[0];
  const counters: CrmSegmentSummaryCounter[] = [
    {
      key: "vip",
      consentedCount: Number(c?.vip_in ?? 0),
      excludedNoOptInCount: Number(c?.vip_out ?? 0),
    },
    {
      key: "gift_buyers",
      consentedCount: Number(c?.gift_in ?? 0),
      excludedNoOptInCount: Number(c?.gift_out ?? 0),
    },
    {
      key: "winback_90d",
      consentedCount: Number(c?.winback_in ?? 0),
      excludedNoOptInCount: Number(c?.winback_out ?? 0),
    },
    {
      key: "annual_occasion",
      consentedCount: Number(c?.annual_in ?? 0),
      excludedNoOptInCount: Number(c?.annual_out ?? 0),
    },
    {
      key: "high_intent_no_order",
      consentedCount: Number(c?.intent_in ?? 0),
      excludedNoOptInCount: Number(c?.intent_out ?? 0),
    },
  ];

  const activeCounter = counters.find((it) => it.key === segmentKey)!;
  const total = Number(c?.filtered_consented_total ?? 0);

  return {
    segment: CRM_SEGMENT_DEFINITIONS[segmentKey],
    counters,
    items: memberRows.map(mapSegmentMemberRow),
    total,
    excludedNoOptInCount: activeCounter.excludedNoOptInCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Devuelve todos los contactos exportables de un segmento (con `newsletter_opted_in = true`
 * verificado en SQL) para descarga CSV protegida por step-up MFA.
 */
export async function listAllConsentedSegmentMembersForExport(
  segmentKey: CrmSegmentKey,
): Promise<CrmSegmentMember[]> {
  const activeSegmentWhere = segmentConditionSql(segmentKey);
  const rows = await prisma.$queryRaw<RawSegmentMemberRow[]>`
    ${SEGMENT_BASE_CTE}
    SELECT
      contact_id,
      email,
      display_name,
      paid_orders_count,
      gift_orders_count,
      lifetime_paid_cents,
      last_paid_order_at,
      last_utm_source,
      has_abandoned_cart,
      has_quote,
      has_opportunity,
      has_wishlist,
      has_back_in_stock,
      consent_accepted_at,
      consent_version
    FROM contact_signals
    WHERE (${activeSegmentWhere})
      AND newsletter_opted_in = true
    ORDER BY lifetime_paid_cents DESC, last_paid_order_at DESC NULLS LAST, email ASC
  `;
  return rows.map(mapSegmentMemberRow);
}

/**
 * Neutraliza inyección de fórmulas en hojas de cálculo (`=`, `+`, `-`, `@`, `\t`, `\r`)
 * y escapa comillas/comas según RFC 4180.
 */
export function csvSafeCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const CSV_BOGOTA_DATE = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Bogota",
});

export function buildCrmSegmentCsv(items: CrmSegmentMember[], segmentKey: CrmSegmentKey): string {
  const header =
    "segmento,email,nombre,pedidos_pagados,ltv_cop,ultima_compra,canal_utm,senales,fecha_optin_newsletter,version_aviso";
  const lines = items.map((m) =>
    [
      csvSafeCell(segmentKey),
      csvSafeCell(m.email),
      csvSafeCell(m.displayName ?? ""),
      String(m.paidOrdersCount),
      String(Math.round(m.lifetimePaidCopCents / 100)),
      m.lastPaidOrderAt ? CSV_BOGOTA_DATE.format(m.lastPaidOrderAt) : "",
      csvSafeCell(m.lastUtmSource ?? ""),
      csvSafeCell(m.intentSignals.join(" · ")),
      CSV_BOGOTA_DATE.format(m.consentAcceptedAt),
      csvSafeCell(m.consentVersion),
    ].join(","),
  );
  return "\uFEFF" + [header, ...lines].join("\r\n") + "\r\n";
}
