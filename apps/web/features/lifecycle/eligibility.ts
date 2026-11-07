import type { LifecycleJourney, LifecycleStepCondition, Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { NEWSLETTER_PRIVACY_VERSION } from "@/features/newsletter/service";
import type { LifecycleAudienceMember } from "./types";

export const PAID_ORDER_STATUSES = [
  "PAID",
  "FULFILLING",
  "SHIPPED",
  "DELIVERED",
  "REFUNDED",
] as const;

export function getLifecycleContactSelect(now: Date) {
  return {
    id: true,
    primaryEmail: true,
    displayName: true,
    createdAt: true,
    deletedAt: true,
    anonymizedAt: true,
    isStaff: true,
    consents: {
      where: { scope: "NEWSLETTER", version: NEWSLETTER_PRIVACY_VERSION },
      orderBy: { acceptedAt: "desc" },
      take: 1,
      select: { accepted: true, version: true },
    },
    customer: {
      select: {
        loyaltyPoints: true,
        designs: {
          where: { status: { in: ["DRAFT", "READY"] } },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            id: true,
            updatedAt: true,
            product: { select: { slug: true, name: true } },
          },
        },
        wishlist: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            createdAt: true,
            product: { select: { slug: true, name: true } },
          },
        },
        backInStockSubs: {
          where: {
            notifiedAt: null,
            product: {
              isActive: true,
              deletedAt: null,
              variants: { some: { isActive: true, deletedAt: null, stock: { gt: 0 } } },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            createdAt: true,
            product: { select: { slug: true, name: true } },
          },
        },
      },
    },
    orders: {
      where: { status: { in: [...PAID_ORDER_STATUSES] }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: {
        id: true,
        number: true,
        status: true,
        deliveredAt: true,
        createdAt: true,
        items: {
          take: 3,
          select: { variant: { select: { product: { select: { slug: true, name: true } } } } },
        },
      },
    },
    abandonedCarts: {
      where: {
        recoveredAt: null,
        closedReason: null,
        createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) },
      },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { id: true, createdAt: true },
    },
    opportunities: {
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 1,
      select: { id: true, number: true, stage: true, updatedAt: true, ownerAdminId: true },
    },
    quotes: {
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { id: true, createdAt: true },
    },
  } satisfies Prisma.ContactSelect;
}

export type EligibleContact = Prisma.ContactGetPayload<{
  select: ReturnType<typeof getLifecycleContactSelect>;
}>;

export function resolveLifecycleTargetPath(
  trigger: LifecycleJourney["trigger"],
  ctaPath: string,
  data: Prisma.JsonValue,
): string {
  if (!["FIRST_PURCHASE", "SECOND_PURCHASE", "REACTIVATION", "HIGH_INTENT"].includes(trigger)) {
    return ctaPath;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return ctaPath;
  const slug = (data as Prisma.JsonObject).lastProductSlug;
  if (
    typeof slug === "string" &&
    slug &&
    (ctaPath === "/productos" || ctaPath === "/recomendador")
  ) {
    return `/producto/${encodeURIComponent(slug)}`;
  }
  return ctaPath;
}

export type ContactTriggerData = {
  lastOrderNumber?: string;
  lastOrderStatus?: string;
  lastProductSlug?: string;
  lastProductName?: string;
  opportunityNumber?: string;
  designId?: string;
};

export function hasNewsletterOptIn(contact: EligibleContact): boolean {
  return (
    contact.consents[0]?.accepted === true &&
    contact.consents[0].version === NEWSLETTER_PRIVACY_VERSION
  );
}

export type ContactBehavior = {
  hasPaidOrder: boolean;
  paidOrderCount: number;
  lastPaidAt: Date | null;
  lastPaidOrderId: string | null;
  hasDeliveredOrder: boolean;
};

export function hasDesignActivity(contact: EligibleContact): boolean {
  return (contact.customer?.designs.length ?? 0) > 0;
}

export function hasAbandonedCart(contact: EligibleContact): boolean {
  return contact.abandonedCarts.length > 0;
}

function eligibleWhere(journey: LifecycleJourney, now: Date): Prisma.ContactWhereInput {
  const lookback = new Date(now.getTime() - journey.entryLookbackDays * 86_400_000);
  const inactivityDays =
    journey.trigger === "B2B_FOLLOW_UP"
      ? Math.max(1, journey.inactivityDays)
      : journey.inactivityDays;
  const inactivityCutoff = new Date(now.getTime() - inactivityDays * 86_400_000);
  const identityBase: Prisma.ContactWhereInput = {
    deletedAt: null,
    anonymizedAt: null,
    isStaff: false,
  };
  const base: Prisma.ContactWhereInput = {
    ...identityBase,
    primaryEmail: { not: null, contains: "@" },
  };
  const paidOrder: Prisma.OrderWhereInput = {
    status: { in: [...PAID_ORDER_STATUSES] },
    deletedAt: null,
  };

  switch (journey.trigger) {
    case "FIRST_PURCHASE":
      return {
        ...base,
        OR: [
          { createdAt: { gte: lookback } },
          {
            consents: {
              some: {
                scope: "NEWSLETTER",
                version: NEWSLETTER_PRIVACY_VERSION,
                accepted: true,
                acceptedAt: { gte: lookback },
              },
            },
          },
          { customer: { createdAt: { gte: lookback } } },
          {
            customer: {
              designs: {
                some: { status: { in: ["DRAFT", "READY"] }, updatedAt: { gte: lookback } },
              },
            },
          },
          { abandonedCarts: { some: { createdAt: { gte: lookback } } } },
        ],
        orders: { none: paidOrder },
      };
    case "SECOND_PURCHASE":
      return {
        ...base,
        orders: {
          some: {
            status: "DELIVERED",
            deliveredAt: { not: null, gte: lookback },
            deletedAt: null,
          },
        },
      };
    case "REACTIVATION":
      return {
        ...base,
        orders: {
          some: { ...paidOrder, createdAt: { gte: lookback, lte: inactivityCutoff } },
          none: { ...paidOrder, createdAt: { gt: inactivityCutoff } },
        },
      };
    case "HIGH_INTENT":
      return {
        ...base,
        orders: { none: paidOrder },
        OR: [
          {
            abandonedCarts: {
              some: { recoveredAt: null, closedReason: null, createdAt: { gte: lookback } },
            },
          },
          {
            customer: {
              designs: {
                some: { status: { in: ["DRAFT", "READY"] }, updatedAt: { gte: lookback } },
              },
            },
          },
          { customer: { wishlist: { some: { createdAt: { gte: lookback } } } } },
          {
            customer: {
              backInStockSubs: {
                some: {
                  notifiedAt: null,
                  createdAt: { gte: lookback },
                  product: {
                    isActive: true,
                    deletedAt: null,
                    variants: { some: { isActive: true, deletedAt: null, stock: { gt: 0 } } },
                  },
                },
              },
            },
          },
          {
            opportunities: {
              some: {
                deletedAt: null,
                updatedAt: { gte: lookback },
                stage: { in: ["NEW", "QUALIFYING", "PROPOSAL_SENT"] },
              },
            },
          },
          {
            quotes: {
              some: {
                deletedAt: null,
                createdAt: { gte: lookback },
                status: { in: ["PENDING", "CONTACTED"] },
              },
            },
          },
        ],
      };
    case "B2B_FOLLOW_UP":
      return {
        ...identityBase,
        opportunities: {
          some: {
            deletedAt: null,
            updatedAt: { gte: lookback, lte: inactivityCutoff },
            stage: { in: ["NEW", "QUALIFYING", "PROPOSAL_SENT"] },
          },
        },
      };
  }
}

const OPT_IN_WHERE: Prisma.ContactWhereInput = {
  consents: {
    some: {
      scope: "NEWSLETTER",
      version: NEWSLETTER_PRIVACY_VERSION,
      accepted: true,
      revokedBy: { none: {} },
    },
  },
};

async function singlePaidOrderContactIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ contactId: string }>>`
    SELECT "contactId"
    FROM "Order"
    WHERE "contactId" IS NOT NULL
      AND "deletedAt" IS NULL
      AND "status" IN ('PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED', 'REFUNDED')
    GROUP BY "contactId"
    HAVING COUNT(*) = 1
  `;
  return rows.map((row) => row.contactId);
}

export async function findEligibleContacts(
  journey: LifecycleJourney,
  now = new Date(),
  options: { limit?: number; ignoreOptIn?: boolean; contactIds?: string[] } = {},
): Promise<{ items: EligibleContact[]; excludedNoOptIn: number; total: number }> {
  const triggerWhere = eligibleWhere(journey, now);
  const behaviorWhere: Prisma.ContactWhereInput =
    journey.trigger === "SECOND_PURCHASE"
      ? { AND: [triggerWhere, { id: { in: await singlePaidOrderContactIds() } }] }
      : triggerWhere;
  const baseWhere: Prisma.ContactWhereInput = {
    AND: [
      behaviorWhere,
      ...(options.contactIds ? [{ id: { in: options.contactIds } }] : []),
      {
        lifecycleEnrollments: {
          none: {
            journeyId: journey.id,
            OR: [
              { status: "ACTIVE" },
              { status: "SUPPRESSED" },
              { nextRunAt: { gt: now } },
              { status: "EXITED", exitReason: "ADMIN_EXIT" },
            ],
          },
        },
      },
    ],
  };
  const requiresOptIn = journey.requireOptIn && !options.ignoreOptIn;
  const where = requiresOptIn ? { AND: [baseWhere, OPT_IN_WHERE] } : baseWhere;
  const [rows, candidateCount, optedInCount] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: getLifecycleContactSelect(now),
      orderBy: { createdAt: "asc" },
      take: options.limit ?? 100,
    }),
    requiresOptIn ? prisma.contact.count({ where: baseWhere }) : Promise.resolve(0),
    requiresOptIn ? prisma.contact.count({ where }) : prisma.contact.count({ where: baseWhere }),
  ]);
  return {
    items: rows,
    excludedNoOptIn: candidateCount - optedInCount,
    total: optedInCount,
  };
}

export function buildTriggerData(contact: EligibleContact): ContactTriggerData {
  const latestOrder = contact.orders[0];
  const design = contact.customer?.designs[0];
  const wishlist = contact.customer?.wishlist[0];
  const backInStock = contact.customer?.backInStockSubs[0];
  const preferredProduct =
    design?.product ??
    wishlist?.product ??
    backInStock?.product ??
    latestOrder?.items[0]?.variant.product;
  return {
    lastOrderNumber: latestOrder?.number,
    lastOrderStatus: latestOrder?.status,
    lastProductSlug: preferredProduct?.slug,
    lastProductName: preferredProduct?.name,
    opportunityNumber: contact.opportunities[0]?.number,
    designId: design?.id,
  };
}

export function toAudienceMember(contact: EligibleContact): LifecycleAudienceMember {
  return {
    contactId: contact.id,
    email: contact.primaryEmail,
    displayName: contact.displayName,
    triggerRef: contact.orders[0]?.number ?? contact.opportunities[0]?.number ?? null,
  };
}

export function evaluateStepCondition(
  condition: LifecycleStepCondition,
  context: {
    hasPaidOrder: boolean;
    hasAbandonedCart: boolean;
    loyaltyPoints: number;
    hasDesignActivity: boolean;
    hasOptIn: boolean;
    orderDelivered: boolean;
    orderSinceEnrollment: boolean;
  },
): boolean {
  switch (condition) {
    case "ALWAYS":
      return true;
    case "NO_PAID_ORDER":
      return !context.hasPaidOrder;
    case "HAS_ABANDONED_CART":
      return context.hasAbandonedCart;
    case "HAS_LOYALTY_POINTS":
      return context.loyaltyPoints > 0;
    case "HAS_DESIGN_ACTIVITY":
      return context.hasDesignActivity;
    case "HAS_OPT_IN":
      return context.hasOptIn;
    case "ORDER_DELIVERED":
      return context.orderDelivered;
    case "NO_ORDER_SINCE_ENROLLMENT":
      return !context.orderSinceEnrollment;
  }
}

export function getEnrollmentExitReason(
  journey: LifecycleJourney,
  contact: EligibleContact,
  behavior: ContactBehavior,
  triggerRef?: string | null,
  enrolledAt?: Date,
): string | null {
  if (contact.deletedAt || contact.anonymizedAt || contact.isStaff) return "CONTACT_INACTIVE";
  if (journey.requireOptIn && !hasNewsletterOptIn(contact)) return "CONSENT_REVOKED";
  if (
    (journey.trigger === "FIRST_PURCHASE" || journey.trigger === "HIGH_INTENT") &&
    behavior.hasPaidOrder
  ) {
    return "ORDER_PAID";
  }
  const hasNewPaidOrder = triggerRef
    ? behavior.lastPaidOrderId !== null && behavior.lastPaidOrderId !== triggerRef
    : behavior.lastPaidAt !== null && enrolledAt !== undefined && behavior.lastPaidAt > enrolledAt;
  if (
    (journey.trigger === "SECOND_PURCHASE" || journey.trigger === "REACTIVATION") &&
    hasNewPaidOrder
  ) {
    return "ORDER_PAID";
  }
  if (journey.trigger === "FIRST_PURCHASE" || journey.trigger === "HIGH_INTENT") {
    if (hasAbandonedCart(contact)) return "DELEGATED_CART_RECOVERY";
    if (journey.trigger === "HIGH_INTENT" && (contact.customer?.backInStockSubs.length ?? 0) > 0) {
      return "DELEGATED_BACK_IN_STOCK";
    }
  }
  if (journey.trigger === "B2B_FOLLOW_UP") {
    const stage = contact.opportunities[0]?.stage;
    if (!stage) return "OPPORTUNITY_CLOSED";
    if (stage === "WON" || stage === "LOST") return `OPPORTUNITY_${stage}`;
  }
  return null;
}
