/*
 * Motor progresivo e idempotente de Backfill hacia `Contact` (S16 · Fase 7 · ADR-193).
 *
 * Garantías operativas y de seguridad:
 *   1. Paginación estricta por cursor (`id > cursor`, `take = batchSize`, default 200):
 *      jamás abre una transacción monolítica de tabla completa que bloquee el checkout vivo.
 *   2. Modo `--dry-run` (`apply: false`) garantizado en PostgreSQL con
 *      `set_config('transaction_read_only', 'on', true)` (cero mutaciones posibles).
 *   3. Idempotencia estricta: filtra `contactId IS NULL` y excluye registros anonimizados
 *      Ley 1581 (`@deleted.lucamsshop.com` / `deletedAt IS NOT NULL`) y cookies anónimas;
 *      una segunda o tercera corrida produce exactamente `0` escrituras (`totalMutations = 0`).
 *   4. Aislamiento absoluto de regalos (`Order.isGift = true` / destinatarios terceros) y
 *      detección histórica `[ID-01]` (`HISTORICAL_ID01_EMAIL_MISMATCH`) sin auto-merge.
 *   5. Cero PII en el reporte de reconciliación (solo conteos agregados).
 */

import {
  isAnonymizedPlaceholderEmail,
  normalizeEmailIdentity,
  normalizePhoneE164,
  normalizeTaxDocKey,
} from "./identity-dry-run.mjs";

const ADVISORY_LOCK_NS = "lucams_contact_identity_v1";
const BACKFILL_TX_OPTS = { maxWait: 15_000, timeout: 60_000 };

/**
 * @param {string} a
 * @param {string} b
 * @returns {[string, string] | null}
 */
function canonicalPair(a, b) {
  const x = (a ?? "").trim();
  const y = (b ?? "").trim();
  if (!x || !y || x === y) return null;
  return x < y ? [x, y] : [y, x];
}

/**
 * @param {string | null | undefined} firstName
 * @param {string | null | undefined} lastName
 * @param {string | null | undefined} fallbackFull
 * @returns {string | null}
 */
function buildDisplayName(firstName, lastName, fallbackFull) {
  const parts = [firstName?.trim(), lastName?.trim()].filter(Boolean);
  if (parts.length > 0) return parts.join(" ").slice(0, 140);
  const full = fallbackFull?.trim();
  if (full && full !== "Cliente" && full !== "Cliente eliminado") {
    return full.slice(0, 140);
  }
  return null;
}

/**
 * @param {string | null | undefined} docType
 * @param {string | null | undefined} docNumber
 */
function parseTaxDoc(docType, docNumber) {
  const key = normalizeTaxDocKey(docType, docNumber);
  if (!key) return null;
  const idx = key.indexOf(":");
  return {
    documentType: /** @type {any} */ (key.slice(0, idx)),
    documentNumber: key.slice(idx + 1),
  };
}

/**
 * @param {any} tx
 * @param {Array<string | null | undefined>} keys
 */
async function acquireLocksTx(tx, keys) {
  if (typeof tx.$executeRaw !== "function") return;
  const sorted = Array.from(new Set(keys.map((k) => k?.trim()).filter(Boolean))).sort();
  for (const key of sorted) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ADVISORY_LOCK_NS}), hashtext(${key}))`;
  }
}

/**
 * @param {any} tx
 * @param {{
 *   contactId: string,
 *   type: "SUPABASE_USER" | "EMAIL" | "PHONE" | "WHATSAPP",
 *   normalizedValue: string,
 *   verificationStatus: "VERIFIED" | "UNVERIFIED_OBSERVED",
 *   verificationSource: string,
 *   counters: any
 * }} params
 */
async function upsertIdentityBackfillTx(tx, params) {
  const value = params.normalizedValue.trim();
  if (!value) return;
  const now = new Date();

  if (params.type === "SUPABASE_USER" || params.type === "EMAIL") {
    const existingOwner = await tx.contactIdentity.findFirst({
      where: {
        type: params.type,
        normalizedValue: value,
        verificationStatus: { not: "REVOKED" },
      },
      select: { id: true, contactId: true, verificationStatus: true, verifiedAt: true },
    });
    if (existingOwner && existingOwner.contactId !== params.contactId) {
      return;
    }
    if (existingOwner) {
      if (
        existingOwner.verificationStatus !== "VERIFIED" &&
        params.verificationStatus === "VERIFIED"
      ) {
        await tx.contactIdentity.update({
          where: { id: existingOwner.id },
          data: {
            verificationStatus: "VERIFIED",
            verifiedAt: existingOwner.verifiedAt ?? now,
            verificationSource: params.verificationSource,
            lastSeenAt: now,
          },
        });
        params.counters.identitiesUpdated += 1;
      }
      return;
    }
  }

  const sameRow = await tx.contactIdentity.findUnique({
    where: {
      contactId_type_normalizedValue: {
        contactId: params.contactId,
        type: params.type,
        normalizedValue: value,
      },
    },
    select: { id: true, verificationStatus: true, verifiedAt: true },
  });

  if (sameRow) {
    if (sameRow.verificationStatus !== "VERIFIED" && params.verificationStatus === "VERIFIED") {
      await tx.contactIdentity.update({
        where: { id: sameRow.id },
        data: {
          verificationStatus: "VERIFIED",
          verifiedAt: sameRow.verifiedAt ?? now,
          verificationSource: params.verificationSource,
          lastSeenAt: now,
        },
      });
      params.counters.identitiesUpdated += 1;
    }
    return;
  }

  await tx.contactIdentity.create({
    data: {
      contactId: params.contactId,
      type: params.type,
      normalizedValue: value,
      verificationStatus: params.verificationStatus,
      verifiedAt: params.verificationStatus === "VERIFIED" ? now : null,
      verificationSource: params.verificationSource,
      firstSeenAt: now,
      lastSeenAt: now,
    },
  });
  params.counters.identitiesCreated += 1;
}

/**
 * @param {any} tx
 * @param {{
 *   contactIdA: string,
 *   contactIdB: string,
 *   reasonCode: string,
 *   evidence: Record<string, unknown>,
 *   counters: any
 * }} params
 */
async function enqueueCandidateBackfillTx(tx, params) {
  const pair = canonicalPair(params.contactIdA, params.contactIdB);
  if (!pair) return;
  const [primaryContactId, secondaryContactId] = pair;

  await acquireLocksTx(tx, [`merge:${primaryContactId}:${secondaryContactId}`]);

  const existing = await tx.identityMergeCandidate.findFirst({
    where: {
      OR: [
        { primaryContactId, secondaryContactId },
        { primaryContactId: secondaryContactId, secondaryContactId: primaryContactId },
      ],
    },
    select: { id: true, status: true, reasonCode: true, reasonCodes: true, evidenceJson: true },
  });

  if (existing) {
    if (existing.status === "REJECTED" || existing.status === "APPROVED") return;
    const prevSet = new Set([existing.reasonCode, ...(existing.reasonCodes ?? [])]);
    if (prevSet.has(params.reasonCode)) return;
    const mergedReasons = Array.from(new Set([...prevSet, params.reasonCode]));
    const prevEv =
      existing.evidenceJson &&
      typeof existing.evidenceJson === "object" &&
      !Array.isArray(existing.evidenceJson)
        ? existing.evidenceJson
        : {};
    await tx.identityMergeCandidate.update({
      where: { id: existing.id },
      data: {
        reasonCodes: mergedReasons,
        evidenceJson: { ...prevEv, ...params.evidence },
      },
    });
    params.counters.mergeCandidatesUpdated += 1;
    return;
  }

  await tx.identityMergeCandidate.create({
    data: {
      primaryContactId,
      secondaryContactId,
      reasonCode: params.reasonCode,
      reasonCodes: [params.reasonCode],
      status: "PENDING",
      evidenceJson: params.evidence,
    },
  });
  params.counters.mergeCandidatesCreated += 1;
}

/**
 * @param {any} tx
 * @param {{
 *   contactId: string,
 *   buyerPhoneE164: string | null,
 *   taxDoc: { documentType: any, documentNumber: string } | null,
 *   source: string,
 *   counters: any
 * }} params
 */
async function evaluateSignalsBackfillTx(tx, params) {
  if (params.buyerPhoneE164) {
    const others = await tx.contactIdentity.findMany({
      where: {
        type: "PHONE",
        normalizedValue: params.buyerPhoneE164,
        verificationStatus: { not: "REVOKED" },
        contactId: { not: params.contactId },
        contact: { deletedAt: null, anonymizedAt: null },
      },
      select: { contactId: true },
      take: 5,
    });
    const ids = Array.from(new Set(others.map((o) => o.contactId)));
    for (const otherId of ids) {
      await enqueueCandidateBackfillTx(tx, {
        contactIdA: params.contactId,
        contactIdB: otherId,
        reasonCode: "SAME_BUYER_PHONE_E164",
        evidence: { signal: "PHONE", source: params.source },
        counters: params.counters,
      });
    }
  }

  if (params.taxDoc) {
    const others = await tx.contact.findMany({
      where: {
        id: { not: params.contactId },
        documentType: params.taxDoc.documentType,
        documentNumber: params.taxDoc.documentNumber,
        deletedAt: null,
        anonymizedAt: null,
      },
      select: { id: true },
      take: 5,
    });
    for (const other of others) {
      await enqueueCandidateBackfillTx(tx, {
        contactIdA: params.contactId,
        contactIdB: other.id,
        reasonCode: "SAME_BILLING_DOCUMENT",
        evidence: {
          signal: "TAX_DOCUMENT",
          documentType: params.taxDoc.documentType,
          source: params.source,
        },
        counters: params.counters,
      });
    }
  }
}

/**
 * @param {any} tx
 * @param {string} email
 */
async function findContactByEmailTx(tx, email) {
  if (!email) return null;
  const byPrimary = await tx.contact.findFirst({
    where: { primaryEmail: email, deletedAt: null },
    select: {
      id: true,
      primaryEmail: true,
      primaryPhoneE164: true,
      displayName: true,
      documentType: true,
      documentNumber: true,
      source: true,
      customer: { select: { id: true } },
    },
  });
  if (byPrimary) return byPrimary;

  const byIdentity = await tx.contactIdentity.findFirst({
    where: {
      type: "EMAIL",
      normalizedValue: email,
      verificationStatus: { not: "REVOKED" },
      contact: { deletedAt: null },
    },
    select: {
      contact: {
        select: {
          id: true,
          primaryEmail: true,
          primaryPhoneE164: true,
          displayName: true,
          documentType: true,
          documentNumber: true,
          source: true,
          customer: { select: { id: true } },
        },
      },
    },
  });
  return byIdentity?.contact ?? null;
}

/**
 * @param {any} tx
 * @param {{
 *   email: string,
 *   source: string,
 *   displayName?: string | null,
 *   buyerPhoneE164?: string | null,
 *   whatsappE164?: string | null,
 *   taxDoc?: { documentType: any, documentNumber: string } | null,
 *   counters: any
 * }} params
 */
async function resolveOrCreateEmailBackfillTx(tx, params) {
  const email = normalizeEmailIdentity(params.email);
  if (!email) return null;

  await acquireLocksTx(tx, [`email:${email}`]);

  let contact = await findContactByEmailTx(tx, email);
  if (!contact) {
    contact = await tx.contact.create({
      data: {
        primaryEmail: email,
        primaryPhoneE164: params.buyerPhoneE164 ?? params.whatsappE164 ?? null,
        displayName: params.displayName ?? null,
        documentType: params.taxDoc?.documentType ?? null,
        documentNumber: params.taxDoc?.documentNumber ?? null,
        source: params.source,
      },
      select: {
        id: true,
        primaryEmail: true,
        primaryPhoneE164: true,
        displayName: true,
        documentType: true,
        documentNumber: true,
        source: true,
        customer: { select: { id: true } },
      },
    });
    params.counters.contactsCreated += 1;
  } else {
    const patch = {};
    if (!contact.primaryEmail) patch.primaryEmail = email;
    if (!contact.displayName && params.displayName) patch.displayName = params.displayName;
    if (!contact.primaryPhoneE164 && (params.buyerPhoneE164 || params.whatsappE164)) {
      patch.primaryPhoneE164 = params.buyerPhoneE164 ?? params.whatsappE164 ?? null;
    }
    if (!contact.documentType && !contact.documentNumber && params.taxDoc) {
      patch.documentType = params.taxDoc.documentType;
      patch.documentNumber = params.taxDoc.documentNumber;
    }
    if (Object.keys(patch).length > 0) {
      await tx.contact.update({ where: { id: contact.id }, data: patch });
      params.counters.contactsUpdated += 1;
    }
  }

  await upsertIdentityBackfillTx(tx, {
    contactId: contact.id,
    type: "EMAIL",
    normalizedValue: email,
    verificationStatus: "UNVERIFIED_OBSERVED",
    verificationSource: `BACKFILL_${params.source}`,
    counters: params.counters,
  });

  if (params.buyerPhoneE164) {
    await upsertIdentityBackfillTx(tx, {
      contactId: contact.id,
      type: "PHONE",
      normalizedValue: params.buyerPhoneE164,
      verificationStatus: "UNVERIFIED_OBSERVED",
      verificationSource: `BACKFILL_${params.source}`,
      counters: params.counters,
    });
  }

  if (params.whatsappE164) {
    await upsertIdentityBackfillTx(tx, {
      contactId: contact.id,
      type: "WHATSAPP",
      normalizedValue: params.whatsappE164,
      verificationStatus: "UNVERIFIED_OBSERVED",
      verificationSource: `BACKFILL_${params.source}`,
      counters: params.counters,
    });
  }

  if (params.buyerPhoneE164 || params.taxDoc) {
    await evaluateSignalsBackfillTx(tx, {
      contactId: contact.id,
      buyerPhoneE164: params.buyerPhoneE164 ?? null,
      taxDoc: params.taxDoc ?? null,
      source: `BACKFILL_${params.source}`,
      counters: params.counters,
    });
  }

  return contact.id;
}

/**
 * @param {any} tx
 * @param {{ whatsappE164: string, displayName?: string | null, counters: any }} params
 */
async function resolveOrCreateWhatsappOnlyBackfillTx(tx, params) {
  if (!params.whatsappE164) return null;
  await acquireLocksTx(tx, [`whatsapp:${params.whatsappE164}`]);

  const existing = await tx.contactIdentity.findFirst({
    where: {
      type: "WHATSAPP",
      normalizedValue: params.whatsappE164,
      verificationStatus: { not: "REVOKED" },
      contact: { deletedAt: null, anonymizedAt: null, primaryEmail: null },
    },
    orderBy: { createdAt: "asc" },
    select: { contactId: true },
  });

  if (existing) {
    return existing.contactId;
  }

  const created = await tx.contact.create({
    data: {
      primaryEmail: null,
      primaryPhoneE164: params.whatsappE164,
      displayName: params.displayName ?? null,
      source: "QUOTE",
    },
    select: { id: true },
  });
  params.counters.contactsCreated += 1;

  await upsertIdentityBackfillTx(tx, {
    contactId: created.id,
    type: "WHATSAPP",
    normalizedValue: params.whatsappE164,
    verificationStatus: "UNVERIFIED_OBSERVED",
    verificationSource: "BACKFILL_QUOTE",
    counters: params.counters,
  });

  return created.id;
}

/**
 * Construye filtros opcionales de acotamiento por prefijo (`scopePrefix`) para tests aislados.
 * Cuando `scopePrefix` está vacío/omitido, retorna `{}` (procesa toda la base).
 * @param {string | undefined} scopePrefix
 */
function buildScopeFilters(scopePrefix) {
  const p = scopePrefix?.trim();
  if (!p) {
    return {
      customer: {},
      order: {},
      supportTicket: {},
      quote: {},
      abandonedCart: {},
      consent: {},
      warrantyClaim: {},
      retractRequest: {},
    };
  }
  return {
    customer: { email: { startsWith: p, mode: "insensitive" } },
    order: { number: { contains: p, mode: "insensitive" } },
    supportTicket: { email: { startsWith: p, mode: "insensitive" } },
    quote: {
      OR: [
        { customerEmail: { startsWith: p, mode: "insensitive" } },
        { customerName: { startsWith: p, mode: "insensitive" } },
      ],
    },
    abandonedCart: { email: { startsWith: p, mode: "insensitive" } },
    consent: {
      OR: [
        { email: { startsWith: p, mode: "insensitive" } },
        { version: { startsWith: p } },
      ],
    },
    warrantyClaim: {
      orderItem: { order: { number: { contains: p, mode: "insensitive" } } },
    },
    retractRequest: {
      orderItem: { order: { number: { contains: p, mode: "insensitive" } } },
    },
  };
}

/**
 * Cuenta cuántas filas ELEGIBLES permanecen con `contactId IS NULL` en las 8 entidades.
 * Excluye filas soft-deleted, placeholders Ley 1581 (`@deleted.lucamsshop.com`) y
 * consentimientos de banner de cookies puramente anónimos.
 *
 * @param {any} db
 * @param {string | undefined} scopePrefix
 */
export async function countUnlinkedEligibleEntities(db, scopePrefix) {
  const scope = buildScopeFilters(scopePrefix);
  const ANON_SUFFIX = "@deleted.lucamsshop.com";

  const [
    customers,
    orders,
    supportTickets,
    quotes,
    abandonedCarts,
    consents,
    warrantyClaims,
    retractRequests,
  ] = await Promise.all([
    db.customer.count({
      where: {
        AND: [
          scope.customer,
          {
            contactId: null,
            deletedAt: null,
            NOT: [
              { email: { endsWith: ANON_SUFFIX, mode: "insensitive" } },
              { supabaseUserId: { startsWith: "deleted-" } },
            ],
          },
        ],
      },
    }),
    db.order.count({
      where: {
        AND: [
          scope.order,
          {
            contactId: null,
            deletedAt: null,
            NOT: { email: { endsWith: ANON_SUFFIX, mode: "insensitive" } },
          },
        ],
      },
    }),
    db.supportTicket.count({
      where: {
        AND: [
          scope.supportTicket,
          {
            contactId: null,
            NOT: [
              { email: { endsWith: ANON_SUFFIX, mode: "insensitive" } },
              { name: "Cliente eliminado" },
            ],
          },
        ],
      },
    }),
    db.quote.count({
      where: {
        AND: [
          scope.quote,
          {
            contactId: null,
            deletedAt: null,
            NOT: { customerName: "Cliente eliminado" },
            OR: [
              {
                AND: [
                  { customerEmail: { not: null } },
                  { NOT: { customerEmail: "" } },
                  { NOT: { customerEmail: { endsWith: ANON_SUFFIX, mode: "insensitive" } } },
                ],
              },
              {
                AND: [
                  { OR: [{ customerEmail: null }, { customerEmail: "" }] },
                  { NOT: { customerWhatsapp: "" } },
                ],
              },
            ],
          },
        ],
      },
    }),
    db.abandonedCart.count({
      where: {
        AND: [
          scope.abandonedCart,
          {
            contactId: null,
            NOT: [
              { email: "" },
              { email: { endsWith: ANON_SUFFIX, mode: "insensitive" } },
            ],
          },
        ],
      },
    }),
    db.consent.count({
      where: {
        AND: [
          scope.consent,
          {
            contactId: null,
            OR: [
              {
                customerId: { not: null },
                customer: {
                  deletedAt: null,
                  NOT: [
                    { email: { endsWith: ANON_SUFFIX, mode: "insensitive" } },
                    { supabaseUserId: { startsWith: "deleted-" } },
                  ],
                },
              },
              {
                AND: [
                  { email: { not: null } },
                  { NOT: { email: "" } },
                  { NOT: { email: { endsWith: ANON_SUFFIX, mode: "insensitive" } } },
                ],
              },
              {
                AND: [{ phone: { not: null } }, { NOT: { phone: "" } }],
              },
            ],
          },
        ],
      },
    }),
    db.warrantyClaim.count({
      where: {
        AND: [
          scope.warrantyClaim,
          {
            contactId: null,
            orderItem: {
              order: {
                deletedAt: null,
                NOT: { email: { endsWith: ANON_SUFFIX, mode: "insensitive" } },
              },
            },
          },
        ],
      },
    }),
    db.retractRequest.count({
      where: {
        AND: [
          scope.retractRequest,
          {
            contactId: null,
            orderItem: {
              order: {
                deletedAt: null,
                NOT: { email: { endsWith: ANON_SUFFIX, mode: "insensitive" } },
              },
            },
          },
        ],
      },
    }),
  ]);

  const unlinkedEligibleTotal =
    customers +
    orders +
    supportTickets +
    quotes +
    abandonedCarts +
    consents +
    warrantyClaims +
    retractRequests;

  return {
    customers,
    orders,
    supportTickets,
    quotes,
    abandonedCarts,
    consents,
    warrantyClaims,
    retractRequests,
    unlinkedEligibleTotal,
  };
}

/**
 * Ejecuta el backfill progresivo por lotes (`batchSize = 200` por defecto) hacia `Contact`.
 *  - `apply = false` (default): abre transacción `READ ONLY` verificada en PostgreSQL y calcula
 *    las filas elegibles pendientes sin escribir una sola tupla.
 *  - `apply = true`: procesa las 8 entidades en orden topológico mediante cursores `id > cursor`,
 *    encolando señales probables en `IdentityMergeCandidate` y verificando reconciliación final.
 *
 * @param {any} prisma
 * @param {{ apply?: boolean, batchSize?: number, scopePrefix?: string }} [options]
 */
export async function runContactsBackfill(prisma, options = {}) {
  const apply = Boolean(options.apply);
  const batchSize = Math.max(1, Math.min(1000, Math.trunc(options.batchSize ?? 200)));
  const scopePrefix = options.scopePrefix?.trim() || undefined;
  const startedAt = new Date().toISOString();

  const counters = {
    contactsCreated: 0,
    contactsUpdated: 0,
    identitiesCreated: 0,
    identitiesUpdated: 0,
    mergeCandidatesCreated: 0,
    mergeCandidatesUpdated: 0,
    entitiesLinked: {
      customers: 0,
      orders: 0,
      supportTickets: 0,
      quotes: 0,
      abandonedCarts: 0,
      consents: 0,
      warrantyClaims: 0,
      retractRequests: 0,
    },
    skipped: {
      anonymizedOrDeleted: 0,
      anonymousConsents: 0,
      giftOrdersIsolated: 0,
      historicalId01MismatchesQueued: 0,
    },
    batchesProcessed: 0,
  };

  if (!apply) {
    const pendingBefore = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('transaction_read_only', 'on', true)`;
      const check =
        await tx.$queryRaw`SELECT current_setting('transaction_read_only') AS ro`;
      const ro = Array.isArray(check) && check[0] ? check[0].ro : null;
      if (ro !== "on") {
        throw new Error("Fallo de seguridad: PostgreSQL no activó transaction_read_only=on");
      }
      return countUnlinkedEligibleEntities(tx, scopePrefix);
    }, BACKFILL_TX_OPTS);

    return {
      mode: /** @type {"DRY_RUN"} */ ("DRY_RUN"),
      readOnlyVerified: true,
      batchSize,
      startedAt,
      finishedAt: new Date().toISOString(),
      ...counters,
      totalMutations: 0,
      pendingBefore,
      reconciliationAfter: pendingBefore,
    };
  }

  const pendingBefore = await countUnlinkedEligibleEntities(prisma, scopePrefix);
  const scope = buildScopeFilters(scopePrefix);

  // ── Fase 1: Customer activos sin contactId ──
  {
    let cursor = undefined;
    while (true) {
      const batch = await prisma.customer.findMany({
        where: {
          ...scope.customer,
          contactId: null,
          deletedAt: null,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: batchSize,
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          supabaseUserId: true,
          documentType: true,
          documentNumber: true,
        },
      });
      if (batch.length === 0) break;
      counters.batchesProcessed += 1;
      cursor = batch[batch.length - 1].id;

      for (const cust of batch) {
        const email = normalizeEmailIdentity(cust.email);
        const uid = cust.supabaseUserId?.trim() ?? "";
        if (!email || isAnonymizedPlaceholderEmail(cust.email) || uid.startsWith("deleted-")) {
          counters.skipped.anonymizedOrDeleted += 1;
          continue;
        }

        await prisma.$transaction(async (tx) => {
          await acquireLocksTx(tx, [
            `cust:${cust.id}`,
            `email:${email}`,
            uid ? `sub:${uid}` : null,
          ]);

          const fresh = await tx.customer.findUnique({
            where: { id: cust.id },
            select: { contactId: true, deletedAt: true },
          });
          if (!fresh || fresh.deletedAt || fresh.contactId) return;

          const phoneE164 = normalizePhoneE164(cust.phone) || null;
          const taxDoc = parseTaxDoc(cust.documentType, cust.documentNumber);
          const displayName = buildDisplayName(cust.firstName, cust.lastName, null);

          let contactId = null;
          const existingByEmail = await findContactByEmailTx(tx, email);
          if (existingByEmail && !existingByEmail.customer) {
            contactId = existingByEmail.id;
            await tx.contact.update({
              where: { id: contactId },
              data: {
                primaryEmail: existingByEmail.primaryEmail ?? email,
                source: "CUSTOMER_AUTH",
                ...(displayName ? { displayName } : {}),
                ...(phoneE164 ? { primaryPhoneE164: phoneE164 } : {}),
                ...(taxDoc
                  ? {
                      documentType: taxDoc.documentType,
                      documentNumber: taxDoc.documentNumber,
                    }
                  : {}),
              },
            });
            counters.contactsUpdated += 1;
          } else {
            const created = await tx.contact.create({
              data: {
                primaryEmail: existingByEmail ? null : email,
                primaryPhoneE164: phoneE164,
                displayName,
                documentType: taxDoc?.documentType ?? null,
                documentNumber: taxDoc?.documentNumber ?? null,
                source: "CUSTOMER_AUTH",
                createdBy: uid || cust.id,
              },
              select: { id: true },
            });
            contactId = created.id;
            counters.contactsCreated += 1;
          }

          await tx.customer.update({
            where: { id: cust.id },
            data: { contactId },
          });
          counters.entitiesLinked.customers += 1;

          if (uid) {
            await upsertIdentityBackfillTx(tx, {
              contactId,
              type: "SUPABASE_USER",
              normalizedValue: uid,
              verificationStatus: "VERIFIED",
              verificationSource: "BACKFILL_CUSTOMER",
              counters,
            });
          }
          await upsertIdentityBackfillTx(tx, {
            contactId,
            type: "EMAIL",
            normalizedValue: email,
            verificationStatus: "VERIFIED",
            verificationSource: "BACKFILL_CUSTOMER",
            counters,
          });
          if (phoneE164) {
            await upsertIdentityBackfillTx(tx, {
              contactId,
              type: "PHONE",
              normalizedValue: phoneE164,
              verificationStatus: "UNVERIFIED_OBSERVED",
              verificationSource: "BACKFILL_CUSTOMER",
              counters,
            });
          }
          if (phoneE164 || taxDoc) {
            await evaluateSignalsBackfillTx(tx, {
              contactId,
              buyerPhoneE164: phoneE164,
              taxDoc,
              source: "BACKFILL_CUSTOMER",
              counters,
            });
          }
        }, BACKFILL_TX_OPTS);
      }
    }
  }

  // ── Fase 2: Order activas sin contactId (respetando aislamiento de regalos y [ID-01]) ──
  {
    let cursor = undefined;
    while (true) {
      const batch = await prisma.order.findMany({
        where: {
          ...scope.order,
          contactId: null,
          deletedAt: null,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: batchSize,
        select: {
          id: true,
          customerId: true,
          email: true,
          phone: true,
          shippingAddress: true,
          billingName: true,
          billingDocumentType: true,
          billingDocumentNumber: true,
          isGift: true,
          recipientName: true,
          recipientPhone: true,
          customer: {
            select: { id: true, contactId: true, email: true, deletedAt: true },
          },
        },
      });
      if (batch.length === 0) break;
      counters.batchesProcessed += 1;
      cursor = batch[batch.length - 1].id;

      for (const ord of batch) {
        const isGiftOrRecipient = Boolean(ord.isGift || ord.recipientName || ord.recipientPhone);
        if (isGiftOrRecipient) {
          counters.skipped.giftOrdersIsolated += 1;
        }

        const activeCust =
          ord.customer && !ord.customer.deletedAt && ord.customer.contactId ? ord.customer : null;
        const orderEmail = normalizeEmailIdentity(ord.email);

        if (!activeCust && (!orderEmail || isAnonymizedPlaceholderEmail(ord.email))) {
          counters.skipped.anonymizedOrDeleted += 1;
          continue;
        }

        const buyerPhoneE164 = normalizePhoneE164(ord.phone) || null;
        const taxDoc = parseTaxDoc(ord.billingDocumentType, ord.billingDocumentNumber);
        const shipSnap =
          !isGiftOrRecipient &&
          ord.shippingAddress &&
          typeof ord.shippingAddress === "object" &&
          !Array.isArray(ord.shippingAddress)
            ? /** @type {Record<string, unknown>} */ (ord.shippingAddress)
            : null;
        const shipFullName =
          shipSnap && typeof shipSnap.fullName === "string" ? shipSnap.fullName : null;
        const safeBuyerName = buildDisplayName(null, null, ord.billingName || shipFullName);

        await prisma.$transaction(async (tx) => {
          const fresh = await tx.order.findUnique({
            where: { id: ord.id },
            select: { contactId: true, deletedAt: true },
          });
          if (!fresh || fresh.deletedAt || fresh.contactId) return;

          if (activeCust && activeCust.contactId) {
            const custContactId = activeCust.contactId;
            await acquireLocksTx(tx, [
              `cust:${activeCust.id}`,
              orderEmail ? `email:${orderEmail}` : null,
            ]);

            await tx.order.update({
              where: { id: ord.id },
              data: { contactId: custContactId },
            });
            counters.entitiesLinked.orders += 1;

            if (buyerPhoneE164) {
              await upsertIdentityBackfillTx(tx, {
                contactId: custContactId,
                type: "PHONE",
                normalizedValue: buyerPhoneE164,
                verificationStatus: "UNVERIFIED_OBSERVED",
                verificationSource: "BACKFILL_AUTH_ORDER",
                counters,
              });
            }
            if (buyerPhoneE164 || taxDoc) {
              await evaluateSignalsBackfillTx(tx, {
                contactId: custContactId,
                buyerPhoneE164,
                taxDoc,
                source: "BACKFILL_AUTH_ORDER",
                counters,
              });
            }

            const custEmail = normalizeEmailIdentity(activeCust.email);
            if (orderEmail && custEmail && orderEmail !== custEmail && !isGiftOrRecipient) {
              const altContactId = await resolveOrCreateEmailBackfillTx(tx, {
                email: orderEmail,
                source: "ALT_ORDER_EMAIL",
                counters,
              });
              if (altContactId && altContactId !== custContactId) {
                await enqueueCandidateBackfillTx(tx, {
                  contactIdA: custContactId,
                  contactIdB: altContactId,
                  reasonCode: "HISTORICAL_ID01_EMAIL_MISMATCH",
                  evidence: { signal: "HISTORICAL_ID01", source: "BACKFILL" },
                  counters,
                });
                counters.skipped.historicalId01MismatchesQueued += 1;
              }
            }
            return;
          }

          const guestContactId = await resolveOrCreateEmailBackfillTx(tx, {
            email: orderEmail,
            source: "GUEST_ORDER",
            displayName: safeBuyerName,
            buyerPhoneE164,
            taxDoc,
            counters,
          });
          if (guestContactId) {
            await tx.order.update({
              where: { id: ord.id },
              data: { contactId: guestContactId },
            });
            counters.entitiesLinked.orders += 1;
          }
        }, BACKFILL_TX_OPTS);
      }
    }
  }

  // ── Fase 3: SupportTicket sin contactId ──
  {
    let cursor = undefined;
    while (true) {
      const batch = await prisma.supportTicket.findMany({
        where: {
          ...scope.supportTicket,
          contactId: null,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: batchSize,
        select: {
          id: true,
          email: true,
          name: true,
          customerId: true,
          customer: { select: { id: true, contactId: true, deletedAt: true } },
        },
      });
      if (batch.length === 0) break;
      counters.batchesProcessed += 1;
      cursor = batch[batch.length - 1].id;

      for (const t of batch) {
        const activeCustContactId =
          t.customer && !t.customer.deletedAt ? t.customer.contactId : null;
        const email = normalizeEmailIdentity(t.email);

        if (
          !activeCustContactId &&
          (!email || isAnonymizedPlaceholderEmail(t.email) || t.name === "Cliente eliminado")
        ) {
          counters.skipped.anonymizedOrDeleted += 1;
          continue;
        }

        await prisma.$transaction(async (tx) => {
          const fresh = await tx.supportTicket.findUnique({
            where: { id: t.id },
            select: { contactId: true },
          });
          if (!fresh || fresh.contactId) return;

          const contactId =
            activeCustContactId ??
            (await resolveOrCreateEmailBackfillTx(tx, {
              email,
              source: "SUPPORT_TICKET",
              displayName: buildDisplayName(null, null, t.name),
              counters,
            }));

          if (contactId) {
            await tx.supportTicket.update({
              where: { id: t.id },
              data: { contactId },
            });
            counters.entitiesLinked.supportTickets += 1;
          }
        }, BACKFILL_TX_OPTS);
      }
    }
  }

  // ── Fase 4: Quote activas sin contactId ──
  {
    let cursor = undefined;
    while (true) {
      const batch = await prisma.quote.findMany({
        where: {
          ...scope.quote,
          contactId: null,
          deletedAt: null,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: batchSize,
        select: {
          id: true,
          customerName: true,
          customerEmail: true,
          customerWhatsapp: true,
        },
      });
      if (batch.length === 0) break;
      counters.batchesProcessed += 1;
      cursor = batch[batch.length - 1].id;

      for (const q of batch) {
        if (
          q.customerName === "Cliente eliminado" ||
          isAnonymizedPlaceholderEmail(q.customerEmail)
        ) {
          counters.skipped.anonymizedOrDeleted += 1;
          continue;
        }

        const email = normalizeEmailIdentity(q.customerEmail);
        const whatsappE164 = normalizePhoneE164(q.customerWhatsapp) || null;
        if (!email && !whatsappE164) {
          counters.skipped.anonymizedOrDeleted += 1;
          continue;
        }

        const displayName = buildDisplayName(null, null, q.customerName);

        await prisma.$transaction(async (tx) => {
          const fresh = await tx.quote.findUnique({
            where: { id: q.id },
            select: { contactId: true, deletedAt: true },
          });
          if (!fresh || fresh.deletedAt || fresh.contactId) return;

          const contactId = email
            ? await resolveOrCreateEmailBackfillTx(tx, {
                email,
                source: "QUOTE",
                displayName,
                whatsappE164,
                counters,
              })
            : await resolveOrCreateWhatsappOnlyBackfillTx(tx, {
                whatsappE164: whatsappE164 ?? "",
                displayName,
                counters,
              });

          if (contactId) {
            await tx.quote.update({
              where: { id: q.id },
              data: { contactId },
            });
            counters.entitiesLinked.quotes += 1;
          }
        }, BACKFILL_TX_OPTS);
      }
    }
  }

  // ── Fase 5: AbandonedCart sin contactId ──
  {
    let cursor = undefined;
    while (true) {
      const batch = await prisma.abandonedCart.findMany({
        where: {
          ...scope.abandonedCart,
          contactId: null,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: batchSize,
        select: {
          id: true,
          email: true,
          cart: {
            select: {
              customerId: true,
            },
          },
        },
      });
      if (batch.length === 0) break;
      counters.batchesProcessed += 1;
      cursor = batch[batch.length - 1].id;

      const cartCustomerIds = Array.from(
        new Set(batch.map((ac) => ac.cart?.customerId).filter(Boolean)),
      );
      const cartCustomerMap = new Map();
      if (cartCustomerIds.length > 0) {
        const cartCustomers = await prisma.customer.findMany({
          where: { id: { in: cartCustomerIds }, deletedAt: null },
          select: { id: true, contactId: true },
        });
        for (const cc of cartCustomers) {
          if (cc.contactId) cartCustomerMap.set(cc.id, cc.contactId);
        }
      }

      for (const ac of batch) {
        const custContactId = ac.cart?.customerId
          ? (cartCustomerMap.get(ac.cart.customerId) ?? null)
          : null;
        const email = normalizeEmailIdentity(ac.email);

        if (!custContactId && (!email || isAnonymizedPlaceholderEmail(ac.email))) {
          counters.skipped.anonymizedOrDeleted += 1;
          continue;
        }

        await prisma.$transaction(async (tx) => {
          const fresh = await tx.abandonedCart.findUnique({
            where: { id: ac.id },
            select: { contactId: true },
          });
          if (!fresh || fresh.contactId) return;

          const contactId =
            custContactId ??
            (await resolveOrCreateEmailBackfillTx(tx, {
              email,
              source: "ABANDONED_CART",
              counters,
            }));

          if (contactId) {
            await tx.abandonedCart.update({
              where: { id: ac.id },
              data: { contactId },
            });
            counters.entitiesLinked.abandonedCarts += 1;
          }
        }, BACKFILL_TX_OPTS);
      }
    }
  }

  // ── Fase 6: Consent con identidad (omite banners de cookies anónimos) ──
  {
    const ANON_SUFFIX = "@deleted.lucamsshop.com";
    let cursor = undefined;
    while (true) {
      const batch = await prisma.consent.findMany({
        where: {
          AND: [
            scope.consent,
            {
              contactId: null,
              OR: [
                { customerId: { not: null } },
                {
                  AND: [
                    { email: { not: null } },
                    { NOT: { email: "" } },
                    { NOT: { email: { endsWith: ANON_SUFFIX, mode: "insensitive" } } },
                  ],
                },
                {
                  AND: [{ phone: { not: null } }, { NOT: { phone: "" } }],
                },
              ],
              ...(cursor ? { id: { gt: cursor } } : {}),
            },
          ],
        },
        orderBy: { id: "asc" },
        take: batchSize,
        select: {
          id: true,
          email: true,
          phone: true,
          customerId: true,
          customer: { select: { id: true, contactId: true, deletedAt: true } },
        },
      });
      if (batch.length === 0) break;
      counters.batchesProcessed += 1;
      cursor = batch[batch.length - 1].id;

      for (const c of batch) {
        const custContactId =
          c.customer && !c.customer.deletedAt ? c.customer.contactId : null;
        const email = normalizeEmailIdentity(c.email);
        const phoneE164 = normalizePhoneE164(c.phone) || null;

        if (!custContactId && !email && !phoneE164) {
          counters.skipped.anonymousConsents += 1;
          continue;
        }

        await prisma.$transaction(async (tx) => {
          const fresh = await tx.consent.findUnique({
            where: { id: c.id },
            select: { contactId: true },
          });
          if (!fresh || fresh.contactId) return;

          let contactId = custContactId;
          if (!contactId && email) {
            contactId = await resolveOrCreateEmailBackfillTx(tx, {
              email,
              source: "NEWSLETTER",
              counters,
            });
          } else if (!contactId && phoneE164) {
            contactId = await resolveOrCreateWhatsappOnlyBackfillTx(tx, {
              whatsappE164: phoneE164,
              counters,
            });
          }

          if (contactId) {
            await tx.consent.update({
              where: { id: c.id },
              data: { contactId },
            });
            counters.entitiesLinked.consents += 1;
          }
        }, BACKFILL_TX_OPTS);
      }
    }
  }

  // ── Fase 7: WarrantyClaim sin contactId ──
  {
    let cursor = undefined;
    while (true) {
      const batch = await prisma.warrantyClaim.findMany({
        where: {
          ...scope.warrantyClaim,
          contactId: null,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: batchSize,
        select: {
          id: true,
          customer: { select: { contactId: true, deletedAt: true } },
          orderItem: {
            select: {
              order: { select: { contactId: true, email: true, deletedAt: true } },
            },
          },
        },
      });
      if (batch.length === 0) break;
      counters.batchesProcessed += 1;
      cursor = batch[batch.length - 1].id;

      for (const wc of batch) {
        const ord = wc.orderItem?.order;
        if (!ord || ord.deletedAt || isAnonymizedPlaceholderEmail(ord.email)) {
          counters.skipped.anonymizedOrDeleted += 1;
          continue;
        }
        const custContactId =
          wc.customer && !wc.customer.deletedAt ? wc.customer.contactId : null;
        const resolvedId = ord.contactId ?? custContactId;
        const fallbackEmail = normalizeEmailIdentity(ord.email);

        await prisma.$transaction(async (tx) => {
          const fresh = await tx.warrantyClaim.findUnique({
            where: { id: wc.id },
            select: { contactId: true },
          });
          if (!fresh || fresh.contactId) return;

          const contactId =
            resolvedId ??
            (fallbackEmail
              ? await resolveOrCreateEmailBackfillTx(tx, {
                  email: fallbackEmail,
                  source: "GUEST_ORDER",
                  counters,
                })
              : null);

          if (contactId) {
            await tx.warrantyClaim.update({
              where: { id: wc.id },
              data: { contactId },
            });
            counters.entitiesLinked.warrantyClaims += 1;
          }
        }, BACKFILL_TX_OPTS);
      }
    }
  }

  // ── Fase 8: RetractRequest sin contactId ──
  {
    let cursor = undefined;
    while (true) {
      const batch = await prisma.retractRequest.findMany({
        where: {
          ...scope.retractRequest,
          contactId: null,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: batchSize,
        select: {
          id: true,
          orderItem: {
            select: {
              order: {
                select: {
                  contactId: true,
                  email: true,
                  deletedAt: true,
                  customer: { select: { contactId: true, deletedAt: true } },
                },
              },
            },
          },
        },
      });
      if (batch.length === 0) break;
      counters.batchesProcessed += 1;
      cursor = batch[batch.length - 1].id;

      for (const rr of batch) {
        const ord = rr.orderItem?.order;
        if (!ord || ord.deletedAt || isAnonymizedPlaceholderEmail(ord.email)) {
          counters.skipped.anonymizedOrDeleted += 1;
          continue;
        }
        const custContactId =
          ord.customer && !ord.customer.deletedAt ? ord.customer.contactId : null;
        const resolvedId = ord.contactId ?? custContactId;
        const fallbackEmail = normalizeEmailIdentity(ord.email);

        await prisma.$transaction(async (tx) => {
          const fresh = await tx.retractRequest.findUnique({
            where: { id: rr.id },
            select: { contactId: true },
          });
          if (!fresh || fresh.contactId) return;

          const contactId =
            resolvedId ??
            (fallbackEmail
              ? await resolveOrCreateEmailBackfillTx(tx, {
                  email: fallbackEmail,
                  source: "GUEST_ORDER",
                  counters,
                })
              : null);

          if (contactId) {
            await tx.retractRequest.update({
              where: { id: rr.id },
              data: { contactId },
            });
            counters.entitiesLinked.retractRequests += 1;
          }
        }, BACKFILL_TX_OPTS);
      }
    }
  }

  const reconciliationAfter = await countUnlinkedEligibleEntities(prisma, scopePrefix);
  const totalLinked = Object.values(counters.entitiesLinked).reduce((a, b) => a + b, 0);
  const totalMutations =
    counters.contactsCreated +
    counters.contactsUpdated +
    counters.identitiesCreated +
    counters.identitiesUpdated +
    counters.mergeCandidatesCreated +
    counters.mergeCandidatesUpdated +
    totalLinked;

  return {
    mode: /** @type {"APPLIED"} */ ("APPLIED"),
    readOnlyVerified: false,
    batchSize,
    startedAt,
    finishedAt: new Date().toISOString(),
    ...counters,
    totalMutations,
    pendingBefore,
    reconciliationAfter,
  };
}

/**
 * Formatea un resumen legible y libre de PII para salida CLI.
 * @param {Awaited<ReturnType<typeof runContactsBackfill>>} report
 * @returns {string}
 */
export function formatContactsBackfillReport(report) {
  const lines = [
    "======================================================================",
    `LUCAMS · BACKFILL DE IDENTIDAD CANÓNICA (Contact · ADR-193) [${report.mode}]`,
    "======================================================================",
    `Lote cursor (batchSize): ${report.batchSize} · Lotes leídos: ${report.batchesProcessed}`,
    `Ventana: ${report.startedAt} -> ${report.finishedAt}`,
    "",
    "1. PENDIENTES ELEGIBLES ANTES DE LA CORRIDA (contactId IS NULL)",
    `   - Total elegibles pendientes : ${report.pendingBefore.unlinkedEligibleTotal}`,
    `   - Customer                   : ${report.pendingBefore.customers}`,
    `   - Order                      : ${report.pendingBefore.orders}`,
    `   - SupportTicket              : ${report.pendingBefore.supportTickets}`,
    `   - Quote                      : ${report.pendingBefore.quotes}`,
    `   - AbandonedCart              : ${report.pendingBefore.abandonedCarts}`,
    `   - Consent (con identidad)    : ${report.pendingBefore.consents}`,
    `   - WarrantyClaim              : ${report.pendingBefore.warrantyClaims}`,
    `   - RetractRequest             : ${report.pendingBefore.retractRequests}`,
    "",
    "2. MUTACIONES EJECUTADAS (CERO PII)",
    `   - Total mutaciones           : ${report.totalMutations}`,
    `   - Contact creados / actualiz.: ${report.contactsCreated} / ${report.contactsUpdated}`,
    `   - ContactIdentity creadas/act: ${report.identitiesCreated} / ${report.identitiesUpdated}`,
    `   - MergeCandidate creados/act : ${report.mergeCandidatesCreated} / ${report.mergeCandidatesUpdated}`,
    `   - Filas enlazadas (8 tablas) : C=${report.entitiesLinked.customers}, O=${report.entitiesLinked.orders}, ST=${report.entitiesLinked.supportTickets}, Q=${report.entitiesLinked.quotes}, AC=${report.entitiesLinked.abandonedCarts}, CN=${report.entitiesLinked.consents}, WC=${report.entitiesLinked.warrantyClaims}, RR=${report.entitiesLinked.retractRequests}`,
    `   - Regalos aislados / [ID-01] : ${report.skipped.giftOrdersIsolated} / ${report.skipped.historicalId01MismatchesQueued}`,
    "",
    "3. RECONCILIACIÓN FINAL (META: unlinkedEligibleTotal = 0)",
    `   - Total elegibles sin link   : ${report.reconciliationAfter.unlinkedEligibleTotal}`,
    "======================================================================",
  ];
  return lines.join("\n");
}
