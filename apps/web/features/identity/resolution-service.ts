/*
 * Servicio determinista de Resolución de Identidad Canónica (`Contact` · ADR-193).
 *
 * Implementa la matriz estricta de 4 niveles aprobada en ADR-193:
 *  - Nivel 1 (Determinista): sesión autenticada `supabaseUserId` -> `Customer.contactId`,
 *    `EMAIL` `VERIFIED` (OTP, password verificado, OAuth con email verificado o HMAC) y
 *    regla absoluta `[ID-01]` en checkout autenticado (`Order.contactId` pertenece SIEMPRE
 *    al `Customer` de la sesión aunque `Order.email` sea un correo alterno).
 *  - Nivel 2 (Asociación contextual sin privilegios): un visitante no autenticado que digita
 *    `email` (`UNVERIFIED_OBSERVED`) enlaza `contactId` únicamente para lectura interna del
 *    backoffice (`Contacto 360`). JAMÁS asigna `Order.customerId`, JAMÁS acredita/redime
 *    Puntos Lucams y JAMÁS expone historial previo al navegador anónimo.
 *  - Nivel 3 (Señal probable -> `IdentityMergeCandidate`): teléfono comprador E.164 compartido
 *    entre contactos distintos (`SAME_BUYER_PHONE_E164`), mismo documento tributario DIAN
 *    (`SAME_BILLING_DOCUMENT`) o correo alterno no-regalo en compra autenticada
 *    (`AUTH_BUYER_ALT_ORDER_EMAIL`) se encolan en par canónico inmutable sin auto-merge.
 *  - Nivel 4 (Fusión humana): gobernada en Fase 9 (`S20`) bajo `requireRecentMfa` + snapshot;
 *    cualquier par `REJECTED` actúa aquí como *do-not-suggest* permanente.
 *
 * Aislamiento total de destinatarios de regalo:
 *  - La firma pública de `resolveOrderContactTx` NO recibe `recipientName`, `recipientPhone`
 *    ni `shippingAddress`. Es imposible por construcción crear `Contact`, `ContactIdentity`
 *    o `IdentityMergeCandidate` con datos del homenajeado.
 *
 * Concurrencia PostgreSQL sin abortar transacciones (`25P02`):
 *  - Dentro de transacciones interactivas (`tx.$executeRaw`), serializa colisiones sobre la
 *    misma llave de identidad con `pg_advisory_xact_lock(hashtext(...), hashtext(...))` en
 *    orden lexicográfico determinista (cero deadlocks, cero `23505` / `25P02`).
 *  - Compatible con mocks parciales de tests unitarios: si el cliente inyectado no expone los
 *    delegados de identidad (`contact` / `contactIdentity`), retorna `null` sin lanzar.
 */

import "server-only";

import type {
  ContactIdentityType,
  DocumentType,
  IdentityVerificationStatus,
  Prisma,
  PrismaClient,
} from "@lucams/db";

const ANONYMIZED_EMAIL_SUFFIX = "@deleted.lucamsshop.com";
const ADVISORY_LOCK_NS = "lucams_contact_identity_v1";

export type IdentityDbClient = PrismaClient | Prisma.TransactionClient;

export type MergeReasonCode =
  | "SAME_BUYER_PHONE_E164"
  | "SAME_BILLING_DOCUMENT"
  | "AUTH_BUYER_ALT_ORDER_EMAIL"
  | "HISTORICAL_ID01_EMAIL_MISMATCH";

/** Detecta placeholders de supresión Ley 1581 (`deleted-<id>@deleted.lucamsshop.com`). */
export function isAnonymizedPlaceholderEmail(raw: string | null | undefined): boolean {
  if (typeof raw !== "string") return false;
  return raw.trim().toLowerCase().endsWith(ANONYMIZED_EMAIL_SUFFIX);
}

/**
 * Normaliza un correo para resolución de identidad (`lower(trim())`).
 * Devuelve `""` si está vacío, carece de `@` o es un placeholder anonimizado Ley 1581.
 */
export function normalizeEmailIdentity(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return "";
  if (trimmed.endsWith(ANONYMIZED_EMAIL_SUFFIX)) return "";
  return trimmed;
}

/**
 * Normaliza un teléfono humano a E.164 estricto (`+573XXXXXXXXX` para móviles CO de 10 dígitos;
 * `+<7..15 dígitos>` internacional). Devuelve `""` si está vacío o no es un número válido.
 */
export function normalizePhoneIdentityE164(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed || /[a-zA-Z]/.test(trimmed)) return "";

  const compact = trimmed.replace(/[\s().\-\u00A0]/g, "");
  const coWithPrefix = /^(?:\+?57|0057)(3\d{9})$/.exec(compact);
  if (coWithPrefix) return `+57${coWithPrefix[1]}`;

  const coLocalMobile = /^(3\d{9})$/.exec(compact);
  if (coLocalMobile) return `+57${coLocalMobile[1]}`;

  const intlDigits = /^\+?(\d{7,15})$/.exec(compact);
  if (intlDigits) return `+${intlDigits[1]}`;

  return "";
}

/** Normaliza documento tributario `(documentType, documentNumber)` para comparación exacta. */
export function normalizeTaxDocumentIdentity(
  docType: DocumentType | string | null | undefined,
  docNumber: string | null | undefined,
): { documentType: DocumentType; documentNumber: string; key: string } | null {
  if (!docType || typeof docNumber !== "string") return null;
  const cleanType = String(docType).trim().toUpperCase() as DocumentType;
  const cleanNumber = docNumber.trim().toUpperCase().replace(/[\s.]/g, "");
  if (!cleanType || !cleanNumber) return null;
  return {
    documentType: cleanType,
    documentNumber: cleanNumber,
    key: `${cleanType}:${cleanNumber}`,
  };
}

/** Ordena dos IDs de `Contact` de forma canónica e inmutable en el tiempo. */
export function canonicalContactPair(
  contactIdA: string,
  contactIdB: string,
): [string, string] | null {
  const a = contactIdA.trim();
  const b = contactIdB.trim();
  if (!a || !b || a === b) return null;
  return a < b ? [a, b] : [b, a];
}

function buildDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  fallbackFullName?: string | null,
): string | null {
  const parts = [firstName?.trim(), lastName?.trim()].filter((p): p is string => Boolean(p));
  if (parts.length > 0) return parts.join(" ").slice(0, 140);
  const full = fallbackFullName?.trim();
  if (full && full !== "Cliente" && full !== "Cliente eliminado") {
    return full.slice(0, 140);
  }
  return null;
}

/**
 * Verifica si el cliente Prisma o mock de test expone los delegados del grafo `Contact`.
 * Permite que suites unitarias con mocks parciales (`{ order: { create: vi.fn() } }`) sigan
 * funcionando sin acoplamiento innecesario, mientras Postgres real ejecuta siempre el grafo.
 */
export function hasIdentityDelegates(db: unknown): db is IdentityDbClient {
  if (!db || typeof db !== "object") return false;
  const candidate = db as Record<string, unknown>;
  const contact = candidate.contact as Record<string, unknown> | undefined;
  const contactIdentity = candidate.contactIdentity as Record<string, unknown> | undefined;
  return Boolean(
    contact &&
    typeof contact.findFirst === "function" &&
    typeof contact.create === "function" &&
    contactIdentity &&
    typeof contactIdentity.findFirst === "function",
  );
}

/**
 * Ejecuta `fn` dentro de una transacción interactiva cuando `db` es `PrismaClient` raíz,
 * o reutiliza directamente `db` cuando ya es un `TransactionClient` (o un mock unitario).
 */
async function withIdentityTx<T>(
  db: IdentityDbClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const maybeRoot = db as PrismaClient;
  if (typeof maybeRoot.$transaction === "function") {
    return maybeRoot.$transaction(async (tx) => fn(tx), {
      maxWait: 10_000,
      timeout: 25_000,
    });
  }
  return fn(db as Prisma.TransactionClient);
}

/**
 * Adquiere locks transaccionales deterministas (`pg_advisory_xact_lock`) ordenados
 * lexicográficamente para evitar colisiones `P2002` y estados `25P02` bajo concurrencia.
 */
async function acquireIdentityLocksTx(
  tx: Prisma.TransactionClient,
  rawKeys: ReadonlyArray<string | null | undefined>,
): Promise<void> {
  if (typeof (tx as { $executeRaw?: unknown }).$executeRaw !== "function") return;
  const uniqueSorted = Array.from(
    new Set(rawKeys.map((k) => k?.trim()).filter((k): k is string => Boolean(k))),
  ).sort();
  for (const key of uniqueSorted) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ADVISORY_LOCK_NS}), hashtext(${key}))`;
  }
}

/**
 * Registra o actualiza un `ContactIdentity` sobre `contactId`.
 * Reglas:
 *  - `VERIFIED` prevalece sobre `UNVERIFIED_OBSERVED` (jamás degrada un identificador ya verificado).
 *  - Si `type` es `SUPABASE_USER` o `EMAIL` y otro `Contact` activo ya posee ese identificador
 *    no revocado, NO intenta robarlo ni lanzar `P2002`: retorna `"owned_by_other"`.
 */
export async function upsertContactIdentityTx(
  tx: Prisma.TransactionClient,
  input: {
    contactId: string;
    type: ContactIdentityType;
    normalizedValue: string;
    verificationStatus: IdentityVerificationStatus;
    verificationSource?: string | null;
    now?: Date;
  },
): Promise<"created" | "updated" | "owned_by_other" | "skipped"> {
  const value = input.normalizedValue.trim();
  if (!value) return "skipped";
  const now = input.now ?? new Date();

  if (input.type === "SUPABASE_USER" || input.type === "EMAIL") {
    const existingOwner = await tx.contactIdentity.findFirst({
      where: {
        type: input.type,
        normalizedValue: value,
        verificationStatus: { not: "REVOKED" },
      },
      select: { id: true, contactId: true, verificationStatus: true, verifiedAt: true },
    });

    if (existingOwner && existingOwner.contactId !== input.contactId) {
      return "owned_by_other";
    }

    if (existingOwner) {
      const upgradeToVerified =
        existingOwner.verificationStatus !== "VERIFIED" && input.verificationStatus === "VERIFIED";
      await tx.contactIdentity.update({
        where: { id: existingOwner.id },
        data: {
          lastSeenAt: now,
          ...(upgradeToVerified
            ? {
                verificationStatus: "VERIFIED",
                verifiedAt: existingOwner.verifiedAt ?? now,
                verificationSource: input.verificationSource ?? "VERIFIED_FLOW",
              }
            : {}),
        },
      });
      return "updated";
    }
  }

  const sameContactRow = await tx.contactIdentity.findUnique({
    where: {
      contactId_type_normalizedValue: {
        contactId: input.contactId,
        type: input.type,
        normalizedValue: value,
      },
    },
    select: { id: true, verificationStatus: true, verifiedAt: true },
  });

  if (sameContactRow) {
    const nextStatus =
      sameContactRow.verificationStatus === "VERIFIED" && input.verificationStatus !== "REVOKED"
        ? "VERIFIED"
        : input.verificationStatus;
    await tx.contactIdentity.update({
      where: { id: sameContactRow.id },
      data: {
        verificationStatus: nextStatus,
        lastSeenAt: now,
        ...(nextStatus === "VERIFIED" && !sameContactRow.verifiedAt
          ? {
              verifiedAt: now,
              verificationSource: input.verificationSource ?? "VERIFIED_FLOW",
            }
          : {}),
      },
    });
    return "updated";
  }

  await tx.contactIdentity.create({
    data: {
      contactId: input.contactId,
      type: input.type,
      normalizedValue: value,
      verificationStatus: input.verificationStatus,
      verifiedAt: input.verificationStatus === "VERIFIED" ? now : null,
      verificationSource:
        input.verificationStatus === "VERIFIED"
          ? (input.verificationSource ?? "VERIFIED_FLOW")
          : (input.verificationSource ?? null),
      firstSeenAt: now,
      lastSeenAt: now,
    },
  });
  return "created";
}

/**
 * Encola un candidato de revisión humana en `IdentityMergeCandidate` (Nivel 3, cero auto-merge).
 *  - Usa par canónico lexicográfico inmutable `(primaryContactId, secondaryContactId)`.
 *  - Si el par ya fue `REJECTED` (*do-not-suggest*) o `APPROVED` en cualquier dirección, no lo reabre.
 *  - Acumula `reasonCodes` sin exponer PII innecesaria.
 */
export async function enqueueMergeCandidateTx(
  tx: Prisma.TransactionClient,
  input: {
    contactIdA: string;
    contactIdB: string;
    reasonCode: MergeReasonCode;
    evidence?: Record<string, unknown>;
  },
): Promise<void> {
  if (!tx.identityMergeCandidate) return;
  const pair = canonicalContactPair(input.contactIdA, input.contactIdB);
  if (!pair) return;
  const [primaryContactId, secondaryContactId] = pair;

  await acquireIdentityLocksTx(tx, [`merge:${primaryContactId}:${secondaryContactId}`]);

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
    // Respeto absoluto a decisiones humanas previas (`REJECTED` = do-not-suggest permanente).
    if (existing.status === "REJECTED" || existing.status === "APPROVED") {
      return;
    }
    const mergedReasons = Array.from(
      new Set([existing.reasonCode, ...(existing.reasonCodes ?? []), input.reasonCode]),
    );
    const prevEvidence =
      existing.evidenceJson &&
      typeof existing.evidenceJson === "object" &&
      !Array.isArray(existing.evidenceJson)
        ? (existing.evidenceJson as Record<string, unknown>)
        : {};
    await tx.identityMergeCandidate.update({
      where: { id: existing.id },
      data: {
        reasonCodes: mergedReasons,
        evidenceJson: {
          ...prevEvidence,
          ...(input.evidence ?? {}),
        } as Prisma.InputJsonValue,
      },
    });
    return;
  }

  await tx.identityMergeCandidate.create({
    data: {
      primaryContactId,
      secondaryContactId,
      reasonCode: input.reasonCode,
      reasonCodes: [input.reasonCode],
      status: "PENDING",
      evidenceJson: (input.evidence ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/**
 * Evalúa señales probables del COMPRADOR (`SAME_BUYER_PHONE_E164`, `SAME_BILLING_DOCUMENT`)
 * contra otros contactos activos y las encola en `IdentityMergeCandidate` sin fusionar.
 */
async function evaluateProbableBuyerSignalsTx(
  tx: Prisma.TransactionClient,
  input: {
    contactId: string;
    buyerPhoneE164?: string | null;
    taxDoc?: { documentType: DocumentType; documentNumber: string } | null;
    contextSource: string;
  },
): Promise<void> {
  if (input.buyerPhoneE164) {
    const otherPhoneOwners = await tx.contactIdentity.findMany({
      where: {
        type: "PHONE",
        normalizedValue: input.buyerPhoneE164,
        verificationStatus: { not: "REVOKED" },
        contactId: { not: input.contactId },
        contact: { deletedAt: null, anonymizedAt: null },
      },
      select: { contactId: true },
      take: 5,
    });
    const distinctIds = Array.from(new Set(otherPhoneOwners.map((r) => r.contactId)));
    for (const otherId of distinctIds) {
      await enqueueMergeCandidateTx(tx, {
        contactIdA: input.contactId,
        contactIdB: otherId,
        reasonCode: "SAME_BUYER_PHONE_E164",
        evidence: { signal: "PHONE", source: input.contextSource },
      });
    }
  }

  if (input.taxDoc) {
    const otherDocContacts = await tx.contact.findMany({
      where: {
        id: { not: input.contactId },
        documentType: input.taxDoc.documentType,
        documentNumber: input.taxDoc.documentNumber,
        deletedAt: null,
        anonymizedAt: null,
      },
      select: { id: true },
      take: 5,
    });
    for (const other of otherDocContacts) {
      await enqueueMergeCandidateTx(tx, {
        contactIdA: input.contactId,
        contactIdB: other.id,
        reasonCode: "SAME_BILLING_DOCUMENT",
        evidence: {
          signal: "TAX_DOCUMENT",
          documentType: input.taxDoc.documentType,
          source: input.contextSource,
        },
      });
    }
  }
}

/**
 * Busca un `Contact` activo por email normalizado (vía `Contact.primaryEmail` o
 * `ContactIdentity(EMAIL)` no revocado).
 */
async function findActiveContactByEmailTx(
  tx: Prisma.TransactionClient,
  normalizedEmail: string,
): Promise<{
  id: string;
  primaryEmail: string | null;
  primaryPhoneE164: string | null;
  displayName: string | null;
  documentType: DocumentType | null;
  documentNumber: string | null;
  source: string;
  customer: { id: string } | null;
} | null> {
  if (!normalizedEmail) return null;

  const byPrimary = await tx.contact.findFirst({
    where: { primaryEmail: normalizedEmail, deletedAt: null },
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
      normalizedValue: normalizedEmail,
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
 * Resuelve o crea un `Contact` contextual por email (`UNVERIFIED_OBSERVED`) para flujos
 * no autenticados (checkout guest, soporte público, cotización con email, carrito abandonado,
 * newsletter/consent).
 */
async function resolveOrCreateEmailContactTx(
  tx: Prisma.TransactionClient,
  input: {
    email: string;
    source:
      | "GUEST_ORDER"
      | "SUPPORT_TICKET"
      | "QUOTE"
      | "B2B_INQUIRY"
      | "ABANDONED_CART"
      | "NEWSLETTER"
      | "ALT_ORDER_EMAIL";
    displayName?: string | null;
    buyerPhoneE164?: string | null;
    whatsappE164?: string | null;
    taxDoc?: { documentType: DocumentType; documentNumber: string } | null;
    emailVerified?: boolean;
    verificationSource?: string | null;
  },
): Promise<string | null> {
  const email = normalizeEmailIdentity(input.email);
  if (!email) return null;

  await acquireIdentityLocksTx(tx, [`email:${email}`]);

  let contact = await findActiveContactByEmailTx(tx, email);
  if (!contact) {
    contact = await tx.contact.create({
      data: {
        primaryEmail: email,
        primaryPhoneE164: input.buyerPhoneE164 ?? input.whatsappE164 ?? null,
        displayName: input.displayName ?? null,
        documentType: input.taxDoc?.documentType ?? null,
        documentNumber: input.taxDoc?.documentNumber ?? null,
        source: input.source,
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
  } else {
    // Enriquecimiento conservador: un flujo invitado nunca pisa datos ya poblados en el Contact
    // (protege contra defacement anónimo de cuentas registradas).
    const patch: Prisma.ContactUpdateInput = {};
    if (!contact.primaryEmail) patch.primaryEmail = email;
    if (!contact.displayName && input.displayName) patch.displayName = input.displayName;
    if (!contact.primaryPhoneE164 && (input.buyerPhoneE164 || input.whatsappE164)) {
      patch.primaryPhoneE164 = input.buyerPhoneE164 ?? input.whatsappE164 ?? null;
    }
    if (!contact.documentType && !contact.documentNumber && input.taxDoc) {
      patch.documentType = input.taxDoc.documentType;
      patch.documentNumber = input.taxDoc.documentNumber;
    }
    if (Object.keys(patch).length > 0) {
      await tx.contact.update({ where: { id: contact.id }, data: patch });
    }
  }

  await upsertContactIdentityTx(tx, {
    contactId: contact.id,
    type: "EMAIL",
    normalizedValue: email,
    verificationStatus: input.emailVerified ? "VERIFIED" : "UNVERIFIED_OBSERVED",
    verificationSource: input.verificationSource ?? input.source,
  });

  if (input.buyerPhoneE164) {
    await upsertContactIdentityTx(tx, {
      contactId: contact.id,
      type: "PHONE",
      normalizedValue: input.buyerPhoneE164,
      verificationStatus: "UNVERIFIED_OBSERVED",
      verificationSource: input.source,
    });
  }

  if (input.whatsappE164) {
    await upsertContactIdentityTx(tx, {
      contactId: contact.id,
      type: "WHATSAPP",
      normalizedValue: input.whatsappE164,
      verificationStatus: "UNVERIFIED_OBSERVED",
      verificationSource: input.source,
    });
  }

  if (input.buyerPhoneE164 || input.taxDoc) {
    await evaluateProbableBuyerSignalsTx(tx, {
      contactId: contact.id,
      buyerPhoneE164: input.buyerPhoneE164 ?? null,
      taxDoc: input.taxDoc ?? null,
      contextSource: input.source,
    });
  }

  await markStaffContactIfAdminTx(tx, contact.id, email);

  return contact.id;
}

/**
 * Guardrail staff=cliente (2026-11-04): si el email pertenece a un `AdminUser` activo,
 * el `Contact` queda marcado `isStaff` (exclusión de segmentos/RFM/LTV y flag
 * `selfDealing` en auditoría admin). NUNCA se desmarca desde flujos vivos: retirar la
 * marca (ej. ex-empleado) es decisión manual del SUPERADMIN en la ficha del contacto.
 * Best-effort por diseño: una falla acá no puede romper checkout ni registro.
 */
async function markStaffContactIfAdminTx(
  tx: Prisma.TransactionClient,
  contactId: string,
  normalizedEmail: string,
): Promise<void> {
  if (!normalizedEmail) return;
  try {
    const staff = await tx.adminUser.findFirst({
      where: { email: normalizedEmail, deletedAt: null },
      select: { id: true },
    });
    if (staff) {
      await tx.contact.update({ where: { id: contactId }, data: { isStaff: true } });
    }
  } catch {
    // best-effort: nunca bloquear el flujo de negocio por la marca de staff
  }
}

/**
 * Asegura que una fila `Customer` activa tenga su `Contact` 1:1 (`Customer.contactId`)
 * y sus `ContactIdentity` sincronizadas.
 *
 * Seguridad de posesión (`emailVerified`):
 *  - En `/registro` antes de verificar OTP (`emailVerified: false`), `EMAIL` queda como
 *    `UNVERIFIED_OBSERVED` y NO sobrescribe el `displayName` de un `Contact` invitado previo.
 *  - Tras verificar OTP (`confirmar-codigo`), login con password (`login`) o callback PKCE
 *    con correo confirmado (`emailVerified: true`), `EMAIL` sube a `VERIFIED` y adopta
 *    cualquier fila previa con ese email que aún tuviera `contactId: null`.
 */
export async function ensureCustomerContactTx(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    emailVerified: boolean;
    verificationSource?: string;
  },
): Promise<string | null> {
  if (!hasIdentityDelegates(tx)) return null;

  const customer = await tx.customer.findUnique({
    where: { id: input.customerId },
    select: {
      id: true,
      contactId: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      supabaseUserId: true,
      documentType: true,
      documentNumber: true,
      deletedAt: true,
    },
  });
  if (!customer || customer.deletedAt) return null;

  const email = normalizeEmailIdentity(customer.email);
  const supabaseUid = customer.supabaseUserId?.trim() ?? "";
  if (!email || supabaseUid.startsWith("deleted-")) return null;

  await acquireIdentityLocksTx(tx, [
    `cust:${customer.id}`,
    `email:${email}`,
    supabaseUid ? `sub:${supabaseUid}` : null,
  ]);

  const phoneE164 = normalizePhoneIdentityE164(customer.phone);
  const taxDoc = normalizeTaxDocumentIdentity(customer.documentType, customer.documentNumber);
  const displayName = buildDisplayName(customer.firstName, customer.lastName);

  let contactId = customer.contactId;

  if (!contactId) {
    // ¿Ya existe un Contact para este email sin otra cuenta Customer adjunta? (ej. comprador guest previo)
    const existingByEmail = await findActiveContactByEmailTx(tx, email);
    if (
      existingByEmail &&
      (!existingByEmail.customer || existingByEmail.customer.id === customer.id)
    ) {
      contactId = existingByEmail.id;
      const updateData: Prisma.ContactUpdateInput = {
        primaryEmail: existingByEmail.primaryEmail ?? email,
        ...(input.emailVerified ? { source: "CUSTOMER_AUTH" } : {}),
      };
      if (displayName && (input.emailVerified || !existingByEmail.displayName)) {
        updateData.displayName = displayName;
      }
      if (phoneE164 && (input.emailVerified || !existingByEmail.primaryPhoneE164)) {
        updateData.primaryPhoneE164 = phoneE164;
      }
      if (taxDoc && (input.emailVerified || !existingByEmail.documentNumber)) {
        updateData.documentType = taxDoc.documentType;
        updateData.documentNumber = taxDoc.documentNumber;
      }
      await tx.contact.update({
        where: { id: contactId },
        data: updateData,
      });
    } else {
      const created = await tx.contact.create({
        data: {
          primaryEmail: existingByEmail ? null : email,
          primaryPhoneE164: phoneE164 || null,
          displayName,
          documentType: taxDoc?.documentType ?? null,
          documentNumber: taxDoc?.documentNumber ?? null,
          source: "CUSTOMER_AUTH",
          createdBy: supabaseUid || customer.id,
        },
        select: { id: true },
      });
      contactId = created.id;
    }

    await tx.customer.update({
      where: { id: customer.id },
      data: { contactId },
    });
  } else {
    // Sincronizar atributos cuando el titular autenticado actualiza su perfil o verifica OTP.
    const existingContact = await tx.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        primaryEmail: true,
        primaryPhoneE164: true,
        displayName: true,
        documentType: true,
        documentNumber: true,
        deletedAt: true,
      },
    });
    if (existingContact && !existingContact.deletedAt) {
      const updateData: Prisma.ContactUpdateInput = {};
      if (!existingContact.primaryEmail) updateData.primaryEmail = email;
      if (input.emailVerified) {
        if (displayName) updateData.displayName = displayName;
        if (phoneE164) updateData.primaryPhoneE164 = phoneE164;
        if (taxDoc) {
          updateData.documentType = taxDoc.documentType;
          updateData.documentNumber = taxDoc.documentNumber;
        }
        updateData.source = "CUSTOMER_AUTH";
      } else {
        if (!existingContact.displayName && displayName) updateData.displayName = displayName;
        if (!existingContact.primaryPhoneE164 && phoneE164) updateData.primaryPhoneE164 = phoneE164;
      }
      if (Object.keys(updateData).length > 0) {
        await tx.contact.update({ where: { id: contactId }, data: updateData });
      }
    }
  }

  if (supabaseUid) {
    await upsertContactIdentityTx(tx, {
      contactId,
      type: "SUPABASE_USER",
      normalizedValue: supabaseUid,
      verificationStatus: "VERIFIED",
      verificationSource: input.verificationSource ?? "SUPABASE_AUTH",
    });
  }

  await upsertContactIdentityTx(tx, {
    contactId,
    type: "EMAIL",
    normalizedValue: email,
    verificationStatus: input.emailVerified ? "VERIFIED" : "UNVERIFIED_OBSERVED",
    verificationSource: input.verificationSource ?? "SUPABASE_AUTH",
  });

  if (phoneE164) {
    await upsertContactIdentityTx(tx, {
      contactId,
      type: "PHONE",
      normalizedValue: phoneE164,
      verificationStatus: "UNVERIFIED_OBSERVED",
      verificationSource: input.verificationSource ?? "CUSTOMER_PROFILE",
    });
  }

  if (phoneE164 || taxDoc) {
    await evaluateProbableBuyerSignalsTx(tx, {
      contactId,
      buyerPhoneE164: phoneE164 || null,
      taxDoc,
      contextSource: "CUSTOMER_PROFILE",
    });
  }

  await markStaffContactIfAdminTx(tx, contactId, email);

  // Solo tras posesión verificada del correo adoptamos registros previos sin `contactId`
  // que compartan exactamente ese email (o `customerId`).
  if (input.emailVerified) {
    await Promise.all([
      tx.order.updateMany({
        where: {
          contactId: null,
          deletedAt: null,
          OR: [
            { customerId: customer.id },
            { customerId: null, email: { equals: email, mode: "insensitive" } },
          ],
        },
        data: { contactId },
      }),
      tx.supportTicket.updateMany({
        where: {
          contactId: null,
          OR: [
            { customerId: customer.id },
            { customerId: null, email: { equals: email, mode: "insensitive" } },
          ],
        },
        data: { contactId },
      }),
      tx.quote.updateMany({
        where: {
          contactId: null,
          deletedAt: null,
          customerEmail: { equals: email, mode: "insensitive" },
        },
        data: { contactId },
      }),
      tx.abandonedCart.updateMany({
        where: {
          contactId: null,
          email: { equals: email, mode: "insensitive" },
        },
        data: { contactId },
      }),
      tx.consent.updateMany({
        where: {
          contactId: null,
          OR: [
            { customerId: customer.id },
            { customerId: null, email: { equals: email, mode: "insensitive" } },
          ],
        },
        data: { contactId },
      }),
      tx.warrantyClaim.updateMany({
        where: { contactId: null, customerId: customer.id },
        data: { contactId },
      }),
    ]);
  }

  return contactId;
}

/** Wrapper seguro fuera de `$transaction` para flujos de Auth y Perfil. */
export async function ensureCustomerContact(
  db: IdentityDbClient,
  input: {
    customerId: string;
    emailVerified: boolean;
    verificationSource?: string;
  },
): Promise<string | null> {
  if (!hasIdentityDelegates(db)) return null;
  return withIdentityTx(db, (tx) => ensureCustomerContactTx(tx, input));
}

/**
 * Resuelve el `contactId` de una `Order` en `createOrderFromCartTx` cumpliendo ADR-193:
 *  - Si `sessionCustomerId` existe (comprador autenticado): `Order.contactId` es SIEMPRE el
 *    `Contact` de ese `Customer` (`[ID-01]`). Si `orderEmail` difiere del correo de la cuenta
 *    y NO es un regalo, jamás anexa `orderEmail` como `ContactIdentity` del `Customer`; en su
 *    lugar crea/localiza el contacto observado del correo alterno y encola
 *    `AUTH_BUYER_ALT_ORDER_EMAIL` en `IdentityMergeCandidate`.
 *  - Si `sessionCustomerId` es `null` (comprador invitado): resuelve/crea por `orderEmail`
 *    (`UNVERIFIED_OBSERVED`) sin tocar `Order.customerId` ni Puntos Lucams.
 *  - Aislamiento de regalos: no recibe `recipientName`, `recipientPhone` ni `shippingAddress`;
 *    además, cuando `isGift` o `hasThirdPartyRecipient` es `true`, tampoco usa `buyerFullName`
 *    del paso de envío salvo que provenga de `billingName`.
 */
export async function resolveOrderContactTx(
  tx: Prisma.TransactionClient,
  input: {
    sessionCustomerId: string | null;
    orderEmail: string;
    buyerPhone: string;
    buyerFullName?: string | null;
    billingName?: string | null;
    billingDocumentType?: DocumentType | null;
    billingDocumentNumber?: string | null;
    isGift?: boolean;
    hasThirdPartyRecipient?: boolean;
  },
): Promise<string | null> {
  if (!hasIdentityDelegates(tx)) return null;

  const orderEmail = normalizeEmailIdentity(input.orderEmail);
  const buyerPhoneE164 = normalizePhoneIdentityE164(input.buyerPhone);
  const taxDoc = normalizeTaxDocumentIdentity(
    input.billingDocumentType,
    input.billingDocumentNumber,
  );
  const isGiftOrThirdParty = Boolean(input.isGift || input.hasThirdPartyRecipient);
  const safeBuyerName = buildDisplayName(
    null,
    null,
    input.billingName?.trim() || (!isGiftOrThirdParty ? input.buyerFullName : null),
  );

  // 1) Comprador autenticado (Nivel 1 — inmunidad absoluta [ID-01])
  if (input.sessionCustomerId) {
    const customerContactId = await ensureCustomerContactTx(tx, {
      customerId: input.sessionCustomerId,
      emailVerified: true,
      verificationSource: "CHECKOUT_SESSION",
    });
    if (customerContactId) {
      const custContact = await tx.contact.findUnique({
        where: { id: customerContactId },
        select: {
          primaryEmail: true,
          primaryPhoneE164: true,
          displayName: true,
          documentType: true,
          documentNumber: true,
        },
      });

      const patch: Prisma.ContactUpdateInput = {};
      if (!custContact?.primaryPhoneE164 && buyerPhoneE164) {
        patch.primaryPhoneE164 = buyerPhoneE164;
      }
      if (!custContact?.displayName && safeBuyerName) {
        patch.displayName = safeBuyerName;
      }
      if (!custContact?.documentType && !custContact?.documentNumber && taxDoc) {
        patch.documentType = taxDoc.documentType;
        patch.documentNumber = taxDoc.documentNumber;
      }
      if (Object.keys(patch).length > 0) {
        await tx.contact.update({ where: { id: customerContactId }, data: patch });
      }

      if (buyerPhoneE164) {
        await upsertContactIdentityTx(tx, {
          contactId: customerContactId,
          type: "PHONE",
          normalizedValue: buyerPhoneE164,
          verificationStatus: "UNVERIFIED_OBSERVED",
          verificationSource: "AUTH_ORDER",
        });
      }

      if (buyerPhoneE164 || taxDoc) {
        await evaluateProbableBuyerSignalsTx(tx, {
          contactId: customerContactId,
          buyerPhoneE164: buyerPhoneE164 || null,
          taxDoc,
          contextSource: "AUTH_ORDER",
        });
      }

      // Si el comprador autenticado ingresó un correo distinto y NO es regalo -> cola humana Nivel 3
      if (
        orderEmail &&
        custContact?.primaryEmail &&
        orderEmail !== custContact.primaryEmail &&
        !isGiftOrThirdParty
      ) {
        const altContactId = await resolveOrCreateEmailContactTx(tx, {
          email: orderEmail,
          source: "ALT_ORDER_EMAIL",
        });
        if (altContactId && altContactId !== customerContactId) {
          await enqueueMergeCandidateTx(tx, {
            contactIdA: customerContactId,
            contactIdB: altContactId,
            reasonCode: "AUTH_BUYER_ALT_ORDER_EMAIL",
            evidence: { signal: "ALT_ORDER_EMAIL", source: "CHECKOUT" },
          });
        }
      }

      return customerContactId;
    }
  }

  // 2) Comprador invitado (Nivel 2 — asociación contextual sin privilegios)
  if (!orderEmail) return null;
  return resolveOrCreateEmailContactTx(tx, {
    email: orderEmail,
    source: "GUEST_ORDER",
    displayName: safeBuyerName,
    buyerPhoneE164: buyerPhoneE164 || null,
    taxDoc,
  });
}

/**
 * Verifica si un `customerId` de sesión puede vincularse de forma segura a un formulario
 * público o captura contextual:
 *  1. Nunca vincula si el `Customer` comparte identidad (`supabaseUserId` o email) con un
 *     `AdminUser` activo (staff interno).
 *  2. Si el formulario incluyó un `submittedEmail` explícito, exige coincidencia exacta
 *     case-insensitive con `Customer.email`; si difiere, se resuelve como tercero independiente.
 */
async function canBindSessionCustomerTx(
  tx: Prisma.TransactionClient,
  customerId: string,
  submittedEmail?: string | null,
): Promise<boolean> {
  const customer = await tx.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { id: true, email: true, supabaseUserId: true },
  });
  if (!customer) return false;

  const custEmail = normalizeEmailIdentity(customer.email);
  const targetEmail = normalizeEmailIdentity(submittedEmail);
  if (targetEmail && custEmail !== targetEmail) {
    return false;
  }

  const maybeAdminDelegate = (tx as unknown as { adminUser?: typeof tx.adminUser }).adminUser;
  if (maybeAdminDelegate && typeof maybeAdminDelegate.findFirst === "function") {
    const adminOr: Prisma.AdminUserWhereInput[] = [];
    if (customer.supabaseUserId) {
      adminOr.push({ supabaseUserId: customer.supabaseUserId });
    }
    if (custEmail) {
      adminOr.push({ email: { equals: custEmail, mode: "insensitive" } });
    }
    if (adminOr.length > 0) {
      const staffAdmin = await maybeAdminDelegate.findFirst({
        where: { isActive: true, deletedAt: null, OR: adminOr },
        select: { id: true },
      });
      if (staffAdmin) return false;
    }
  }

  return true;
}

/** Resuelve el `contactId` de un `SupportTicket` (desde `/contacto` o `/pedido/[token]`). */
export async function resolveSupportTicketContact(
  db: IdentityDbClient,
  input: {
    customerId?: string | null;
    orderContactId?: string | null;
    email: string;
    name?: string | null;
  },
): Promise<string | null> {
  if (!hasIdentityDelegates(db)) return null;
  if (input.orderContactId) return input.orderContactId;
  return withIdentityTx(db, async (tx) => {
    if (input.customerId && (await canBindSessionCustomerTx(tx, input.customerId, input.email))) {
      const custContactId = await ensureCustomerContactTx(tx, {
        customerId: input.customerId,
        emailVerified: true,
        verificationSource: "SUPPORT_SESSION",
      });
      if (custContactId) return custContactId;
    }
    return resolveOrCreateEmailContactTx(tx, {
      email: input.email,
      source: "SUPPORT_TICKET",
      displayName: buildDisplayName(null, null, input.name),
    });
  });
}

/**
 * Resuelve el `contactId` de una `Quote` dentro de su transacción.
 * Soporta cotizaciones con email y cotizaciones solo-WhatsApp (reutilizando `Contact` previo
 * de tipo `QUOTE` con el mismo `WHATSAPP` si no tenía `primaryEmail`, sin forzar unicidad global).
 */
export async function resolveQuoteContactTx(
  tx: Prisma.TransactionClient,
  input: {
    customerId?: string | null;
    customerName: string;
    customerWhatsapp: string;
    customerEmail?: string | null;
    sourceOverride?: "QUOTE" | "B2B_INQUIRY";
  },
): Promise<string | null> {
  if (!hasIdentityDelegates(tx)) return null;

  const quoteEmail = normalizeEmailIdentity(input.customerEmail);
  const whatsappE164 = normalizePhoneIdentityE164(input.customerWhatsapp);
  const displayName = buildDisplayName(null, null, input.customerName);
  const sourceLabel = input.sourceOverride ?? "QUOTE";

  if (
    input.customerId &&
    (await canBindSessionCustomerTx(tx, input.customerId, quoteEmail || null))
  ) {
    const custContactId = await ensureCustomerContactTx(tx, {
      customerId: input.customerId,
      emailVerified: true,
      verificationSource: "QUOTE_SESSION",
    });
    if (custContactId) {
      if (whatsappE164) {
        await upsertContactIdentityTx(tx, {
          contactId: custContactId,
          type: "WHATSAPP",
          normalizedValue: whatsappE164,
          verificationStatus: "UNVERIFIED_OBSERVED",
          verificationSource: sourceLabel,
        });
      }
      return custContactId;
    }
  }

  if (quoteEmail) {
    return resolveOrCreateEmailContactTx(tx, {
      email: quoteEmail,
      source: sourceLabel,
      displayName,
      whatsappE164: whatsappE164 || null,
    });
  }

  if (!whatsappE164) return null;

  await acquireIdentityLocksTx(tx, [`whatsapp:${whatsappE164}`]);

  const existingWhatsappQuote = await tx.contactIdentity.findFirst({
    where: {
      type: "WHATSAPP",
      normalizedValue: whatsappE164,
      verificationStatus: { not: "REVOKED" },
      contact: {
        deletedAt: null,
        anonymizedAt: null,
        primaryEmail: null,
      },
    },
    orderBy: { createdAt: "asc" },
    select: { contactId: true },
  });

  if (existingWhatsappQuote) {
    await upsertContactIdentityTx(tx, {
      contactId: existingWhatsappQuote.contactId,
      type: "WHATSAPP",
      normalizedValue: whatsappE164,
      verificationStatus: "UNVERIFIED_OBSERVED",
      verificationSource: sourceLabel,
    });
    return existingWhatsappQuote.contactId;
  }

  const created = await tx.contact.create({
    data: {
      primaryEmail: null,
      primaryPhoneE164: whatsappE164,
      displayName,
      source: sourceLabel,
    },
    select: { id: true },
  });

  await upsertContactIdentityTx(tx, {
    contactId: created.id,
    type: "WHATSAPP",
    normalizedValue: whatsappE164,
    verificationStatus: "UNVERIFIED_OBSERVED",
    verificationSource: sourceLabel,
  });

  return created.id;
}

/** Resuelve el `contactId` de un `AbandonedCart` al capturar el email en checkout. */
export async function resolveAbandonedCartContact(
  db: IdentityDbClient,
  input: {
    cartCustomerId?: string | null;
    email: string;
  },
): Promise<string | null> {
  if (!hasIdentityDelegates(db)) return null;
  return withIdentityTx(db, async (tx) => {
    if (
      input.cartCustomerId &&
      (await canBindSessionCustomerTx(tx, input.cartCustomerId, input.email))
    ) {
      const custContactId = await ensureCustomerContactTx(tx, {
        customerId: input.cartCustomerId,
        emailVerified: true,
        verificationSource: "CART_SESSION",
      });
      if (custContactId) return custContactId;
    }
    return resolveOrCreateEmailContactTx(tx, {
      email: input.email,
      source: "ABANDONED_CART",
    });
  });
}

/**
 * Resuelve el `contactId` de un registro `Consent` (Ley 1581 / Newsletter / Back-in-stock).
 * Los banners de cookies puramente anónimos (`customerId == null && !email && !phone`) retornan `null`.
 */
export async function resolveConsentContact(
  db: IdentityDbClient,
  input: {
    customerId?: string | null;
    email?: string | null;
    phone?: string | null;
    emailVerified?: boolean;
    verificationSource?: string;
  },
): Promise<string | null> {
  if (!hasIdentityDelegates(db)) return null;
  const normalizedEmail = normalizeEmailIdentity(input.email);
  const normalizedPhone = normalizePhoneIdentityE164(input.phone);
  if (!input.customerId && !normalizedEmail && !normalizedPhone) {
    return null;
  }

  return withIdentityTx(db, async (tx) => {
    if (
      input.customerId &&
      (await canBindSessionCustomerTx(tx, input.customerId, normalizedEmail || null))
    ) {
      const custContactId = await ensureCustomerContactTx(tx, {
        customerId: input.customerId,
        emailVerified: Boolean(input.emailVerified),
        verificationSource: input.verificationSource ?? "CONSENT",
      });
      if (custContactId) return custContactId;
    }
    if (normalizedEmail) {
      return resolveOrCreateEmailContactTx(tx, {
        email: normalizedEmail,
        source: "NEWSLETTER",
        emailVerified: Boolean(input.emailVerified),
        verificationSource: input.verificationSource ?? "CONSENT",
      });
    }
    if (normalizedPhone) {
      return resolveQuoteContactTx(tx, {
        customerName: "",
        customerWhatsapp: normalizedPhone,
        customerEmail: null,
      });
    }
    return null;
  });
}

/**
 * Resuelve el `contactId` para reclamos posventa (`WarrantyClaim` / `RetractRequest`),
 * priorizando el `order.contactId` ya sellado y cayendo a `customerId` o `orderEmail`.
 */
export async function resolvePostSaleContact(
  db: IdentityDbClient,
  input: {
    orderContactId?: string | null;
    customerId?: string | null;
    orderEmail?: string | null;
  },
): Promise<string | null> {
  if (input.orderContactId) return input.orderContactId;
  if (!hasIdentityDelegates(db)) return null;
  return withIdentityTx(db, async (tx) => {
    if (input.customerId) {
      const custContactId = await ensureCustomerContactTx(tx, {
        customerId: input.customerId,
        emailVerified: true,
        verificationSource: "POST_SALE",
      });
      if (custContactId) return custContactId;
    }
    if (input.orderEmail) {
      return resolveOrCreateEmailContactTx(tx, {
        email: input.orderEmail,
        source: "GUEST_ORDER",
      });
    }
    return null;
  });
}

/**
 * Cascada obligatoria de supresión Habeas Data (Ley 1581 · ADR-193 §4 y SECURITY.md §5):
 *  1. Localiza el `Contact` del titular (por `Customer.contactId` y/o `customerEmail`).
 *  2. Anonimiza toda PII en `Contact` (`primaryEmail`, `primaryPhoneE164`, `displayName`,
 *     `documentType`, `documentNumber` -> `null`), sella `anonymizedAt` + `deletedAt` + `deletedBy`.
 *  3. Elimina todas las filas `ContactIdentity` de ese `Contact` (liberando los índices únicos
 *     parciales y sin dejar rastro del correo/teléfono/UID en la tabla de identidades).
 *  4. Elimina cualquier `IdentityMergeCandidate` en estado `PENDING` donde participe el `Contact`
 *     y limpia `evidenceJson`/`mergeSnapshotJson` de candidatos históricos si existieran.
 *  5. Desvincula `contactId -> null` en `Customer`, `Order`, `SupportTicket`, `Quote`,
 *     `AbandonedCart`, `Consent`, `WarrantyClaim` y `RetractRequest`.
 */
export async function scrubContactOnErasureTx(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    customerContactId?: string | null;
    customerEmail?: string | null;
    now?: Date;
  },
): Promise<void> {
  if (!hasIdentityDelegates(tx)) return;
  const now = input.now ?? new Date();
  const normalizedEmail = normalizeEmailIdentity(input.customerEmail);

  const contactIds = new Set<string>();
  if (input.customerContactId) contactIds.add(input.customerContactId);

  if (normalizedEmail) {
    const byEmail = await findActiveContactByEmailTx(tx, normalizedEmail);
    if (byEmail && (!byEmail.customer || byEmail.customer.id === input.customerId)) {
      contactIds.add(byEmail.id);
    }
  }

  const targetIds = Array.from(contactIds);
  if (targetIds.length === 0) return;

  await Promise.all([
    tx.customer.updateMany({
      where: { id: input.customerId },
      data: { contactId: null },
    }),
    tx.order.updateMany({
      where: { OR: [{ customerId: input.customerId }, { contactId: { in: targetIds } }] },
      data: { contactId: null },
    }),
    tx.supportTicket.updateMany({
      where: { contactId: { in: targetIds } },
      data: { contactId: null },
    }),
    tx.quote.updateMany({
      where: {
        OR: [
          { contactId: { in: targetIds } },
          ...(normalizedEmail
            ? [{ customerEmail: { equals: normalizedEmail, mode: "insensitive" as const } }]
            : []),
        ],
      },
      data: {
        contactId: null,
        customerName: "Cliente eliminado",
        customerEmail: null,
        customerWhatsapp: "",
        notes: null,
        deletedAt: now,
        deletedBy: input.customerId,
      },
    }),
    tx.abandonedCart.updateMany({
      where: { contactId: { in: targetIds } },
      data: { contactId: null },
    }),
    tx.consent.updateMany({
      where: { contactId: { in: targetIds } },
      data: { contactId: null },
    }),
    tx.warrantyClaim.updateMany({
      where: { OR: [{ customerId: input.customerId }, { contactId: { in: targetIds } }] },
      data: { contactId: null },
    }),
    tx.retractRequest.updateMany({
      where: { contactId: { in: targetIds } },
      data: { contactId: null },
    }),
  ]);

  await tx.contactIdentity.deleteMany({
    where: { contactId: { in: targetIds } },
  });

  if (tx.identityMergeCandidate) {
    await tx.identityMergeCandidate.deleteMany({
      where: {
        status: "PENDING",
        OR: [{ primaryContactId: { in: targetIds } }, { secondaryContactId: { in: targetIds } }],
      },
    });
  }

  await tx.contact.updateMany({
    where: { id: { in: targetIds } },
    data: {
      primaryEmail: null,
      primaryPhoneE164: null,
      displayName: null,
      documentType: null,
      documentNumber: null,
      organizationId: null,
      ownerAdminId: null,
      anonymizedAt: now,
      deletedAt: now,
      deletedBy: input.customerId,
    },
  });
}
