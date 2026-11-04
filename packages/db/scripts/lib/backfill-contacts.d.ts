import type { Prisma, PrismaClient } from "@prisma/client";

export interface UnlinkedEligibleEntityCounts {
  customers: number;
  orders: number;
  supportTickets: number;
  quotes: number;
  abandonedCarts: number;
  consents: number;
  warrantyClaims: number;
  retractRequests: number;
  unlinkedEligibleTotal: number;
}

export interface RunContactsBackfillOptions {
  apply?: boolean;
  batchSize?: number;
  scopePrefix?: string;
}

export interface ContactsBackfillReport {
  mode: "DRY_RUN" | "APPLIED";
  readOnlyVerified: boolean;
  batchSize: number;
  startedAt: string;
  finishedAt: string;
  contactsCreated: number;
  contactsUpdated: number;
  identitiesCreated: number;
  identitiesUpdated: number;
  mergeCandidatesCreated: number;
  mergeCandidatesUpdated: number;
  entitiesLinked: {
    customers: number;
    orders: number;
    supportTickets: number;
    quotes: number;
    abandonedCarts: number;
    consents: number;
    warrantyClaims: number;
    retractRequests: number;
  };
  skipped: {
    anonymizedOrDeleted: number;
    anonymousConsents: number;
    giftOrdersIsolated: number;
    historicalId01MismatchesQueued: number;
  };
  batchesProcessed: number;
  totalMutations: number;
  pendingBefore: UnlinkedEligibleEntityCounts;
  reconciliationAfter: UnlinkedEligibleEntityCounts;
}

export function countUnlinkedEligibleEntities(
  db: PrismaClient | Prisma.TransactionClient,
  scopePrefix?: string,
): Promise<UnlinkedEligibleEntityCounts>;

export function runContactsBackfill(
  prisma: PrismaClient,
  options?: RunContactsBackfillOptions,
): Promise<ContactsBackfillReport>;

export function formatContactsBackfillReport(report: ContactsBackfillReport): string;
