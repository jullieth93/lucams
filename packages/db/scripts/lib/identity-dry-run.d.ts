import type { Prisma, PrismaClient } from "@prisma/client";

export type ContactSourceKind =
  "CUSTOMER_AUTH" | "GUEST_ORDER" | "SUPPORT_TICKET" | "QUOTE" | "ABANDONED_CART" | "NEWSLETTER";

export interface IdentityDryRunDataset {
  customers?: Array<{
    id: string;
    email: string | null;
    phone?: string | null;
    supabaseUserId?: string | null;
    documentType?: string | null;
    documentNumber?: string | null;
    deletedAt?: Date | null;
  }>;
  orders?: Array<{
    id: string;
    customerId?: string | null;
    email: string;
    phone?: string | null;
    isGift?: boolean;
    recipientPhone?: string | null;
    billingDocumentType?: string | null;
    billingDocumentNumber?: string | null;
    deletedAt?: Date | null;
  }>;
  supportTickets?: Array<{
    id: string;
    customerId?: string | null;
    email: string;
  }>;
  quotes?: Array<{
    id: string;
    customerEmail?: string | null;
    customerWhatsapp?: string | null;
    deletedAt?: Date | null;
  }>;
  abandonedCarts?: Array<{
    id: string;
    email: string;
    cartCustomerId?: string | null;
  }>;
  consents?: Array<{
    id: string;
    customerId?: string | null;
    email?: string | null;
    phone?: string | null;
    scope: string;
    accepted: boolean;
    acceptedAt?: Date;
  }>;
  warrantyClaims?: Array<{
    id: string;
    customerId?: string | null;
    orderId: string;
  }>;
  retractRequests?: Array<{
    id: string;
    orderId: string;
  }>;
}

export interface IdentityDryRunSimulation {
  sourceCounts: {
    activeCustomers: number;
    softDeletedCustomers: number;
    activeOrders: number;
    softDeletedOrders: number;
    registeredOrders: number;
    guestOrders: number;
    giftOrdersTotal: number;
    supportTicketsTotal: number;
    registeredSupportTickets: number;
    guestSupportTickets: number;
    activeQuotes: number;
    softDeletedQuotes: number;
    quotesWithEmail: number;
    quotesPhoneOnly: number;
    abandonedCartsTotal: number;
    consentsTotal: number;
    activeNewsletterUniqueEmails: number;
    warrantyClaimsTotal: number;
    retractRequestsTotal: number;
  };
  forensics: {
    authOrderEmailMismatchTotal: number;
    authOrderEmailMismatchGift: number;
    authOrderEmailMismatchNonGift: number;
    sharedPhonesAcrossActiveCustomers: number;
    sharedPhonesAcrossContacts: number;
    sharedTaxDocsAcrossContacts: number;
    giftRecipientPhonesIsolated: number;
    anonymizedRecordsPreservedNull: {
      orders: number;
      supportTickets: number;
      abandonedCarts: number;
      consents: number;
      warrantyClaims: number;
      retractRequests: number;
    };
  };
  simulatedProjection: {
    totalContacts: number;
    contactsWithCustomerAccount: number;
    contactsGuestOrLeadOnly: number;
    contactsBySource: Record<ContactSourceKind, number>;
    totalIdentities: number;
    identitiesByType: {
      SUPABASE_USER_VERIFIED: number;
      EMAIL_VERIFIED: number;
      EMAIL_UNVERIFIED_OBSERVED: number;
      PHONE_UNVERIFIED_OBSERVED: number;
      WHATSAPP_UNVERIFIED_OBSERVED: number;
    };
    foreignKeyResolution: {
      ordersLinkedToCustomerContact: number;
      ordersLinkedContextuallyToExistingContact: number;
      ordersLinkedToNewGuestContact: number;
      supportTicketsLinked: number;
      quotesLinked: number;
      abandonedCartsLinked: number;
      consentsLinked: number;
      warrantyClaimsLinked: number;
      retractRequestsLinked: number;
    };
    mergeCandidatesTotalPairs: number;
    mergeCandidatesByReason: {
      SAME_BUYER_PHONE_E164: number;
      SAME_BILLING_DOCUMENT: number;
      HISTORICAL_ID01_EMAIL_MISMATCH: number;
    };
  };
}

export interface IdentityDryRunReport extends IdentityDryRunSimulation {
  generatedAt: string;
  readOnlyVerified: boolean;
  scoped: boolean;
}

export interface RunIdentityDryRunOptions {
  scopePrefix?: string;
  afterReadProbe?: (tx: Prisma.TransactionClient) => Promise<void>;
}

export function isAnonymizedPlaceholderEmail(raw: string | null | undefined): boolean;
export function normalizeEmailIdentity(raw: string | null | undefined): string;
export function normalizePhoneE164(raw: string | null | undefined): string;
export function normalizeTaxDocKey(
  docType: string | null | undefined,
  docNumber: string | null | undefined,
): string;
export function simulateIdentityResolution(
  dataset: IdentityDryRunDataset,
): IdentityDryRunSimulation;
export function runIdentityDryRun(
  prisma: PrismaClient,
  options?: RunIdentityDryRunOptions,
): Promise<IdentityDryRunReport>;
export function formatIdentityDryRunReport(report: IdentityDryRunReport): string;
