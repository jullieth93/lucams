/*
 * Servicio de Revisión Humana y Fusión Transaccional de `Contact` (`Fase 9 · S20`, ADR-193 Nivel 4).
 *
 * Garantías innegociables de seguridad e integridad:
 *  1. Cero auto-merge: toda fusión exige aprobación humana explícita sobre un
 *     `IdentityMergeCandidate` en estado `PENDING` bajo `contacts:merge` + `requireRecentMfa`.
 *  2. Protección de cuentas autenticadas: si AMBOS contactos poseen cuentas activas
 *     `Customer` (`auth.users`), la fusión se bloquea en dominio (`BOTH_HAVE_CUSTOMER_ACCOUNTS`)
 *     para impedir mezclar sesiones, contraseñas o saldos de Puntos Lucams.
 *  3. Conservación determinista de cuenta: cuando exactamente uno de los contactos tiene
 *     `Customer` activo, ese contacto es obligatoriamente el sobreviviente (`survivorContactId`).
 *  4. Índices únicos parciales libres de colisión (`23505` / `25P02`):
 *     - Revoca primero las `ContactIdentity` del absorbido antes de migrarlas al sobreviviente.
 *     - Archiva lógicamente (`deletedAt`) el contacto absorbido ANTES de enriquecer `primaryEmail`
 *       o documento del sobreviviente (`Contact_primaryEmail_active_key`).
 *  5. Snapshot reversible completo en `IdentityMergeCandidate.mergeSnapshotJson`.
 *  6. Rechazo permanente (`REJECTED`): marca el par como *do-not-suggest* para que
 *     `resolution-service.ts` jamás vuelva a sugerirlo.
 */

import "server-only";
import {
  Prisma,
  type AdminRole,
  type ContactIdentityType,
  type DocumentType,
  type IdentityVerificationStatus,
  type MergeCandidateStatus,
} from "@lucams/db";
import { prisma } from "@/lib/db";
import { hasCapability } from "@/lib/admin-rbac";
import { maskEmail, maskPersonName, maskPhone, maskTaxDocument } from "@/lib/pii-mask";
import {
  enqueueMergeCandidateTx,
  upsertContactIdentityTx,
  type MergeReasonCode,
} from "./resolution-service";
import { PAID_ORDER_STATUSES } from "./contact-360-service";

const MERGE_LOCK_NS = "lucams_contact_merge_v1";
const PAGE_SIZE = 20;

export type MergeValidationErrorCode =
  | "NOT_FOUND"
  | "ALREADY_REVIEWED"
  | "INVALID_SURVIVOR"
  | "BOTH_HAVE_CUSTOMER_ACCOUNTS"
  | "CONTACT_INACTIVE";

export class MergeValidationError extends Error {
  readonly code: MergeValidationErrorCode;

  constructor(code: MergeValidationErrorCode, message: string) {
    super(message);
    this.name = "MergeValidationError";
    this.code = code;
  }
}

export const MERGE_REASON_LABELS: Record<string, string> = {
  SAME_BUYER_PHONE_E164: "Mismo celular de comprador (E.164)",
  SAME_BILLING_DOCUMENT: "Mismo documento tributario (DIAN)",
  AUTH_BUYER_ALT_ORDER_EMAIL: "Comprador con cuenta usó correo alterno en pedido propio",
  HISTORICAL_ID01_EMAIL_MISMATCH: "Pedido histórico con cuenta autenticada y correo alterno",
};

export function formatMergeReasonLabel(code: string): string {
  return MERGE_REASON_LABELS[code] ?? code;
}

export interface MergeContactSummary {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  primaryPhoneE164: string | null;
  documentLabel: string | null;
  source: string;
  organizationName: string | null;
  hasActiveCustomerAccount: boolean;
  customerId: string | null;
  customerEmail: string | null;
  loyaltyPoints: number;
  verifiedEmails: string[];
  observedEmails: string[];
  phones: string[];
  paidOrdersCount: number;
  totalOrdersCount: number;
  netLtvCents: number;
  openCareCount: number;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface MergeCandidateItem {
  id: string;
  status: MergeCandidateStatus;
  reasonCodes: Array<{ code: string; label: string }>;
  evidenceSummary: string | null;
  primaryContact: MergeContactSummary;
  secondaryContact: MergeContactSummary;
  bothHaveActiveCustomerAccounts: boolean;
  forcedSurvivorContactId: string | null;
  recommendedSurvivorContactId: string;
  reviewedByLabel: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  mergedSurvivorContactId: string | null;
  createdAt: Date;
}

export interface MergeCandidateListResult {
  items: MergeCandidateItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: {
    pending: number;
    approved: number;
    rejected: number;
  };
  piiMasked: boolean;
}

export interface MergeSnapshotPayload {
  version: 1;
  mergedAt: string;
  actorAdminId: string;
  survivorContactId: string;
  absorbedContactId: string;
  absorbedContactBefore: {
    primaryEmail: string | null;
    primaryPhoneE164: string | null;
    displayName: string | null;
    documentType: DocumentType | null;
    documentNumber: string | null;
    organizationId: string | null;
    ownerAdminId: string | null;
    source: string;
    detachedSoftDeletedCustomerId: string | null;
  };
  survivorContactBefore: {
    primaryEmail: string | null;
    primaryPhoneE164: string | null;
    displayName: string | null;
    documentType: DocumentType | null;
    documentNumber: string | null;
    organizationId: string | null;
    ownerAdminId: string | null;
  };
  absorbedIdentitiesBefore: Array<{
    id: string;
    type: ContactIdentityType;
    normalizedValue: string;
    verificationStatus: IdentityVerificationStatus;
    verifiedAt: string | null;
    verificationSource: string | null;
  }>;
  movedEntityIds: {
    orders: string[];
    supportTickets: string[];
    quotes: string[];
    abandonedCarts: string[];
    consents: string[];
    warrantyClaims: string[];
    retractRequests: string[];
    contactActivities: string[];
    tasks: string[];
    opportunities: string[];
  };
}

export function isMergeCandidateStatusFilter(raw: string | undefined): raw is MergeCandidateStatus {
  return raw === "PENDING" || raw === "APPROVED" || raw === "REJECTED";
}

function summarizeEvidence(raw: Prisma.JsonValue, maskPii: boolean): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const parts: string[] = [];

  if (typeof obj.orderNumber === "string" && obj.orderNumber.trim()) {
    parts.push(`Pedido ${obj.orderNumber.trim()}`);
  }
  if (typeof obj.phoneE164 === "string" && obj.phoneE164.trim()) {
    const p = obj.phoneE164.trim();
    parts.push(`Celular ${maskPii ? maskPhone(p) : p}`);
  }
  if (typeof obj.documentKey === "string" && obj.documentKey.trim()) {
    const [docType, docNum] = obj.documentKey.split(":");
    if (docType && docNum) {
      parts.push(
        `Doc. ${maskPii ? (maskTaxDocument(docType, docNum) ?? "***") : `${docType} ${docNum}`}`,
      );
    }
  }
  if (typeof obj.altOrderEmail === "string" && obj.altOrderEmail.trim()) {
    const em = obj.altOrderEmail.trim();
    parts.push(`Correo pedido ${maskPii ? maskEmail(em) : em}`);
  }
  if (typeof obj.source === "string" && obj.source.trim()) {
    parts.push(`Origen ${obj.source.trim()}`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

async function computeContactMetricsMap(contactIds: string[]): Promise<
  Map<
    string,
    {
      paidOrdersCount: number;
      totalOrdersCount: number;
      netLtvCents: number;
      openCareCount: number;
    }
  >
> {
  const uniqueIds = Array.from(new Set(contactIds.filter(Boolean)));
  const result = new Map<
    string,
    {
      paidOrdersCount: number;
      totalOrdersCount: number;
      netLtvCents: number;
      openCareCount: number;
    }
  >();
  if (uniqueIds.length === 0) return result;

  for (const id of uniqueIds) {
    result.set(id, {
      paidOrdersCount: 0,
      totalOrdersCount: 0,
      netLtvCents: 0,
      openCareCount: 0,
    });
  }

  const [orders, openTickets, openWarranties, openRetracts] = await Promise.all([
    prisma.order.findMany({
      where: { contactId: { in: uniqueIds }, deletedAt: null },
      select: {
        contactId: true,
        status: true,
        subtotal: true,
        discount: true,
        loyaltyDiscount: true,
      },
    }),
    prisma.supportTicket.groupBy({
      by: ["contactId"],
      where: {
        contactId: { in: uniqueIds },
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      _count: { _all: true },
    }),
    prisma.warrantyClaim.groupBy({
      by: ["contactId"],
      where: {
        contactId: { in: uniqueIds },
        status: { in: ["PENDING", "IN_REVIEW", "APPROVED"] },
      },
      _count: { _all: true },
    }),
    prisma.retractRequest.groupBy({
      by: ["contactId"],
      where: {
        contactId: { in: uniqueIds },
        status: { in: ["PENDING", "APPROVED", "RECEIVED"] },
      },
      _count: { _all: true },
    }),
  ]);

  const paidStatuses = new Set<string>(PAID_ORDER_STATUSES);

  for (const order of orders) {
    if (!order.contactId) continue;
    const entry = result.get(order.contactId);
    if (!entry) continue;
    entry.totalOrdersCount += 1;
    if (paidStatuses.has(order.status)) {
      entry.paidOrdersCount += 1;
      entry.netLtvCents += Math.max(0, order.subtotal - order.discount - order.loyaltyDiscount);
    }
  }

  for (const row of openTickets) {
    if (!row.contactId) continue;
    const entry = result.get(row.contactId);
    if (entry) entry.openCareCount += row._count._all;
  }
  for (const row of openWarranties) {
    if (!row.contactId) continue;
    const entry = result.get(row.contactId);
    if (entry) entry.openCareCount += row._count._all;
  }
  for (const row of openRetracts) {
    if (!row.contactId) continue;
    const entry = result.get(row.contactId);
    if (entry) entry.openCareCount += row._count._all;
  }

  return result;
}

const CONTACT_SUMMARY_SELECT = {
  id: true,
  displayName: true,
  primaryEmail: true,
  primaryPhoneE164: true,
  documentType: true,
  documentNumber: true,
  source: true,
  deletedAt: true,
  createdAt: true,
  organization: {
    select: { name: true },
  },
  customer: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      loyaltyPoints: true,
      deletedAt: true,
    },
  },
  identities: {
    where: { verificationStatus: { not: "REVOKED" as const } },
    select: {
      type: true,
      normalizedValue: true,
      verificationStatus: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.ContactSelect;

type RawContactForSummary = Prisma.ContactGetPayload<{
  select: typeof CONTACT_SUMMARY_SELECT;
}>;

function mapContactSummary(
  c: RawContactForSummary,
  metrics: {
    paidOrdersCount: number;
    totalOrdersCount: number;
    netLtvCents: number;
    openCareCount: number;
  },
  maskPii: boolean,
): MergeContactSummary {
  const activeCustomer = c.customer && c.customer.deletedAt === null ? c.customer : null;
  const customerName = activeCustomer
    ? [activeCustomer.firstName, activeCustomer.lastName].filter(Boolean).join(" ").trim()
    : "";
  const rawName = c.displayName?.trim() || customerName || "Contacto sin nombre";

  const rawDocLabel =
    c.documentType && c.documentNumber ? `${c.documentType} ${c.documentNumber}` : null;

  const verifiedEmails: string[] = [];
  const observedEmails: string[] = [];
  const phones: string[] = [];

  for (const ident of c.identities) {
    if (ident.type === "EMAIL") {
      const formatted = maskPii ? maskEmail(ident.normalizedValue) : ident.normalizedValue;
      if (ident.verificationStatus === "VERIFIED") {
        verifiedEmails.push(formatted);
      } else {
        observedEmails.push(formatted);
      }
    } else if (ident.type === "PHONE" || ident.type === "WHATSAPP") {
      const formatted = maskPii ? maskPhone(ident.normalizedValue) : ident.normalizedValue;
      if (!phones.includes(formatted)) phones.push(formatted);
    }
  }

  return {
    id: c.id,
    displayName: maskPii ? maskPersonName(rawName) : rawName,
    primaryEmail: c.primaryEmail ? (maskPii ? maskEmail(c.primaryEmail) : c.primaryEmail) : null,
    primaryPhoneE164: c.primaryPhoneE164
      ? maskPii
        ? maskPhone(c.primaryPhoneE164)
        : c.primaryPhoneE164
      : null,
    documentLabel:
      c.documentType && c.documentNumber
        ? maskPii
          ? maskTaxDocument(c.documentType, c.documentNumber)
          : rawDocLabel
        : null,
    source: c.source,
    organizationName: c.organization?.name ?? null,
    hasActiveCustomerAccount: Boolean(activeCustomer),
    customerId: activeCustomer?.id ?? null,
    customerEmail: activeCustomer?.email
      ? maskPii
        ? maskEmail(activeCustomer.email)
        : activeCustomer.email
      : null,
    loyaltyPoints: activeCustomer?.loyaltyPoints ?? 0,
    verifiedEmails,
    observedEmails,
    phones,
    paidOrdersCount: metrics.paidOrdersCount,
    totalOrdersCount: metrics.totalOrdersCount,
    netLtvCents: metrics.netLtvCents,
    openCareCount: metrics.openCareCount,
    deletedAt: c.deletedAt,
    createdAt: c.createdAt,
  };
}

/**
 * Lista los candidatos de fusión en `/admin/clientes/duplicados` con resumen lado a lado,
 * estado de cuentas autenticadas y recomendación determinista de sobreviviente.
 */
export async function listMergeCandidatesForActor(
  opts: {
    status?: MergeCandidateStatus;
    page?: number;
    pageSize?: number;
  },
  actorRole: AdminRole,
): Promise<MergeCandidateListResult> {
  const status: MergeCandidateStatus = opts.status ?? "PENDING";
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? PAGE_SIZE));
  const maskPii = !hasCapability(actorRole, "contacts:read_pii");

  // Para candidatos PENDING solo mostramos pares donde ambos contactos sigan activos.
  const where: Prisma.IdentityMergeCandidateWhereInput =
    status === "PENDING"
      ? {
          status: "PENDING",
          primaryContact: { deletedAt: null, anonymizedAt: null },
          secondaryContact: { deletedAt: null, anonymizedAt: null },
        }
      : { status };

  const [rows, total, pendingCount, approvedCount, rejectedCount] = await Promise.all([
    prisma.identityMergeCandidate.findMany({
      where,
      orderBy: status === "PENDING" ? { createdAt: "desc" } : { reviewedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        status: true,
        reasonCode: true,
        reasonCodes: true,
        evidenceJson: true,
        reviewedAt: true,
        reviewNote: true,
        mergeSnapshotJson: true,
        createdAt: true,
        reviewedByAdmin: {
          select: { email: true },
        },
        primaryContact: { select: CONTACT_SUMMARY_SELECT },
        secondaryContact: { select: CONTACT_SUMMARY_SELECT },
      },
    }),
    prisma.identityMergeCandidate.count({ where }),
    prisma.identityMergeCandidate.count({
      where: {
        status: "PENDING",
        primaryContact: { deletedAt: null, anonymizedAt: null },
        secondaryContact: { deletedAt: null, anonymizedAt: null },
      },
    }),
    prisma.identityMergeCandidate.count({ where: { status: "APPROVED" } }),
    prisma.identityMergeCandidate.count({ where: { status: "REJECTED" } }),
  ]);

  const allContactIds = rows.flatMap((r) => [r.primaryContact.id, r.secondaryContact.id]);
  const metricsMap = await computeContactMetricsMap(allContactIds);

  const emptyMetrics = {
    paidOrdersCount: 0,
    totalOrdersCount: 0,
    netLtvCents: 0,
    openCareCount: 0,
  };

  const items: MergeCandidateItem[] = rows.map((row) => {
    const primarySummary = mapContactSummary(
      row.primaryContact,
      metricsMap.get(row.primaryContact.id) ?? emptyMetrics,
      maskPii,
    );
    const secondarySummary = mapContactSummary(
      row.secondaryContact,
      metricsMap.get(row.secondaryContact.id) ?? emptyMetrics,
      maskPii,
    );

    const bothHaveActiveCustomerAccounts =
      primarySummary.hasActiveCustomerAccount && secondarySummary.hasActiveCustomerAccount;

    const forcedSurvivorContactId = bothHaveActiveCustomerAccounts
      ? null
      : primarySummary.hasActiveCustomerAccount
        ? primarySummary.id
        : secondarySummary.hasActiveCustomerAccount
          ? secondarySummary.id
          : null;

    const recommendedSurvivorContactId =
      forcedSurvivorContactId ??
      (secondarySummary.paidOrdersCount > primarySummary.paidOrdersCount
        ? secondarySummary.id
        : secondarySummary.paidOrdersCount === primarySummary.paidOrdersCount &&
            secondarySummary.createdAt < primarySummary.createdAt
          ? secondarySummary.id
          : primarySummary.id);

    const rawCodes =
      row.reasonCodes.length > 0 ? row.reasonCodes : [row.reasonCode].filter(Boolean);
    const uniqueCodes = Array.from(new Set(rawCodes));

    const snapshotObj =
      row.mergeSnapshotJson &&
      typeof row.mergeSnapshotJson === "object" &&
      !Array.isArray(row.mergeSnapshotJson)
        ? (row.mergeSnapshotJson as Record<string, unknown>)
        : null;

    const mergedSurvivorContactId =
      typeof snapshotObj?.survivorContactId === "string" ? snapshotObj.survivorContactId : null;

    return {
      id: row.id,
      status: row.status,
      reasonCodes: uniqueCodes.map((code) => ({
        code,
        label: formatMergeReasonLabel(code),
      })),
      evidenceSummary: summarizeEvidence(row.evidenceJson, maskPii),
      primaryContact: primarySummary,
      secondaryContact: secondarySummary,
      bothHaveActiveCustomerAccounts,
      forcedSurvivorContactId,
      recommendedSurvivorContactId,
      reviewedByLabel: row.reviewedByAdmin ? row.reviewedByAdmin.email : null,
      reviewedAt: row.reviewedAt,
      reviewNote: row.reviewNote,
      mergedSurvivorContactId,
      createdAt: row.createdAt,
    };
  });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts: {
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
    },
    piiMasked: maskPii,
  };
}

async function moveOptionalDelegateContactIdsTx(
  tx: Prisma.TransactionClient,
  delegateName: "contactActivity" | "task" | "opportunity",
  absorbedContactId: string,
  survivorContactId: string,
): Promise<string[]> {
  const delegate = (tx as unknown as Record<string, unknown>)[delegateName] as
    | {
        findMany?: (args: {
          where: { contactId: string };
          select: { id: true };
        }) => Promise<Array<{ id: string }>>;
        updateMany?: (args: {
          where: { contactId: string };
          data: { contactId: string };
        }) => Promise<{ count: number }>;
      }
    | undefined;

  if (
    !delegate ||
    typeof delegate.findMany !== "function" ||
    typeof delegate.updateMany !== "function"
  ) {
    return [];
  }

  const found = await delegate.findMany({
    where: { contactId: absorbedContactId },
    select: { id: true },
  });
  if (found.length === 0) return [];

  await delegate.updateMany({
    where: { contactId: absorbedContactId },
    data: { contactId: survivorContactId },
  });

  return found.map((r) => r.id);
}

/**
 * Ejecuta la fusión aprobada por un humano dentro de una transacción serializada
 * con `pg_advisory_xact_lock` y snapshot reversible completo.
 */
export async function mergeContactsByHumanApproval(input: {
  candidateId: string;
  survivorContactId: string;
  actorAdminId: string;
  note?: string | null;
}): Promise<{
  candidateId: string;
  survivorContactId: string;
  absorbedContactId: string;
  movedCounts: Record<string, number>;
}> {
  const candidateId = input.candidateId.trim();
  const requestedSurvivorId = input.survivorContactId.trim();
  const cleanNote = input.note?.trim().slice(0, 500) || null;

  if (!candidateId || !requestedSurvivorId) {
    throw new MergeValidationError(
      "INVALID_SURVIVOR",
      "Debes seleccionar el contacto sobreviviente para completar la fusión.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const candidate = await tx.identityMergeCandidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        primaryContactId: true,
        secondaryContactId: true,
        status: true,
      },
    });

    if (!candidate) {
      throw new MergeValidationError(
        "NOT_FOUND",
        "El candidato de fusión no existe o ya fue retirado.",
      );
    }

    const sortedContactIds = [candidate.primaryContactId, candidate.secondaryContactId].sort();
    for (const cid of sortedContactIds) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${MERGE_LOCK_NS}), hashtext(${cid}))`;
    }

    // Relectura bajo lock para impedir doble fusión concurrente.
    const lockedCandidate = await tx.identityMergeCandidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        primaryContactId: true,
        secondaryContactId: true,
        status: true,
      },
    });

    if (!lockedCandidate || lockedCandidate.status !== "PENDING") {
      throw new MergeValidationError(
        "ALREADY_REVIEWED",
        "Este candidato de fusión ya fue revisado por otro administrador.",
      );
    }

    if (
      requestedSurvivorId !== lockedCandidate.primaryContactId &&
      requestedSurvivorId !== lockedCandidate.secondaryContactId
    ) {
      throw new MergeValidationError(
        "INVALID_SURVIVOR",
        "El contacto elegido no pertenece a este par candidato.",
      );
    }

    const [primary, secondary] = await Promise.all([
      tx.contact.findUnique({
        where: { id: lockedCandidate.primaryContactId },
        include: {
          customer: { select: { id: true, deletedAt: true } },
          identities: true,
        },
      }),
      tx.contact.findUnique({
        where: { id: lockedCandidate.secondaryContactId },
        include: {
          customer: { select: { id: true, deletedAt: true } },
          identities: true,
        },
      }),
    ]);

    if (
      !primary ||
      !secondary ||
      primary.deletedAt !== null ||
      secondary.deletedAt !== null ||
      primary.anonymizedAt !== null ||
      secondary.anonymizedAt !== null
    ) {
      throw new MergeValidationError(
        "CONTACT_INACTIVE",
        "Uno de los contactos ya fue archivado o anonimizado; no se puede fusionar.",
      );
    }

    const primaryHasActiveCustomer = Boolean(
      primary.customer && primary.customer.deletedAt === null,
    );
    const secondaryHasActiveCustomer = Boolean(
      secondary.customer && secondary.customer.deletedAt === null,
    );

    if (primaryHasActiveCustomer && secondaryHasActiveCustomer) {
      throw new MergeValidationError(
        "BOTH_HAVE_CUSTOMER_ACCOUNTS",
        "Ambos contactos tienen cuentas autenticadas independientes. Por seguridad de sesiones y Puntos Lucams, no se pueden fusionar automáticamente.",
      );
    }

    if (primaryHasActiveCustomer && requestedSurvivorId !== primary.id) {
      throw new MergeValidationError(
        "INVALID_SURVIVOR",
        "El contacto con cuenta autenticada debe mantenerse como contacto principal.",
      );
    }

    if (secondaryHasActiveCustomer && requestedSurvivorId !== secondary.id) {
      throw new MergeValidationError(
        "INVALID_SURVIVOR",
        "El contacto con cuenta autenticada debe mantenerse como contacto principal.",
      );
    }

    const survivor = requestedSurvivorId === primary.id ? primary : secondary;
    const absorbed = requestedSurvivorId === primary.id ? secondary : primary;
    const now = new Date();

    // Capturar IDs afectados para el snapshot reversible antes de mover FKs.
    const [
      ordersToMove,
      ticketsToMove,
      quotesToMove,
      cartsToMove,
      consentsToMove,
      warrantiesToMove,
      retractsToMove,
    ] = await Promise.all([
      tx.order.findMany({ where: { contactId: absorbed.id }, select: { id: true } }),
      tx.supportTicket.findMany({ where: { contactId: absorbed.id }, select: { id: true } }),
      tx.quote.findMany({ where: { contactId: absorbed.id }, select: { id: true } }),
      tx.abandonedCart.findMany({ where: { contactId: absorbed.id }, select: { id: true } }),
      tx.consent.findMany({ where: { contactId: absorbed.id }, select: { id: true } }),
      tx.warrantyClaim.findMany({ where: { contactId: absorbed.id }, select: { id: true } }),
      tx.retractRequest.findMany({ where: { contactId: absorbed.id }, select: { id: true } }),
    ]);

    await Promise.all([
      tx.order.updateMany({
        where: { contactId: absorbed.id },
        data: { contactId: survivor.id },
      }),
      tx.supportTicket.updateMany({
        where: { contactId: absorbed.id },
        data: { contactId: survivor.id },
      }),
      tx.quote.updateMany({
        where: { contactId: absorbed.id },
        data: { contactId: survivor.id },
      }),
      tx.abandonedCart.updateMany({
        where: { contactId: absorbed.id },
        data: { contactId: survivor.id },
      }),
      tx.consent.updateMany({
        where: { contactId: absorbed.id },
        data: { contactId: survivor.id },
      }),
      tx.warrantyClaim.updateMany({
        where: { contactId: absorbed.id },
        data: { contactId: survivor.id },
      }),
      tx.retractRequest.updateMany({
        where: { contactId: absorbed.id },
        data: { contactId: survivor.id },
      }),
    ]);

    const [movedActivities, movedTasks, movedOpportunities] = await Promise.all([
      moveOptionalDelegateContactIdsTx(tx, "contactActivity", absorbed.id, survivor.id),
      moveOptionalDelegateContactIdsTx(tx, "task", absorbed.id, survivor.id),
      moveOptionalDelegateContactIdsTx(tx, "opportunity", absorbed.id, survivor.id),
    ]);

    // Si el absorbido tenía un Customer ya eliminado lógicamente, desacoplamos su FK única.
    let detachedSoftDeletedCustomerId: string | null = null;
    if (absorbed.customer && absorbed.customer.deletedAt !== null) {
      detachedSoftDeletedCustomerId = absorbed.customer.id;
      await tx.customer.update({
        where: { id: absorbed.customer.id },
        data: { contactId: null },
      });
    }

    // 1) Revocar primero las identidades del absorbido para liberar el índice único parcial
    //    `ContactIdentity_unique_owner_key` antes de transferirlas al sobreviviente.
    const absorbedIdentitiesSnapshot = absorbed.identities.map((ident) => ({
      id: ident.id,
      type: ident.type,
      normalizedValue: ident.normalizedValue,
      verificationStatus: ident.verificationStatus,
      verifiedAt: ident.verifiedAt ? ident.verifiedAt.toISOString() : null,
      verificationSource: ident.verificationSource,
    }));

    if (absorbed.identities.length > 0) {
      await tx.contactIdentity.updateMany({
        where: { contactId: absorbed.id, verificationStatus: { not: "REVOKED" } },
        data: { verificationStatus: "REVOKED" },
      });
    }

    for (const ident of absorbed.identities) {
      if (ident.verificationStatus === "REVOKED") continue;
      if (ident.type === "SUPABASE_USER") continue;
      await upsertContactIdentityTx(tx, {
        contactId: survivor.id,
        type: ident.type,
        normalizedValue: ident.normalizedValue,
        verificationStatus: ident.verificationStatus,
        verificationSource: ident.verificationSource ?? "CONTACT_MERGE",
        now,
      });
    }

    // 2) Archivar lógicamente (`deletedAt`) el contacto absorbido ANTES de enriquecer
    //    `survivor.primaryEmail` para no chocar con `Contact_primaryEmail_active_key`.
    await tx.contact.update({
      where: { id: absorbed.id },
      data: {
        deletedAt: now,
        deletedBy: input.actorAdminId,
        updatedBy: input.actorAdminId,
      },
    });

    // 3) Enriquecer campos faltantes en el sobreviviente sin sobrescribir valores ya presentes.
    const survivorPatch: Prisma.ContactUncheckedUpdateInput = {
      updatedBy: input.actorAdminId,
    };
    if (!survivor.primaryEmail && absorbed.primaryEmail) {
      survivorPatch.primaryEmail = absorbed.primaryEmail;
    }
    if (!survivor.primaryPhoneE164 && absorbed.primaryPhoneE164) {
      survivorPatch.primaryPhoneE164 = absorbed.primaryPhoneE164;
    }
    if (!survivor.displayName && absorbed.displayName) {
      survivorPatch.displayName = absorbed.displayName;
    }
    if (!survivor.documentNumber && absorbed.documentType && absorbed.documentNumber) {
      survivorPatch.documentType = absorbed.documentType;
      survivorPatch.documentNumber = absorbed.documentNumber;
    }
    if (!survivor.organizationId && absorbed.organizationId) {
      survivorPatch.organizationId = absorbed.organizationId;
    }
    if (!survivor.ownerAdminId && absorbed.ownerAdminId) {
      survivorPatch.ownerAdminId = absorbed.ownerAdminId;
    }

    await tx.contact.update({
      where: { id: survivor.id },
      data: survivorPatch,
    });

    const snapshot: MergeSnapshotPayload = {
      version: 1,
      mergedAt: now.toISOString(),
      actorAdminId: input.actorAdminId,
      survivorContactId: survivor.id,
      absorbedContactId: absorbed.id,
      absorbedContactBefore: {
        primaryEmail: absorbed.primaryEmail,
        primaryPhoneE164: absorbed.primaryPhoneE164,
        displayName: absorbed.displayName,
        documentType: absorbed.documentType,
        documentNumber: absorbed.documentNumber,
        organizationId: absorbed.organizationId,
        ownerAdminId: absorbed.ownerAdminId,
        source: absorbed.source,
        detachedSoftDeletedCustomerId,
      },
      survivorContactBefore: {
        primaryEmail: survivor.primaryEmail,
        primaryPhoneE164: survivor.primaryPhoneE164,
        displayName: survivor.displayName,
        documentType: survivor.documentType,
        documentNumber: survivor.documentNumber,
        organizationId: survivor.organizationId,
        ownerAdminId: survivor.ownerAdminId,
      },
      absorbedIdentitiesBefore: absorbedIdentitiesSnapshot,
      movedEntityIds: {
        orders: ordersToMove.map((r) => r.id),
        supportTickets: ticketsToMove.map((r) => r.id),
        quotes: quotesToMove.map((r) => r.id),
        abandonedCarts: cartsToMove.map((r) => r.id),
        consents: consentsToMove.map((r) => r.id),
        warrantyClaims: warrantiesToMove.map((r) => r.id),
        retractRequests: retractsToMove.map((r) => r.id),
        contactActivities: movedActivities,
        tasks: movedTasks,
        opportunities: movedOpportunities,
      },
    };

    await tx.identityMergeCandidate.update({
      where: { id: lockedCandidate.id },
      data: {
        status: "APPROVED",
        reviewedByAdminId: input.actorAdminId,
        reviewedAt: now,
        reviewNote: cleanNote,
        mergeSnapshotJson: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    // Re-apuntar cualquier otro candidato PENDING que involucrara al absorbido hacia el sobreviviente.
    const otherPendingCandidates = await tx.identityMergeCandidate.findMany({
      where: {
        id: { not: lockedCandidate.id },
        status: "PENDING",
        OR: [{ primaryContactId: absorbed.id }, { secondaryContactId: absorbed.id }],
      },
      select: {
        id: true,
        primaryContactId: true,
        secondaryContactId: true,
        reasonCode: true,
        reasonCodes: true,
        evidenceJson: true,
      },
    });

    for (const other of otherPendingCandidates) {
      const thirdContactId =
        other.primaryContactId === absorbed.id ? other.secondaryContactId : other.primaryContactId;

      await tx.identityMergeCandidate.delete({ where: { id: other.id } });

      if (thirdContactId && thirdContactId !== survivor.id) {
        const codes = other.reasonCodes.length > 0 ? other.reasonCodes : [other.reasonCode];
        for (const code of codes) {
          await enqueueMergeCandidateTx(tx, {
            contactIdA: survivor.id,
            contactIdB: thirdContactId,
            reasonCode: code as MergeReasonCode,
            evidence:
              other.evidenceJson &&
              typeof other.evidenceJson === "object" &&
              !Array.isArray(other.evidenceJson)
                ? (other.evidenceJson as Record<string, unknown>)
                : undefined,
          });
        }
      }
    }

    return {
      candidateId: lockedCandidate.id,
      survivorContactId: survivor.id,
      absorbedContactId: absorbed.id,
      movedCounts: {
        orders: ordersToMove.length,
        supportTickets: ticketsToMove.length,
        quotes: quotesToMove.length,
        abandonedCarts: cartsToMove.length,
        consents: consentsToMove.length,
        warrantyClaims: warrantiesToMove.length,
        retractRequests: retractsToMove.length,
        contactActivities: movedActivities.length,
        tasks: movedTasks.length,
        opportunities: movedOpportunities.length,
      },
    };
  });
}

/**
 * Rechaza un candidato de fusión marcando el par como *do-not-suggest* permanente (`REJECTED`).
 */
export async function rejectMergeCandidate(input: {
  candidateId: string;
  actorAdminId: string;
  note?: string | null;
}): Promise<{
  candidateId: string;
  primaryContactId: string;
  secondaryContactId: string;
}> {
  const candidateId = input.candidateId.trim();
  const cleanNote = input.note?.trim().slice(0, 500) || null;

  if (!candidateId) {
    throw new MergeValidationError("NOT_FOUND", "Candidato inválido.");
  }

  const existing = await prisma.identityMergeCandidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      primaryContactId: true,
      secondaryContactId: true,
      status: true,
    },
  });

  if (!existing) {
    throw new MergeValidationError(
      "NOT_FOUND",
      "El candidato de fusión no existe o ya fue retirado.",
    );
  }

  if (existing.status !== "PENDING") {
    throw new MergeValidationError(
      "ALREADY_REVIEWED",
      "Este candidato de fusión ya fue revisado por otro administrador.",
    );
  }

  await prisma.identityMergeCandidate.update({
    where: { id: existing.id },
    data: {
      status: "REJECTED",
      reviewedByAdminId: input.actorAdminId,
      reviewedAt: new Date(),
      reviewNote: cleanNote,
    },
  });

  return {
    candidateId: existing.id,
    primaryContactId: existing.primaryContactId,
    secondaryContactId: existing.secondaryContactId,
  };
}
