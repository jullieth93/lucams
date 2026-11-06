import type { LifecycleJourney, LifecycleStepCondition, Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import type { LifecycleAudienceMember } from "./types";

export const PAID_ORDER_STATUSES = [
  "PAID",
  "FULFILLING",
  "SHIPPED",
  "DELIVERED",
  "REFUNDED",
] as const;

export const CONTACT_SELECT = {
  id: true,
  primaryEmail: true,
  displayName: true,
  createdAt: true,
  deletedAt: true,
  anonymizedAt: true,
  isStaff: true,
  consents: {
    where: { scope: "NEWSLETTER" },
    orderBy: { acceptedAt: "desc" },
    take: 1,
    select: { accepted: true },
  },
  customer: {
    select: {
      loyaltyPoints: true,
      designs: {
        where: { status: { in: ["DRAFT", "READY"] } },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { id: true, product: { select: { slug: true, name: true } } },
      },
      wishlist: { take: 1, select: { id: true } },
      backInStockSubs: { take: 1, select: { id: true } },
    },
  },
  orders: {
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
    where: { recoveredAt: null, closedReason: null },
    take: 1,
    select: { id: true },
  },
  opportunities: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { id: true, number: true, stage: true },
  },
  quotes: { take: 1, select: { id: true } },
} satisfies Prisma.ContactSelect;

export type EligibleContact = Prisma.ContactGetPayload<{
  select: typeof CONTACT_SELECT;
}>;

export type ContactTriggerData = {
  lastOrderNumber?: string;
  lastOrderStatus?: string;
  lastProductSlug?: string;
  lastProductName?: string;
  opportunityNumber?: string;
  designId?: string;
};

export function hasNewsletterOptIn(contact: EligibleContact): boolean {
  return contact.consents[0]?.accepted === true;
}

export type ContactBehavior = {
  hasPaidOrder: boolean;
  lastPaidAt: Date | null;
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
  const inactivityCutoff = new Date(now.getTime() - journey.inactivityDays * 86_400_000);
  const base: Prisma.ContactWhereInput = {
    deletedAt: null,
    anonymizedAt: null,
    isStaff: false,
    primaryEmail: { not: null, contains: "@" },
  };

  switch (journey.trigger) {
    case "FIRST_PURCHASE":
      return {
        ...base,
        OR: [
          { createdAt: { gte: lookback } },
          { consents: { some: { scope: "NEWSLETTER", acceptedAt: { gte: lookback } } } },
          { customer: { createdAt: { gte: lookback } } },
          { abandonedCarts: { some: { createdAt: { gte: lookback } } } },
        ],
        orders: { none: { status: { in: [...PAID_ORDER_STATUSES] } } },
      };
    case "SECOND_PURCHASE":
      return {
        ...base,
        orders: {
          some: {
            status: "DELIVERED",
            deliveredAt: { not: null, gte: lookback },
          },
        },
      };
    case "REACTIVATION":
      return {
        ...base,
        orders: {
          some: { createdAt: { lte: inactivityCutoff }, status: { in: [...PAID_ORDER_STATUSES] } },
          none: { createdAt: { gt: inactivityCutoff }, status: { in: [...PAID_ORDER_STATUSES] } },
        },
      };
    case "HIGH_INTENT":
      return {
        ...base,
        orders: { none: { status: { in: [...PAID_ORDER_STATUSES] } } },
        OR: [
          {
            abandonedCarts: {
              some: {
                recoveredAt: null,
                closedReason: null,
                createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) },
              },
            },
          },
          { customer: { designs: { some: { status: { in: ["DRAFT", "READY"] } } } } },
          { customer: { wishlist: { some: {} } } },
          { customer: { backInStockSubs: { some: { notifiedAt: null } } } },
          {
            opportunities: {
              some: { deletedAt: null, stage: { in: ["NEW", "QUALIFYING", "PROPOSAL_SENT"] } },
            },
          },
          { quotes: { some: { deletedAt: null, status: { in: ["PENDING", "CONTACTED"] } } } },
        ],
      };
    case "B2B_FOLLOW_UP":
      return {
        ...base,
        opportunities: {
          some: {
            deletedAt: null,
            createdAt: { gte: lookback },
            stage: { in: ["NEW", "QUALIFYING", "PROPOSAL_SENT"] },
          },
        },
      };
  }
}

const OPT_IN_WHERE: Prisma.ContactWhereInput = {
  consents: {
    some: { scope: "NEWSLETTER", accepted: true, revokedBy: { none: {} } },
  },
};

export async function findEligibleContacts(
  journey: LifecycleJourney,
  now = new Date(),
  options: { limit?: number; ignoreOptIn?: boolean; contactIds?: string[] } = {},
): Promise<{ items: EligibleContact[]; excludedNoOptIn: number; total: number }> {
  const baseWhere: Prisma.ContactWhereInput = {
    AND: [
      eligibleWhere(journey, now),
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
      select: CONTACT_SELECT,
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
  const latestProduct = latestOrder?.items[0]?.variant.product;
  return {
    lastOrderNumber: latestOrder?.number,
    lastOrderStatus: latestOrder?.status,
    lastProductSlug: latestProduct?.slug,
    lastProductName: latestProduct?.name,
    opportunityNumber: contact.opportunities[0]?.number,
    designId: contact.customer?.designs[0]?.id,
  };
}

export function toAudienceMember(contact: EligibleContact): LifecycleAudienceMember {
  return {
    contactId: contact.id,
    email: contact.primaryEmail!,
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
  enrolledAt: Date,
): string | null {
  if (contact.deletedAt || contact.anonymizedAt || contact.isStaff) return "CONTACT_INACTIVE";
  if (journey.requireOptIn && !hasNewsletterOptIn(contact)) return "CONSENT_REVOKED";
  if (
    (journey.trigger === "FIRST_PURCHASE" || journey.trigger === "HIGH_INTENT") &&
    behavior.hasPaidOrder
  ) {
    return "ORDER_PAID";
  }
  if (
    (journey.trigger === "SECOND_PURCHASE" || journey.trigger === "REACTIVATION") &&
    behavior.lastPaidAt &&
    behavior.lastPaidAt > enrolledAt
  ) {
    return "ORDER_PAID";
  }
  if (journey.trigger === "B2B_FOLLOW_UP") {
    const stage = contact.opportunities[0]?.stage;
    if (stage === "WON" || stage === "LOST") return `OPPORTUNITY_${stage}`;
  }
  return null;
}
