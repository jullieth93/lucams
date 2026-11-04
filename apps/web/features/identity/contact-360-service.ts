/*
 * Contacto 360 Service (`Fase 9 · S19`, ADR-193).
 *
 * Unifica en el directorio `/admin/clientes` y en la ficha `/admin/clientes/[id]`
 * tanto a clientes registrados (`Customer`) como a compradores invitados,
 * cotizaciones WhatsApp, tickets de soporte, carritos abandonados y suscriptores
 * a través de la entidad canónica `Contact`.
 *
 * Garantías de seguridad (cero suposiciones):
 *  - Búsqueda anti-oráculo: si el rol carece de `contacts:read_pii`, el texto `q`
 *    jamás filtra por email, teléfono, nombre personal ni documento tributario.
 *  - Enmascaramiento determinista en servidor: antes de entregar datos al RSC,
 *    toda PII se enmascara si `!hasCapability(actorRole, "contacts:read_pii")`.
 *  - Ley 1581: estado comercial (`marketingOptIn`) calculado por el ÚLTIMO evento
 *    `Consent(scope = NEWSLETTER)` sin revocación posterior.
 */

import "server-only";
import { Prisma, type AdminRole } from "@lucams/db";
import { prisma } from "@/lib/db";
import { hasCapability } from "@/lib/admin-rbac";
import {
  maskDocumentNumber,
  maskEmail,
  maskPersonName,
  maskPhone,
  maskTaxDocument,
} from "@/lib/pii-mask";

const PAGE_SIZE = 20;

export const PAID_ORDER_STATUSES = ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] as const;

export type ContactSegmentFilter =
  "all" | "registered" | "guest" | "paid" | "vip" | "open-care" | "marketing-optin";

export type ContactSortOption = "recent" | "ltv" | "orders" | "name";

export interface ContactListOpts {
  q?: string;
  segment?: ContactSegmentFilter;
  sort?: ContactSortOption;
  page?: number;
  pageSize?: number;
}

export interface ContactDirectoryItem {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  primaryPhoneE164: string | null;
  documentLabel: string | null;
  source: string;
  hasCustomerAccount: boolean;
  customerId: string | null;
  organizationName: string | null;
  paidOrdersCount: number;
  netLtvCents: number;
  openCareCount: number;
  loyaltyPoints: number;
  marketingOptIn: boolean;
  lastActivityAt: Date;
  createdAt: Date;
}

export interface ContactDirectoryResult {
  items: ContactDirectoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  pendingMergesCount: number;
  piiMasked: boolean;
}

function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function isContactSegmentFilter(val: string | undefined): val is ContactSegmentFilter {
  return (
    val === "all" ||
    val === "registered" ||
    val === "guest" ||
    val === "paid" ||
    val === "vip" ||
    val === "open-care" ||
    val === "marketing-optin"
  );
}

export function isContactSortOption(val: string | undefined): val is ContactSortOption {
  return val === "recent" || val === "ltv" || val === "orders" || val === "name";
}

/**
 * Resuelve un parámetro `:id` de `/admin/clientes/[id]`:
 *  - Si corresponde a un `Contact.id` activo, retorna `{ kind: "contact", contactId }`.
 *  - Si corresponde a un `Customer.id` legacy (bookmarks antiguos o links previos),
 *    retorna `{ kind: "redirect", contactId }` (creando el `Contact` 1:1 si una
 *    fixture de test creó `Customer` directo sin pasar por signup).
 *  - Si no existe, retorna `{ kind: "not_found" }`.
 */
export async function resolveContactRouteParam(
  id: string,
): Promise<
  | { kind: "contact"; contactId: string }
  | { kind: "redirect"; contactId: string }
  | { kind: "not_found" }
> {
  const cleanId = id.trim();
  if (!cleanId) return { kind: "not_found" };

  const contact = await prisma.contact.findFirst({
    where: { id: cleanId, deletedAt: null },
    select: { id: true },
  });
  if (contact) return { kind: "contact", contactId: contact.id };

  const legacyCustomer = await prisma.customer.findFirst({
    where: { id: cleanId, deletedAt: null },
    select: {
      id: true,
      contactId: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      documentType: true,
      documentNumber: true,
    },
  });
  if (!legacyCustomer) return { kind: "not_found" };

  if (legacyCustomer.contactId) {
    return { kind: "redirect", contactId: legacyCustomer.contactId };
  }

  // Auto-heal defensivo si algún registro puntual aún no tenía `contactId`
  const displayName =
    [legacyCustomer.firstName, legacyCustomer.lastName].filter(Boolean).join(" ").trim() || null;
  const created = await prisma.$transaction(async (tx) => {
    const normalizedEmail = legacyCustomer.email.trim().toLowerCase();
    const existingByEmail = await tx.contact.findFirst({
      where: { primaryEmail: normalizedEmail, deletedAt: null },
      select: { id: true },
    });
    const targetId = existingByEmail
      ? existingByEmail.id
      : (
          await tx.contact.create({
            data: {
              primaryEmail: normalizedEmail,
              displayName,
              documentType: legacyCustomer.documentType,
              documentNumber: legacyCustomer.documentNumber,
              source: "CUSTOMER_AUTH",
            },
            select: { id: true },
          })
        ).id;
    await tx.customer.update({
      where: { id: legacyCustomer.id },
      data: { contactId: targetId },
    });
    return targetId;
  });

  return { kind: "redirect", contactId: created };
}

/**
 * Directorio paginado de `Contact` con métricas SQL reales (LTV neto, órdenes
 * pagadas, casos abiertos de posventa y opt-in comercial Ley 1581).
 */
export async function listContactsForActor(
  opts: ContactListOpts,
  actorRole: AdminRole,
): Promise<ContactDirectoryResult> {
  const canReadPii = hasCapability(actorRole, "contacts:read_pii");
  const canSeeMerges = hasCapability(actorRole, "contacts:merge");
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const segment: ContactSegmentFilter = opts.segment ?? "all";
  const sort: ContactSortOption = opts.sort ?? "recent";
  const q = opts.q?.trim();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

  const sqlConditions: Prisma.Sql[] = [Prisma.sql`ct."deletedAt" IS NULL`];

  for (const token of tokens) {
    const pattern = `%${escapeLikePattern(token)}%`;
    if (canReadPii) {
      sqlConditions.push(
        Prisma.sql`(
          ct."id" ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(ct."displayName", '') ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(ct."primaryEmail", '') ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(ct."primaryPhoneE164", '') LIKE ${pattern} ESCAPE '\\'
          OR COALESCE(ct."documentNumber", '') LIKE ${pattern} ESCAPE '\\'
          OR COALESCE(cu."firstName", '') ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(cu."lastName", '') ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(org."name", '') ILIKE ${pattern} ESCAPE '\\'
        )`,
      );
    } else {
      // Anti-oráculo PII: sin `contacts:read_pii` solo busca por ID u organización
      sqlConditions.push(
        Prisma.sql`(
          ct."id" ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(org."name", '') ILIKE ${pattern} ESCAPE '\\'
        )`,
      );
    }
  }

  switch (segment) {
    case "registered":
      sqlConditions.push(Prisma.sql`cu."id" IS NOT NULL`);
      break;
    case "guest":
      sqlConditions.push(Prisma.sql`cu."id" IS NULL`);
      break;
    case "paid":
      sqlConditions.push(Prisma.sql`COALESCE(ord.paid_orders, 0) >= 1`);
      break;
    case "vip":
      sqlConditions.push(Prisma.sql`COALESCE(ord.paid_orders, 0) >= 3`);
      break;
    case "open-care":
      sqlConditions.push(Prisma.sql`COALESCE(care.open_count, 0) > 0`);
      break;
    case "marketing-optin":
      sqlConditions.push(Prisma.sql`COALESCE(mkt.active_optin, FALSE) = TRUE`);
      break;
    case "all":
    default:
      break;
  }

  const orderClause = (() => {
    switch (sort) {
      case "ltv":
        return Prisma.sql`COALESCE(ord.net_ltv_cents, 0) DESC, ct."updatedAt" DESC, ct."id" ASC`;
      case "orders":
        return Prisma.sql`COALESCE(ord.paid_orders, 0) DESC, COALESCE(ord.net_ltv_cents, 0) DESC, ct."id" ASC`;
      case "name":
        return Prisma.sql`LOWER(COALESCE(NULLIF(ct."displayName", ''), cu."firstName", ct."primaryEmail", ct."id")) ASC, ct."id" ASC`;
      case "recent":
      default:
        return Prisma.sql`GREATEST(ct."updatedAt", COALESCE(ord.last_order_at, ct."createdAt")) DESC, ct."id" ASC`;
    }
  })();

  const baseCte = Prisma.sql`
    WITH ord AS (
      SELECT
        o."contactId",
        COUNT(*)::int AS paid_orders,
        COALESCE(SUM(o."total"), 0)::bigint AS gross_spent_cents,
        GREATEST(
          0,
          COALESCE(SUM(o."total"), 0)::bigint - COALESCE(SUM(rr.retract_cents), 0)::bigint
        )::bigint AS net_ltv_cents,
        MAX(o."createdAt") AS last_order_at
      FROM "Order" o
      LEFT JOIN (
        SELECT
          oi."orderId",
          COALESCE(SUM(r."refundAmount"), 0)::bigint AS retract_cents
        FROM "OrderItem" oi
        INNER JOIN "RetractRequest" r
          ON r."orderItemId" = oi."id"
         AND r."status" = 'REFUNDED'
        GROUP BY oi."orderId"
      ) rr ON rr."orderId" = o."id"
      WHERE o."deletedAt" IS NULL
        AND o."contactId" IS NOT NULL
        AND o."status"::text IN ('PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED')
      GROUP BY o."contactId"
    ),
    care AS (
      SELECT "contactId", SUM(cnt)::int AS open_count
      FROM (
        SELECT "contactId", COUNT(*)::int AS cnt
        FROM "SupportTicket"
        WHERE "contactId" IS NOT NULL AND "status" IN ('OPEN', 'IN_PROGRESS')
        GROUP BY "contactId"
        UNION ALL
        SELECT "contactId", COUNT(*)::int AS cnt
        FROM "WarrantyClaim"
        WHERE "contactId" IS NOT NULL AND "status"::text IN ('PENDING', 'IN_REVIEW', 'APPROVED')
        GROUP BY "contactId"
        UNION ALL
        SELECT "contactId", COUNT(*)::int AS cnt
        FROM "RetractRequest"
        WHERE "contactId" IS NOT NULL AND "status"::text IN ('PENDING', 'APPROVED', 'RECEIVED')
        GROUP BY "contactId"
      ) open_cases
      GROUP BY "contactId"
    ),
    mkt AS (
      SELECT DISTINCT ON ("contactId")
        "contactId",
        ("accepted" = TRUE AND NOT EXISTS (
          SELECT 1 FROM "Consent" rev WHERE rev."revokesId" = c_in."id"
        )) AS active_optin
      FROM "Consent" c_in
      WHERE "contactId" IS NOT NULL
        AND "scope" = 'NEWSLETTER'
      ORDER BY "contactId", "acceptedAt" DESC, "id" DESC
    )
  `;

  type RowShape = {
    id: string;
    displayName: string | null;
    primaryEmail: string | null;
    primaryPhoneE164: string | null;
    documentType: string | null;
    documentNumber: string | null;
    source: string;
    createdAt: Date;
    updatedAt: Date;
    customerId: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
    loyaltyPoints: number | null;
    organizationName: string | null;
    paidOrders: number;
    netLtvCents: bigint;
    lastOrderAt: Date | null;
    openCareCount: number;
    marketingOptIn: boolean;
  };

  const [rows, countRows, pendingMergesCount] = await Promise.all([
    prisma.$queryRaw<RowShape[]>`
      ${baseCte}
      SELECT
        ct."id",
        ct."displayName",
        ct."primaryEmail",
        ct."primaryPhoneE164",
        ct."documentType"::text AS "documentType",
        ct."documentNumber",
        ct."source",
        ct."createdAt",
        ct."updatedAt",
        cu."id" AS "customerId",
        cu."firstName" AS "customerFirstName",
        cu."lastName" AS "customerLastName",
        cu."loyaltyPoints" AS "loyaltyPoints",
        org."name" AS "organizationName",
        COALESCE(ord.paid_orders, 0)::int AS "paidOrders",
        COALESCE(ord.net_ltv_cents, 0)::bigint AS "netLtvCents",
        ord.last_order_at AS "lastOrderAt",
        COALESCE(care.open_count, 0)::int AS "openCareCount",
        COALESCE(mkt.active_optin, FALSE) AS "marketingOptIn"
      FROM "Contact" ct
      LEFT JOIN "Customer" cu ON cu."contactId" = ct."id" AND cu."deletedAt" IS NULL
      LEFT JOIN "Organization" org ON org."id" = ct."organizationId" AND org."deletedAt" IS NULL
      LEFT JOIN ord ON ord."contactId" = ct."id"
      LEFT JOIN care ON care."contactId" = ct."id"
      LEFT JOIN mkt ON mkt."contactId" = ct."id"
      WHERE ${Prisma.join(sqlConditions, " AND ")}
      ORDER BY ${orderClause}
      LIMIT ${pageSize}
      OFFSET ${(page - 1) * pageSize}
    `,
    prisma.$queryRaw<Array<{ total: number }>>`
      ${baseCte}
      SELECT COUNT(*)::int AS total
      FROM "Contact" ct
      LEFT JOIN "Customer" cu ON cu."contactId" = ct."id" AND cu."deletedAt" IS NULL
      LEFT JOIN "Organization" org ON org."id" = ct."organizationId" AND org."deletedAt" IS NULL
      LEFT JOIN ord ON ord."contactId" = ct."id"
      LEFT JOIN care ON care."contactId" = ct."id"
      LEFT JOIN mkt ON mkt."contactId" = ct."id"
      WHERE ${Prisma.join(sqlConditions, " AND ")}
    `,
    canSeeMerges
      ? prisma.identityMergeCandidate.count({ where: { status: "PENDING" } })
      : Promise.resolve(0),
  ]);

  const total = Number(countRows[0]?.total ?? 0);

  const items: ContactDirectoryItem[] = rows.map((r) => {
    const rawName =
      r.displayName?.trim() ||
      [r.customerFirstName, r.customerLastName].filter(Boolean).join(" ").trim() ||
      r.primaryEmail ||
      "Contacto sin nombre";
    const lastActivityAt =
      r.lastOrderAt && r.lastOrderAt > r.updatedAt ? r.lastOrderAt : r.updatedAt;

    return {
      id: r.id,
      displayName: canReadPii ? rawName : maskPersonName(rawName),
      primaryEmail: canReadPii ? r.primaryEmail : r.primaryEmail ? maskEmail(r.primaryEmail) : null,
      primaryPhoneE164: canReadPii
        ? r.primaryPhoneE164
        : r.primaryPhoneE164
          ? maskPhone(r.primaryPhoneE164)
          : null,
      documentLabel: canReadPii
        ? r.documentType && r.documentNumber
          ? `${r.documentType} ${r.documentNumber}`
          : null
        : maskTaxDocument(r.documentType, r.documentNumber),
      source: r.source,
      hasCustomerAccount: Boolean(r.customerId),
      customerId: r.customerId,
      organizationName: r.organizationName,
      paidOrdersCount: Number(r.paidOrders),
      netLtvCents: Number(r.netLtvCents),
      openCareCount: Number(r.openCareCount),
      loyaltyPoints: Number(r.loyaltyPoints ?? 0),
      marketingOptIn: Boolean(r.marketingOptIn),
      lastActivityAt,
      createdAt: r.createdAt,
    };
  });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    pendingMergesCount,
    piiMasked: !canReadPii,
  };
}

export interface ContactDropOffSignal {
  stage: "PAYMENT_DECLINED" | "CART_ABANDONED" | "STUDIO_DRAFT";
  title: string;
  detail: string;
  occurredAt: Date;
  actionHref?: string;
  actionLabel?: string;
}

export interface Contact360Data {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  primaryPhoneE164: string | null;
  waPhoneRaw: string | null;
  documentLabel: string | null;
  taxResponsibility: string | null;
  source: string;
  anonymizedAt: Date | null;
  createdAt: Date;
  piiMasked: boolean;
  organization: {
    id: string;
    name: string;
    taxLabel: string | null;
    city: string | null;
    department: string | null;
  } | null;
  ownerAdminEmail: string | null;
  customer: {
    id: string;
    referralCode: string;
    loyaltyPoints: number;
    createdAt: Date;
  } | null;
  kpis: {
    paidOrdersCount: number;
    grossPaidCents: number;
    retractRefundedCents: number;
    netLtvCents: number;
    aovCents: number;
    openCareCount: number;
    marketingOptIn: boolean;
    marketingOptInAt: Date | null;
    codRiskLevel: "CLEAN" | "WATCH" | "BLOCKED";
    codRiskReason: string;
  };
  dropOffSignals: ContactDropOffSignal[];
  intentSignals: {
    wishlist: Array<{ id: string; productName: string; productSlug: string; createdAt: Date }>;
    backInStock: Array<{
      id: string;
      productName: string;
      productSlug: string;
      notifiedAt: Date | null;
      createdAt: Date;
    }>;
  };
  orders: Array<{
    id: string;
    number: string;
    status: string;
    paymentMethod: string;
    totalCents: number;
    isGift: boolean;
    createdAt: Date;
  }>;
  quotes: Array<{
    id: string;
    number: string;
    status: string;
    totalCents: number;
    city: string;
    department: string;
    createdAt: Date;
  }>;
  designs: Array<{
    id: string;
    productName: string;
    productSlug: string;
    status: string;
    moderationStatus: string;
    qualityAcknowledgedAt: Date | null;
    updatedAt: Date;
  }>;
  abandonedCarts: Array<{
    id: string;
    reminderCount: number;
    lastReminderSentAt: Date | null;
    recoveredAt: Date | null;
    createdAt: Date;
  }>;
  aftersales: Array<{
    kind: "TICKET" | "WARRANTY" | "RETRACT";
    id: string;
    title: string;
    status: string;
    orderNumber: string | null;
    href: string;
    createdAt: Date;
  }>;
  reviews: Array<{
    id: string;
    productName: string;
    productSlug: string;
    rating: number;
    comment: string;
    isApproved: boolean;
    createdAt: Date;
  }>;
  referrals: Array<{
    id: string;
    referredEmail: string;
    status: string;
    createdAt: Date;
    rewardedAt: Date | null;
  }>;
  personalCoupons: Array<{
    id: string;
    code: string;
    type: string;
    value: number;
    usedCount: number;
    isActive: boolean;
    validTo: Date;
  }>;
  consents: Array<{
    id: string;
    scope: string;
    accepted: boolean;
    version: string;
    isRevoked: boolean;
    acceptedAt: Date;
  }>;
  addresses: Array<{
    id: string;
    name: string;
    line1: string;
    line2: string | null;
    city: string;
    department: string;
    phone: string;
  }>;
  identities: Array<{
    id: string;
    type: string;
    valueDisplay: string;
    verificationStatus: string;
    verificationSource: string | null;
    verifiedAt: Date | null;
    lastSeenAt: Date;
  }>;
  pendingMergesCount: number;
}

/**
 * Carga la ficha integral `Contacto 360` aplicando enmascaramiento determinista
 * de PII en servidor según las capacidades del rol actor.
 */
export async function getContact360ForActor(
  contactId: string,
  actorRole: AdminRole,
): Promise<Contact360Data | null> {
  const canReadPii = hasCapability(actorRole, "contacts:read_pii");

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, deletedAt: null },
    include: {
      organization: true,
      ownerAdmin: { select: { id: true, email: true } },
      customer: {
        include: {
          addresses: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20 },
          reviews: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 30,
            include: { product: { select: { name: true, slug: true } } },
          },
          designs: {
            orderBy: { updatedAt: "desc" },
            take: 30,
            include: { product: { select: { name: true, slug: true } } },
          },
          wishlist: {
            orderBy: { createdAt: "desc" },
            take: 20,
            include: { product: { select: { name: true, slug: true } } },
          },
          backInStockSubs: {
            orderBy: { createdAt: "desc" },
            take: 20,
            include: { product: { select: { name: true, slug: true } } },
          },
          personalCoupons: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      },
      identities: {
        orderBy: [{ verificationStatus: "asc" }, { lastSeenAt: "desc" }],
      },
      orders: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          wompiAttempts: {
            orderBy: { sequence: "desc" },
            take: 1,
            include: {
              transactions: {
                orderBy: { lastSeenAt: "desc" },
                take: 1,
              },
            },
          },
          items: {
            select: {
              retractRequest: {
                select: { status: true, refundAmount: true },
              },
            },
          },
        },
      },
      quotes: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 25,
      },
      abandonedCarts: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      supportTickets: {
        orderBy: { createdAt: "desc" },
        take: 30,
      },
      warrantyClaims: {
        orderBy: { requestedAt: "desc" },
        take: 30,
        include: { orderItem: { select: { order: { select: { number: true } } } } },
      },
      retractRequests: {
        orderBy: { requestedAt: "desc" },
        take: 30,
        include: { orderItem: { select: { order: { select: { number: true } } } } },
      },
      consents: {
        orderBy: { acceptedAt: "desc" },
        take: 40,
        include: { revokedBy: { select: { id: true } } },
      },
    },
  });

  if (!contact) return null;

  const blockLookupOr: Prisma.BlockedIdentityWhereInput[] = [];
  if (contact.primaryEmail) {
    blockLookupOr.push({ kind: "EMAIL", value: contact.primaryEmail.toLowerCase() });
  }
  if (contact.primaryPhoneE164) {
    blockLookupOr.push({ kind: "PHONE", value: contact.primaryPhoneE164 });
    const localDigits = contact.primaryPhoneE164.replace(/^\+57/, "");
    if (localDigits !== contact.primaryPhoneE164) {
      blockLookupOr.push({ kind: "PHONE", value: localDigits });
    }
  }

  const [referralRows, guestBackInStock, blockedEntries, pendingMergesCount] = await Promise.all([
    contact.customer
      ? prisma.referral.findMany({
          where: { referrerId: contact.customer.id },
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      : Promise.resolve([]),
    !contact.customer && contact.primaryEmail
      ? prisma.backInStockSubscription.findMany({
          where: { email: contact.primaryEmail },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { product: { select: { name: true, slug: true } } },
        })
      : Promise.resolve([]),
    blockLookupOr.length > 0
      ? prisma.blockedIdentity.findMany({ where: { OR: blockLookupOr }, take: 5 })
      : Promise.resolve([]),
    prisma.identityMergeCandidate.count({
      where: {
        status: "PENDING",
        OR: [{ primaryContactId: contact.id }, { secondaryContactId: contact.id }],
      },
    }),
  ]);

  // Métricas financieras reales sobre órdenes cobradas
  const paidOrders = contact.orders.filter((o) =>
    (PAID_ORDER_STATUSES as readonly string[]).includes(o.status),
  );
  const grossPaidCents = paidOrders.reduce((acc, o) => acc + o.total, 0);
  const retractRefundedCents = paidOrders.reduce((acc, o) => {
    const orderRetract = o.items.reduce((sum, it) => {
      if (it.retractRequest?.status === "REFUNDED") {
        return sum + (it.retractRequest.refundAmount ?? 0);
      }
      return sum;
    }, 0);
    return acc + orderRetract;
  }, 0);
  const netLtvCents = Math.max(0, grossPaidCents - retractRefundedCents);
  const aovCents = paidOrders.length > 0 ? Math.round(grossPaidCents / paidOrders.length) : 0;

  // Semáforo COD
  const noShowCount = contact.orders.filter((o) => o.noShowAt !== null).length;
  const codRiskLevel: "CLEAN" | "WATCH" | "BLOCKED" =
    blockedEntries.length > 0 ? "BLOCKED" : noShowCount > 0 ? "WATCH" : "CLEAN";
  const codRiskReason =
    blockedEntries.length > 0
      ? `Identidad bloqueada para contra entrega (${blockedEntries[0]!.reason})`
      : noShowCount > 0
        ? `${noShowCount} pedido${noShowCount === 1 ? "" : "s"} marcado${noShowCount === 1 ? "" : "s"} como no recibido (no-show)`
        : "Sin incidentes en contra entrega";

  // Estado activo Ley 1581 NEWSLETTER (último evento cronológico)
  const latestNewsletterConsent = contact.consents.find((c) => c.scope === "NEWSLETTER");
  const marketingOptIn = Boolean(
    latestNewsletterConsent &&
    latestNewsletterConsent.accepted &&
    latestNewsletterConsent.revokedBy.length === 0,
  );
  const marketingOptInAt = marketingOptIn ? (latestNewsletterConsent?.acceptedAt ?? null) : null;

  // Señales de abandono / fricción individual ("¿Dónde quedó esta persona?")
  const dropOffSignals: ContactDropOffSignal[] = [];

  for (const ord of contact.orders) {
    if (ord.status !== "PENDING_PAYMENT") continue;
    const latestTx = ord.wompiAttempts[0]?.transactions[0];
    if (latestTx && (latestTx.status === "DECLINED" || latestTx.status === "ERROR")) {
      dropOffSignals.push({
        stage: "PAYMENT_DECLINED",
        title: `Pago rechazado en pedido ${ord.number}`,
        detail: `${latestTx.paymentMethodType ?? "Wompi"}${latestTx.statusMessage ? ` · "${latestTx.statusMessage}"` : ""} — pendiente de reintento o acompañamiento.`,
        occurredAt: latestTx.lastSeenAt ?? ord.createdAt,
        actionHref: `/admin/pedidos/${encodeURIComponent(ord.number)}`,
        actionLabel: "Ver pedido",
      });
    }
  }

  for (const ac of contact.abandonedCarts) {
    if (ac.recoveredAt !== null) continue;
    dropOffSignals.push({
      stage: "CART_ABANDONED",
      title: "Carrito abandonado sin compra cerrada",
      detail:
        ac.reminderCount > 0
          ? `Se enviaron ${ac.reminderCount} recordatorio${ac.reminderCount === 1 ? "" : "s"} de recuperación.`
          : "Aún sin recordatorio enviado.",
      occurredAt: ac.updatedAt,
      actionHref: "/admin/carritos",
      actionLabel: "Ir a carritos",
    });
  }

  const customerDesigns = contact.customer?.designs ?? [];
  for (const d of customerDesigns) {
    if (d.status !== "DRAFT") continue;
    dropOffSignals.push({
      stage: "STUDIO_DRAFT",
      title: `Borrador activo en Estudio (${d.product.name})`,
      detail: "Empezó a personalizar este producto y aún no lo ha finalizado.",
      occurredAt: d.updatedAt,
    });
  }

  dropOffSignals.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  // Unificar posventa
  const aftersales: Contact360Data["aftersales"] = [
    ...contact.supportTickets.map((t) => ({
      kind: "TICKET" as const,
      id: t.id,
      title: t.subject,
      status: t.status,
      orderNumber: t.orderNumber,
      href: `/admin/soporte/${t.id}`,
      createdAt: t.createdAt,
    })),
    ...contact.warrantyClaims.map((w) => ({
      kind: "WARRANTY" as const,
      id: w.id,
      title: w.description.slice(0, 90),
      status: w.status,
      orderNumber: w.orderItem.order.number,
      href: `/admin/garantias?status=${w.status}`,
      createdAt: w.requestedAt,
    })),
    ...contact.retractRequests.map((r) => ({
      kind: "RETRACT" as const,
      id: r.id,
      title: r.reason?.slice(0, 90) || "Solicitud de retracto Ley 1480",
      status: r.status,
      orderNumber: r.orderItem.order.number,
      href: `/admin/retractos?status=${r.status}`,
      createdAt: r.requestedAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const openCareCount =
    contact.supportTickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").length +
    contact.warrantyClaims.filter((w) => ["PENDING", "IN_REVIEW", "APPROVED"].includes(w.status))
      .length +
    contact.retractRequests.filter((r) => ["PENDING", "APPROVED", "RECEIVED"].includes(r.status))
      .length;

  const rawDisplayName =
    contact.displayName?.trim() ||
    [contact.customer?.firstName, contact.customer?.lastName].filter(Boolean).join(" ").trim() ||
    contact.primaryEmail ||
    "Contacto";

  const backInStockRaw = contact.customer ? contact.customer.backInStockSubs : guestBackInStock;

  return {
    id: contact.id,
    displayName: canReadPii ? rawDisplayName : maskPersonName(rawDisplayName),
    primaryEmail: canReadPii
      ? contact.primaryEmail
      : contact.primaryEmail
        ? maskEmail(contact.primaryEmail)
        : null,
    primaryPhoneE164: canReadPii
      ? contact.primaryPhoneE164
      : contact.primaryPhoneE164
        ? maskPhone(contact.primaryPhoneE164)
        : null,
    waPhoneRaw: canReadPii ? (contact.primaryPhoneE164 ?? contact.customer?.phone ?? null) : null,
    documentLabel: canReadPii
      ? contact.documentType && contact.documentNumber
        ? `${contact.documentType} ${contact.documentNumber}`
        : contact.customer?.documentType && contact.customer?.documentNumber
          ? `${contact.customer.documentType} ${contact.customer.documentNumber}`
          : null
      : maskTaxDocument(
          contact.documentType ?? contact.customer?.documentType,
          contact.documentNumber ?? contact.customer?.documentNumber,
        ),
    taxResponsibility: contact.customer?.taxResponsibility ?? null,
    source: contact.source,
    anonymizedAt: contact.anonymizedAt,
    createdAt: contact.createdAt,
    piiMasked: !canReadPii,
    organization: contact.organization
      ? {
          id: contact.organization.id,
          name: contact.organization.name,
          taxLabel: canReadPii
            ? contact.organization.taxIdType && contact.organization.taxIdNumber
              ? `${contact.organization.taxIdType} ${contact.organization.taxIdNumber}`
              : null
            : maskTaxDocument(contact.organization.taxIdType, contact.organization.taxIdNumber),
          city: contact.organization.city,
          department: contact.organization.department,
        }
      : null,
    ownerAdminEmail: contact.ownerAdmin?.email ?? null,
    customer: contact.customer
      ? {
          id: contact.customer.id,
          referralCode: contact.customer.referralCode,
          loyaltyPoints: contact.customer.loyaltyPoints,
          createdAt: contact.customer.createdAt,
        }
      : null,
    kpis: {
      paidOrdersCount: paidOrders.length,
      grossPaidCents,
      retractRefundedCents,
      netLtvCents,
      aovCents,
      openCareCount,
      marketingOptIn,
      marketingOptInAt,
      codRiskLevel,
      codRiskReason,
    },
    dropOffSignals: dropOffSignals.slice(0, 6),
    intentSignals: {
      wishlist: (contact.customer?.wishlist ?? []).map((w) => ({
        id: w.id,
        productName: w.product.name,
        productSlug: w.product.slug,
        createdAt: w.createdAt,
      })),
      backInStock: backInStockRaw.map((b) => ({
        id: b.id,
        productName: b.product.name,
        productSlug: b.product.slug,
        notifiedAt: b.notifiedAt,
        createdAt: b.createdAt,
      })),
    },
    orders: contact.orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      paymentMethod: o.paymentMethod,
      totalCents: o.total,
      isGift: o.isGift,
      createdAt: o.createdAt,
    })),
    quotes: contact.quotes.map((q) => ({
      id: q.id,
      number: q.number,
      status: q.status,
      totalCents: q.total,
      city: q.city,
      department: q.department,
      createdAt: q.createdAt,
    })),
    designs: customerDesigns.map((d) => ({
      id: d.id,
      productName: d.product.name,
      productSlug: d.product.slug,
      status: d.status,
      moderationStatus: d.moderationStatus,
      qualityAcknowledgedAt: d.qualityAcknowledgedAt,
      updatedAt: d.updatedAt,
    })),
    abandonedCarts: contact.abandonedCarts.map((ac) => ({
      id: ac.id,
      reminderCount: ac.reminderCount,
      lastReminderSentAt: ac.lastReminderSentAt,
      recoveredAt: ac.recoveredAt,
      createdAt: ac.createdAt,
    })),
    aftersales,
    reviews: (contact.customer?.reviews ?? []).map((rev) => ({
      id: rev.id,
      productName: rev.product.name,
      productSlug: rev.product.slug,
      rating: rev.rating,
      comment: rev.comment,
      isApproved: rev.isApproved,
      createdAt: rev.createdAt,
    })),
    referrals: referralRows.map((ref) => ({
      id: ref.id,
      referredEmail: canReadPii ? ref.referredEmail : maskEmail(ref.referredEmail),
      status: ref.status,
      createdAt: ref.createdAt,
      rewardedAt: ref.rewardedAt,
    })),
    personalCoupons: (contact.customer?.personalCoupons ?? []).map((cp) => ({
      id: cp.id,
      code: cp.code,
      type: cp.type,
      value: cp.value,
      usedCount: cp.usedCount,
      isActive: cp.isActive,
      validTo: cp.validTo,
    })),
    consents: contact.consents.map((c) => ({
      id: c.id,
      scope: c.scope,
      accepted: c.accepted,
      version: c.version,
      isRevoked: c.revokedBy.length > 0,
      acceptedAt: c.acceptedAt,
    })),
    addresses: (contact.customer?.addresses ?? []).map((addr) => ({
      id: addr.id,
      name: addr.name,
      line1: canReadPii ? addr.line1 : "Dirección protegida",
      line2: canReadPii ? addr.line2 : null,
      city: addr.city,
      department: addr.department,
      phone: canReadPii ? addr.phone : maskPhone(addr.phone),
    })),
    identities: contact.identities.map((ident) => ({
      id: ident.id,
      type: ident.type,
      valueDisplay: canReadPii
        ? ident.normalizedValue
        : ident.type === "EMAIL"
          ? maskEmail(ident.normalizedValue)
          : ident.type === "PHONE" || ident.type === "WHATSAPP"
            ? maskPhone(ident.normalizedValue)
            : maskDocumentNumber(ident.normalizedValue),
      verificationStatus: ident.verificationStatus,
      verificationSource: ident.verificationSource,
      verifiedAt: ident.verifiedAt,
      lastSeenAt: ident.lastSeenAt,
    })),
    pendingMergesCount,
  };
}
