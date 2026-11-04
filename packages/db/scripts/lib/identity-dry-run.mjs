/*
 * Núcleo puro + ejecutor READ ONLY del perfilador de Identidad Canónica (Fase 5 · ADR-193).
 *
 * Garantías de seguridad (cero suposiciones):
 *   1. Ejecuta el 100 % de sus consultas dentro de una transacción interactiva cuya
 *      primera sentencia activa `set_config('transaction_read_only', 'on', true)` y
 *      verifica `current_setting('transaction_read_only') = 'on'` (fail-closed;
 *      cualquier intento de escritura aborta en PostgreSQL con SQLSTATE 25006).
 *   2. Cero PII en el objeto retornado y en el reporte formateado: nunca emite
 *      correos, teléfonos, nombres, cédulas/NIT ni direcciones en stdout o JSON.
 *   3. Simula con fidelidad exacta la matriz de 4 niveles de ADR-193 (§7.3):
 *      aislamiento estricto de regalos (`Order.isGift = true`), exclusión de
 *      registros anonimizados Ley 1581 (`@deleted.lucamsshop.com` / `deletedAt`),
 *      cero auto-merge por teléfono/nombre/dirección y encolado determinista de
 *      `IdentityMergeCandidate`.
 */

const ANONYMIZED_EMAIL_SUFFIX = "@deleted.lucamsshop.com";

/**
 * Detecta placeholders de supresión Ley 1581 (`deleted-<id>@deleted.lucamsshop.com`).
 * @param {string | null | undefined} raw
 * @returns {boolean}
 */
export function isAnonymizedPlaceholderEmail(raw) {
  if (typeof raw !== "string") return false;
  const normalized = raw.trim().toLowerCase();
  return normalized.endsWith(ANONYMIZED_EMAIL_SUFFIX);
}

/**
 * Normaliza un email para resolución de identidad. Devuelve `""` si está vacío
 * o corresponde a un placeholder anonimizado de supresión Ley 1581.
 * @param {string | null | undefined} raw
 * @returns {string}
 */
export function normalizeEmailIdentity(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return "";
  if (trimmed.endsWith(ANONYMIZED_EMAIL_SUFFIX)) return "";
  return trimmed;
}

/**
 * Normaliza un teléfono humano a E.164 estricto (`+573XXXXXXXXX` para móviles CO
 * de 10 dígitos; `+<dígitos>` para números internacionales de 7..15 dígitos).
 * Devuelve `""` cuando no es un teléfono válido (incluye vacíos o placeholders).
 * @param {string | null | undefined} raw
 * @returns {string}
 */
export function normalizePhoneE164(raw) {
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

/**
 * Normaliza un documento tributario/identidad `(documentType, documentNumber)`.
 * @param {string | null | undefined} docType
 * @param {string | null | undefined} docNumber
 * @returns {string}
 */
export function normalizeTaxDocKey(docType, docNumber) {
  if (typeof docType !== "string" || typeof docNumber !== "string") return "";
  const t = docType.trim().toUpperCase();
  const n = docNumber
    .trim()
    .toUpperCase()
    .replace(/[\s.-]/g, "");
  if (!t || !n) return "";
  return `${t}:${n}`;
}

/**
 * Simula la resolución determinista y probable de ADR-193 sobre un dataset en memoria
 * y retorna ÚNICAMENTE métricas agregadas (cero PII).
 *
 * @param {object} dataset
 */
export function simulateIdentityResolution(dataset) {
  const customers = dataset.customers ?? [];
  const orders = dataset.orders ?? [];
  const supportTickets = dataset.supportTickets ?? [];
  const quotes = dataset.quotes ?? [];
  const abandonedCarts = dataset.abandonedCarts ?? [];
  const consents = dataset.consents ?? [];
  const warrantyClaims = dataset.warrantyClaims ?? [];
  const retractRequests = dataset.retractRequests ?? [];

  /**
   * Contacto simulado en memoria (nunca sale de esta función).
   * @typedef {{
   *   key: string,
   *   hasActiveCustomer: boolean,
   *   customerId: string | null,
   *   source: "CUSTOMER_AUTH" | "GUEST_ORDER" | "SUPPORT_TICKET" | "QUOTE" | "ABANDONED_CART" | "NEWSLETTER",
   *   primaryEmail: string | null,
   *   identities: Map<string, { type: "SUPABASE_USER" | "EMAIL" | "PHONE" | "WHATSAPP", status: "VERIFIED" | "UNVERIFIED_OBSERVED" }>,
   *   buyerPhones: Set<string>,
   *   taxDocs: Set<string>
   * }} SimContact
   */

  /** @type {Map<string, SimContact>} */
  const contactsByKey = new Map();
  /** @type {Map<string, SimContact>} */
  const contactByCustomerId = new Map();
  /** @type {Map<string, SimContact>} */
  const contactByEmail = new Map();
  /** @type {Map<string, SimContact>} */
  const phoneOnlyQuoteContactByE164 = new Map();

  let seq = 0;
  function createSimContact({ hasActiveCustomer, customerId, source, primaryEmail }) {
    seq += 1;
    const key = hasActiveCustomer && customerId ? `cust:${customerId}` : `guest:${seq}`;
    /** @type {SimContact} */
    const c = {
      key,
      hasActiveCustomer,
      customerId,
      source,
      primaryEmail,
      identities: new Map(),
      buyerPhones: new Set(),
      taxDocs: new Set(),
    };
    contactsByKey.set(key, c);
    if (primaryEmail) {
      contactByEmail.set(primaryEmail, c);
    }
    return c;
  }

  /**
   * Registra una identidad en el contacto simulado; `VERIFIED` prevalece sobre `UNVERIFIED_OBSERVED`.
   * @param {SimContact} contact
   * @param {"SUPABASE_USER" | "EMAIL" | "PHONE" | "WHATSAPP"} type
   * @param {string} normalizedValue
   * @param {"VERIFIED" | "UNVERIFIED_OBSERVED"} status
   */
  function addIdentity(contact, type, normalizedValue, status) {
    if (!normalizedValue) return;
    const idKey = `${type}:${normalizedValue}`;
    const prev = contact.identities.get(idKey);
    if (!prev || (prev.status === "UNVERIFIED_OBSERVED" && status === "VERIFIED")) {
      contact.identities.set(idKey, { type, status });
    }
    if (type === "PHONE" || type === "WHATSAPP") {
      contact.buyerPhones.add(normalizedValue);
    }
  }

  function addTaxDoc(contact, docType, docNumber) {
    const key = normalizeTaxDocKey(docType, docNumber);
    if (key) contact.taxDocs.add(key);
  }

  // Contadores de origen
  let activeCustomers = 0;
  let softDeletedCustomers = 0;

  // ── Paso 1: Cuentas Customer activas (Nivel 1 Determinista) ──
  for (const cust of customers) {
    if (cust.deletedAt !== null && cust.deletedAt !== undefined) {
      softDeletedCustomers += 1;
      continue;
    }
    activeCustomers += 1;
    const email = normalizeEmailIdentity(cust.email);
    const existingByEmail = email ? contactByEmail.get(email) : undefined;
    const contact =
      existingByEmail ??
      createSimContact({
        hasActiveCustomer: true,
        customerId: cust.id,
        source: "CUSTOMER_AUTH",
        primaryEmail: email || null,
      });
    contact.hasActiveCustomer = true;
    contact.customerId = cust.id;
    contactByCustomerId.set(cust.id, contact);

    if (typeof cust.supabaseUserId === "string" && cust.supabaseUserId.trim()) {
      addIdentity(contact, "SUPABASE_USER", cust.supabaseUserId.trim(), "VERIFIED");
    }
    if (email) {
      addIdentity(contact, "EMAIL", email, "VERIFIED");
    }
    const phoneE164 = normalizePhoneE164(cust.phone);
    if (phoneE164) {
      addIdentity(contact, "PHONE", phoneE164, "UNVERIFIED_OBSERVED");
    }
    addTaxDoc(contact, cust.documentType, cust.documentNumber);
  }

  // Mapa de candidatos probables (par ordenado canónico -> Set<reasonCode>)
  /** @type {Map<string, Set<string>>} */
  const mergeCandidates = new Map();

  /**
   * Ordena canónicamente dos contactos: primero el que tiene Customer activo;
   * ante empate, orden lexicográfico estable por `key`.
   * @param {SimContact} a
   * @param {SimContact} b
   * @param {string} reasonCode
   */
  function queueMergeCandidate(a, b, reasonCode) {
    if (a.key === b.key) return;
    let primary = a;
    let secondary = b;
    if (!a.hasActiveCustomer && b.hasActiveCustomer) {
      primary = b;
      secondary = a;
    } else if (a.hasActiveCustomer === b.hasActiveCustomer && a.key > b.key) {
      primary = b;
      secondary = a;
    }
    const pairKey = `${primary.key}::${secondary.key}`;
    let reasons = mergeCandidates.get(pairKey);
    if (!reasons) {
      reasons = new Set();
      mergeCandidates.set(pairKey, reasons);
    }
    reasons.add(reasonCode);
  }

  // Contadores de Orders y anomalías forenses
  let activeOrders = 0;
  let softDeletedOrders = 0;
  let registeredOrders = 0;
  let guestOrders = 0;
  let giftOrdersTotal = 0;
  let giftRecipientPhonesIsolated = 0;
  let ordersAnonymizedSkipped = 0;
  let ordersLinkedToCustomerContact = 0;
  let ordersLinkedContextuallyToExistingContact = 0;
  let ordersLinkedToNewGuestContact = 0;

  let authOrderEmailMismatchTotal = 0;
  let authOrderEmailMismatchGift = 0;
  let authOrderEmailMismatchNonGift = 0;

  /** @type {Map<string, SimContact | null>} */
  const orderContactById = new Map();
  /** @type {Array<{ customerContact: SimContact, altEmail: string }>} */
  const pendingAltEmailChecks = [];

  // ── Paso 2: Orders (con aislamiento estricto de regalos ADR-193) ──
  for (const ord of orders) {
    if (ord.deletedAt !== null && ord.deletedAt !== undefined) {
      softDeletedOrders += 1;
      orderContactById.set(ord.id, null);
      continue;
    }
    activeOrders += 1;
    const isGift = Boolean(ord.isGift);
    if (isGift) {
      giftOrdersTotal += 1;
      if (normalizePhoneE164(ord.recipientPhone)) {
        giftRecipientPhonesIsolated += 1;
      }
    }

    const activeCustomerContact = ord.customerId ? contactByCustomerId.get(ord.customerId) : null;
    const orderEmail = normalizeEmailIdentity(ord.email);
    const buyerPhoneE164 = normalizePhoneE164(ord.phone);

    if (activeCustomerContact) {
      registeredOrders += 1;
      ordersLinkedToCustomerContact += 1;
      orderContactById.set(ord.id, activeCustomerContact);

      if (buyerPhoneE164) {
        addIdentity(activeCustomerContact, "PHONE", buyerPhoneE164, "UNVERIFIED_OBSERVED");
      }
      addTaxDoc(activeCustomerContact, ord.billingDocumentType, ord.billingDocumentNumber);

      if (
        orderEmail &&
        activeCustomerContact.primaryEmail &&
        orderEmail !== activeCustomerContact.primaryEmail
      ) {
        authOrderEmailMismatchTotal += 1;
        if (isGift) {
          authOrderEmailMismatchGift += 1;
        } else {
          authOrderEmailMismatchNonGift += 1;
          pendingAltEmailChecks.push({
            customerContact: activeCustomerContact,
            altEmail: orderEmail,
          });
        }
      }
      continue;
    }

    // Orden invitada (o de un Customer ya suprimido con SetNull / soft-delete)
    guestOrders += 1;
    if (isAnonymizedPlaceholderEmail(ord.email) || !orderEmail) {
      ordersAnonymizedSkipped += 1;
      orderContactById.set(ord.id, null);
      continue;
    }

    const existingContact = contactByEmail.get(orderEmail);
    if (existingContact) {
      ordersLinkedContextuallyToExistingContact += 1;
      orderContactById.set(ord.id, existingContact);
      if (buyerPhoneE164) {
        addIdentity(existingContact, "PHONE", buyerPhoneE164, "UNVERIFIED_OBSERVED");
      }
      addTaxDoc(existingContact, ord.billingDocumentType, ord.billingDocumentNumber);
    } else {
      const guestContact = createSimContact({
        hasActiveCustomer: false,
        customerId: null,
        source: "GUEST_ORDER",
        primaryEmail: orderEmail,
      });
      addIdentity(guestContact, "EMAIL", orderEmail, "UNVERIFIED_OBSERVED");
      if (buyerPhoneE164) {
        addIdentity(guestContact, "PHONE", buyerPhoneE164, "UNVERIFIED_OBSERVED");
      }
      addTaxDoc(guestContact, ord.billingDocumentType, ord.billingDocumentNumber);
      ordersLinkedToNewGuestContact += 1;
      orderContactById.set(ord.id, guestContact);
    }
  }

  // ── Paso 3: SupportTicket ──
  let registeredSupportTickets = 0;
  let guestSupportTickets = 0;
  let supportTicketsLinked = 0;
  let supportTicketsAnonymizedSkipped = 0;

  for (const t of supportTickets) {
    const activeCustomerContact = t.customerId ? contactByCustomerId.get(t.customerId) : null;
    if (activeCustomerContact) {
      registeredSupportTickets += 1;
      supportTicketsLinked += 1;
      continue;
    }
    guestSupportTickets += 1;
    const ticketEmail = normalizeEmailIdentity(t.email);
    if (isAnonymizedPlaceholderEmail(t.email) || !ticketEmail) {
      supportTicketsAnonymizedSkipped += 1;
      continue;
    }
    const existing = contactByEmail.get(ticketEmail);
    if (!existing) {
      const created = createSimContact({
        hasActiveCustomer: false,
        customerId: null,
        source: "SUPPORT_TICKET",
        primaryEmail: ticketEmail,
      });
      addIdentity(created, "EMAIL", ticketEmail, "UNVERIFIED_OBSERVED");
    }
    supportTicketsLinked += 1;
  }

  // ── Paso 4: Quote (con email opcional y WhatsApp obligatorio) ──
  let activeQuotes = 0;
  let softDeletedQuotes = 0;
  let quotesWithEmail = 0;
  let quotesPhoneOnly = 0;
  let quotesLinked = 0;

  for (const q of quotes) {
    if (q.deletedAt !== null && q.deletedAt !== undefined) {
      softDeletedQuotes += 1;
      continue;
    }
    activeQuotes += 1;
    const quoteEmail = normalizeEmailIdentity(q.customerEmail);
    const whatsappE164 = normalizePhoneE164(q.customerWhatsapp);

    if (quoteEmail) {
      quotesWithEmail += 1;
      let contact = contactByEmail.get(quoteEmail);
      if (!contact) {
        contact = createSimContact({
          hasActiveCustomer: false,
          customerId: null,
          source: "QUOTE",
          primaryEmail: quoteEmail,
        });
        addIdentity(contact, "EMAIL", quoteEmail, "UNVERIFIED_OBSERVED");
      }
      if (whatsappE164) {
        addIdentity(contact, "WHATSAPP", whatsappE164, "UNVERIFIED_OBSERVED");
      }
      quotesLinked += 1;
      continue;
    }

    quotesPhoneOnly += 1;
    if (!whatsappE164) continue;

    let phoneOnlyContact = phoneOnlyQuoteContactByE164.get(whatsappE164);
    if (!phoneOnlyContact) {
      phoneOnlyContact = createSimContact({
        hasActiveCustomer: false,
        customerId: null,
        source: "QUOTE",
        primaryEmail: null,
      });
      addIdentity(phoneOnlyContact, "WHATSAPP", whatsappE164, "UNVERIFIED_OBSERVED");
      phoneOnlyQuoteContactByE164.set(whatsappE164, phoneOnlyContact);
    }
    quotesLinked += 1;
  }

  // ── Paso 5: AbandonedCart ──
  let abandonedCartsTotal = 0;
  let abandonedCartsLinked = 0;
  let abandonedCartsAnonymizedSkipped = 0;

  for (const ac of abandonedCarts) {
    abandonedCartsTotal += 1;
    const cartCustomerId = ac.cartCustomerId ?? null;
    const activeCustomerContact = cartCustomerId ? contactByCustomerId.get(cartCustomerId) : null;
    if (activeCustomerContact) {
      abandonedCartsLinked += 1;
      continue;
    }
    const acEmail = normalizeEmailIdentity(ac.email);
    if (isAnonymizedPlaceholderEmail(ac.email) || !acEmail) {
      abandonedCartsAnonymizedSkipped += 1;
      continue;
    }
    if (!contactByEmail.has(acEmail)) {
      const created = createSimContact({
        hasActiveCustomer: false,
        customerId: null,
        source: "ABANDONED_CART",
        primaryEmail: acEmail,
      });
      addIdentity(created, "EMAIL", acEmail, "UNVERIFIED_OBSERVED");
    }
    abandonedCartsLinked += 1;
  }

  // ── Paso 6: Consent (Ley 1581 + Newsletter) ──
  let consentsTotal = 0;
  let consentsLinked = 0;
  let consentsAnonymousOrScrubbedSkipped = 0;
  /** @type {Map<string, boolean>} */
  const latestNewsletterByEmail = new Map();

  // Ordenar por acceptedAt ascendente o evaluar última decisión por email para conteo activo
  const sortedConsents = [...consents].sort((a, b) => {
    const ta = a.acceptedAt instanceof Date ? a.acceptedAt.getTime() : 0;
    const tb = b.acceptedAt instanceof Date ? b.acceptedAt.getTime() : 0;
    return ta - tb;
  });

  for (const c of sortedConsents) {
    consentsTotal += 1;
    const cEmail = normalizeEmailIdentity(c.email);
    if (c.scope === "NEWSLETTER" && cEmail) {
      latestNewsletterByEmail.set(cEmail, Boolean(c.accepted));
    }

    const activeCustomerContact = c.customerId ? contactByCustomerId.get(c.customerId) : null;
    if (activeCustomerContact) {
      consentsLinked += 1;
      continue;
    }
    if (cEmail) {
      if (!contactByEmail.has(cEmail)) {
        const created = createSimContact({
          hasActiveCustomer: false,
          customerId: null,
          source: "NEWSLETTER",
          primaryEmail: cEmail,
        });
        addIdentity(created, "EMAIL", cEmail, "UNVERIFIED_OBSERVED");
      }
      consentsLinked += 1;
      continue;
    }
    const cPhone = normalizePhoneE164(c.phone);
    if (cPhone) {
      const quotePhoneContact = phoneOnlyQuoteContactByE164.get(cPhone);
      if (quotePhoneContact) {
        consentsLinked += 1;
        continue;
      }
      const phoneOnlyConsentContact = createSimContact({
        hasActiveCustomer: false,
        customerId: null,
        source: "QUOTE",
        primaryEmail: null,
      });
      addIdentity(phoneOnlyConsentContact, "WHATSAPP", cPhone, "UNVERIFIED_OBSERVED");
      phoneOnlyQuoteContactByE164.set(cPhone, phoneOnlyConsentContact);
      consentsLinked += 1;
      continue;
    }
    consentsAnonymousOrScrubbedSkipped += 1;
  }

  let activeNewsletterUniqueEmails = 0;
  for (const accepted of latestNewsletterByEmail.values()) {
    if (accepted) activeNewsletterUniqueEmails += 1;
  }

  // ── Paso 7: WarrantyClaim y RetractRequest ──
  let warrantyClaimsTotal = 0;
  let warrantyClaimsLinked = 0;
  let warrantyClaimsAnonymizedSkipped = 0;
  for (const wc of warrantyClaims) {
    warrantyClaimsTotal += 1;
    const byCust = wc.customerId ? contactByCustomerId.get(wc.customerId) : null;
    const byOrder = wc.orderId ? orderContactById.get(wc.orderId) : null;
    if (byCust || byOrder) {
      warrantyClaimsLinked += 1;
    } else {
      warrantyClaimsAnonymizedSkipped += 1;
    }
  }

  let retractRequestsTotal = 0;
  let retractRequestsLinked = 0;
  let retractRequestsAnonymizedSkipped = 0;
  for (const rr of retractRequests) {
    retractRequestsTotal += 1;
    const byOrder = rr.orderId ? orderContactById.get(rr.orderId) : null;
    if (byOrder) {
      retractRequestsLinked += 1;
    } else {
      retractRequestsAnonymizedSkipped += 1;
    }
  }

  // ── Paso 8: Señales probables -> IdentityMergeCandidate (Nivel 3, cero auto-merge) ──
  // 8a. Discrepancias históricas [ID-01] (orden autenticada no-regalo cuyo email existe en otro Contact)
  for (const item of pendingAltEmailChecks) {
    const otherContact = contactByEmail.get(item.altEmail);
    if (otherContact && otherContact.key !== item.customerContact.key) {
      queueMergeCandidate(item.customerContact, otherContact, "HISTORICAL_ID01_EMAIL_MISMATCH");
    }
  }

  // 8b. Colisiones de teléfono comprador E.164 entre múltiples contactos distintos
  /** @type {Map<string, SimContact[]>} */
  const contactsPerBuyerPhone = new Map();
  /** @type {Map<string, Set<string>>} */
  const customerIdsPerBuyerPhone = new Map();

  for (const c of contactsByKey.values()) {
    for (const phone of c.buyerPhones) {
      let list = contactsPerBuyerPhone.get(phone);
      if (!list) {
        list = [];
        contactsPerBuyerPhone.set(phone, list);
      }
      list.push(c);

      if (c.hasActiveCustomer && c.customerId) {
        let custSet = customerIdsPerBuyerPhone.get(phone);
        if (!custSet) {
          custSet = new Set();
          customerIdsPerBuyerPhone.set(phone, custSet);
        }
        custSet.add(c.customerId);
      }
    }
  }

  function compareCanonicalContacts(a, b) {
    if (a.hasActiveCustomer !== b.hasActiveCustomer) {
      return a.hasActiveCustomer ? -1 : 1;
    }
    return a.key.localeCompare(b.key);
  }

  let sharedPhonesAcrossContacts = 0;
  let sharedPhonesAcrossActiveCustomers = 0;
  for (const custSet of customerIdsPerBuyerPhone.values()) {
    if (custSet.size >= 2) sharedPhonesAcrossActiveCustomers += 1;
  }

  for (const list of contactsPerBuyerPhone.values()) {
    if (list.length < 2) continue;
    sharedPhonesAcrossContacts += 1;
    const sorted = [...list].sort(compareCanonicalContacts);
    const anchor = sorted[0];
    for (let i = 1; i < sorted.length; i += 1) {
      queueMergeCandidate(anchor, sorted[i], "SAME_BUYER_PHONE_E164");
    }
  }

  // 8c. Colisiones de documento tributario DIAN entre contactos distintos
  /** @type {Map<string, SimContact[]>} */
  const contactsPerTaxDoc = new Map();
  for (const c of contactsByKey.values()) {
    for (const docKey of c.taxDocs) {
      let list = contactsPerTaxDoc.get(docKey);
      if (!list) {
        list = [];
        contactsPerTaxDoc.set(docKey, list);
      }
      list.push(c);
    }
  }

  let sharedTaxDocsAcrossContacts = 0;
  for (const list of contactsPerTaxDoc.values()) {
    if (list.length < 2) continue;
    sharedTaxDocsAcrossContacts += 1;
    const sorted = [...list].sort(compareCanonicalContacts);
    const anchor = sorted[0];
    for (let i = 1; i < sorted.length; i += 1) {
      queueMergeCandidate(anchor, sorted[i], "SAME_BILLING_DOCUMENT");
    }
  }

  // Contabilizar contactos e identidades simuladas por origen y tipo
  const contactsBySource = {
    CUSTOMER_AUTH: 0,
    GUEST_ORDER: 0,
    SUPPORT_TICKET: 0,
    QUOTE: 0,
    ABANDONED_CART: 0,
    NEWSLETTER: 0,
  };
  const identitiesByType = {
    SUPABASE_USER_VERIFIED: 0,
    EMAIL_VERIFIED: 0,
    EMAIL_UNVERIFIED_OBSERVED: 0,
    PHONE_UNVERIFIED_OBSERVED: 0,
    WHATSAPP_UNVERIFIED_OBSERVED: 0,
  };

  let totalIdentities = 0;
  for (const c of contactsByKey.values()) {
    contactsBySource[c.source] += 1;
    for (const idRow of c.identities.values()) {
      totalIdentities += 1;
      const bucket = `${idRow.type}_${idRow.status}`;
      if (bucket in identitiesByType) {
        identitiesByType[bucket] += 1;
      }
    }
  }

  const mergeCandidatesByReason = {
    SAME_BUYER_PHONE_E164: 0,
    SAME_BILLING_DOCUMENT: 0,
    HISTORICAL_ID01_EMAIL_MISMATCH: 0,
  };
  for (const reasons of mergeCandidates.values()) {
    for (const r of reasons) {
      if (r in mergeCandidatesByReason) {
        mergeCandidatesByReason[r] += 1;
      }
    }
  }

  return {
    sourceCounts: {
      activeCustomers,
      softDeletedCustomers,
      activeOrders,
      softDeletedOrders,
      registeredOrders,
      guestOrders,
      giftOrdersTotal,
      supportTicketsTotal: supportTickets.length,
      registeredSupportTickets,
      guestSupportTickets,
      activeQuotes,
      softDeletedQuotes,
      quotesWithEmail,
      quotesPhoneOnly,
      abandonedCartsTotal,
      consentsTotal,
      activeNewsletterUniqueEmails,
      warrantyClaimsTotal,
      retractRequestsTotal,
    },
    forensics: {
      authOrderEmailMismatchTotal,
      authOrderEmailMismatchGift,
      authOrderEmailMismatchNonGift,
      sharedPhonesAcrossActiveCustomers,
      sharedPhonesAcrossContacts,
      sharedTaxDocsAcrossContacts,
      giftRecipientPhonesIsolated,
      anonymizedRecordsPreservedNull: {
        orders: ordersAnonymizedSkipped,
        supportTickets: supportTicketsAnonymizedSkipped,
        abandonedCarts: abandonedCartsAnonymizedSkipped,
        consents: consentsAnonymousOrScrubbedSkipped,
        warrantyClaims: warrantyClaimsAnonymizedSkipped,
        retractRequests: retractRequestsAnonymizedSkipped,
      },
    },
    simulatedProjection: {
      totalContacts: contactsByKey.size,
      contactsWithCustomerAccount: activeCustomers,
      contactsGuestOrLeadOnly: contactsByKey.size - activeCustomers,
      contactsBySource,
      totalIdentities,
      identitiesByType,
      foreignKeyResolution: {
        ordersLinkedToCustomerContact,
        ordersLinkedContextuallyToExistingContact,
        ordersLinkedToNewGuestContact,
        supportTicketsLinked,
        quotesLinked,
        abandonedCartsLinked,
        consentsLinked,
        warrantyClaimsLinked,
        retractRequestsLinked,
      },
      mergeCandidatesTotalPairs: mergeCandidates.size,
      mergeCandidatesByReason,
    },
  };
}

/**
 * Ejecuta el diagnóstico completo sobre PostgreSQL garantizando transacción
 * estrictamente `READ ONLY` (`transaction_read_only = on`).
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   scopePrefix?: string,
 *   afterReadProbe?: (tx: import("@prisma/client").Prisma.TransactionClient) => Promise<void>
 * }} [options]
 */
export async function runIdentityDryRun(prisma, options = {}) {
  const scopePrefix =
    typeof options.scopePrefix === "string" && options.scopePrefix.trim()
      ? options.scopePrefix.trim()
      : null;

  return prisma.$transaction(
    async (tx) => {
      const roRows = await tx.$queryRaw`
        SELECT
          set_config('transaction_read_only', 'on', true) AS applied,
          current_setting('transaction_read_only') AS active
      `;
      const activeMode = Array.isArray(roRows) ? roRows[0]?.active : null;
      if (activeMode !== "on") {
        throw new Error(
          `[identity-dry-run] Falló la activación de transacción READ ONLY (transaction_read_only=${String(activeMode)}).`,
        );
      }

      const customerWhere = scopePrefix
        ? {
            OR: [
              { email: { startsWith: scopePrefix, mode: "insensitive" } },
              { supabaseUserId: { startsWith: scopePrefix } },
              { deletedBy: { startsWith: scopePrefix } },
            ],
          }
        : undefined;

      const orderWhere = scopePrefix
        ? {
            OR: [
              { number: { startsWith: scopePrefix, mode: "insensitive" } },
              { email: { startsWith: scopePrefix, mode: "insensitive" } },
            ],
          }
        : undefined;

      const ticketWhere = scopePrefix
        ? {
            OR: [
              { email: { startsWith: scopePrefix, mode: "insensitive" } },
              { name: { startsWith: scopePrefix } },
              { subject: { startsWith: scopePrefix } },
            ],
          }
        : undefined;

      const quoteWhere = scopePrefix
        ? {
            OR: [
              { number: { startsWith: scopePrefix, mode: "insensitive" } },
              { customerName: { startsWith: scopePrefix } },
              { customerEmail: { startsWith: scopePrefix, mode: "insensitive" } },
            ],
          }
        : undefined;

      const abandonedCartWhere = scopePrefix
        ? {
            OR: [
              { email: { startsWith: scopePrefix, mode: "insensitive" } },
              { cart: { sessionId: { startsWith: scopePrefix } } },
            ],
          }
        : undefined;

      const consentWhere = scopePrefix
        ? {
            OR: [
              { email: { startsWith: scopePrefix, mode: "insensitive" } },
              { version: { startsWith: scopePrefix } },
            ],
          }
        : undefined;

      const warrantyWhere = scopePrefix
        ? {
            orderItem: {
              order: { number: { startsWith: scopePrefix, mode: "insensitive" } },
            },
          }
        : undefined;

      const retractWhere = scopePrefix
        ? {
            orderItem: {
              order: { number: { startsWith: scopePrefix, mode: "insensitive" } },
            },
          }
        : undefined;

      const [
        customers,
        orders,
        supportTickets,
        quotes,
        abandonedCartRows,
        consents,
        warrantyRows,
        retractRows,
      ] = await Promise.all([
        tx.customer.findMany({
          ...(customerWhere ? { where: customerWhere } : {}),
          select: {
            id: true,
            email: true,
            phone: true,
            supabaseUserId: true,
            documentType: true,
            documentNumber: true,
            deletedAt: true,
          },
          orderBy: { createdAt: "asc" },
        }),
        tx.order.findMany({
          ...(orderWhere ? { where: orderWhere } : {}),
          select: {
            id: true,
            customerId: true,
            email: true,
            phone: true,
            isGift: true,
            recipientPhone: true,
            billingDocumentType: true,
            billingDocumentNumber: true,
            deletedAt: true,
          },
          orderBy: { createdAt: "asc" },
        }),
        tx.supportTicket.findMany({
          ...(ticketWhere ? { where: ticketWhere } : {}),
          select: {
            id: true,
            customerId: true,
            email: true,
          },
          orderBy: { createdAt: "asc" },
        }),
        tx.quote.findMany({
          ...(quoteWhere ? { where: quoteWhere } : {}),
          select: {
            id: true,
            customerEmail: true,
            customerWhatsapp: true,
            deletedAt: true,
          },
          orderBy: { createdAt: "asc" },
        }),
        tx.abandonedCart.findMany({
          ...(abandonedCartWhere ? { where: abandonedCartWhere } : {}),
          select: {
            id: true,
            email: true,
            cart: { select: { customerId: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
        tx.consent.findMany({
          ...(consentWhere ? { where: consentWhere } : {}),
          select: {
            id: true,
            customerId: true,
            email: true,
            phone: true,
            scope: true,
            accepted: true,
            acceptedAt: true,
          },
          orderBy: { acceptedAt: "asc" },
        }),
        tx.warrantyClaim.findMany({
          ...(warrantyWhere ? { where: warrantyWhere } : {}),
          select: {
            id: true,
            customerId: true,
            orderItem: { select: { orderId: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
        tx.retractRequest.findMany({
          ...(retractWhere ? { where: retractWhere } : {}),
          select: {
            id: true,
            orderItem: { select: { orderId: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
      ]);

      if (typeof options.afterReadProbe === "function") {
        await options.afterReadProbe(tx);
      }

      const simulation = simulateIdentityResolution({
        customers,
        orders,
        supportTickets,
        quotes,
        abandonedCarts: abandonedCartRows.map((row) => ({
          id: row.id,
          email: row.email,
          cartCustomerId: row.cart?.customerId ?? null,
        })),
        consents,
        warrantyClaims: warrantyRows.map((row) => ({
          id: row.id,
          customerId: row.customerId,
          orderId: row.orderItem.orderId,
        })),
        retractRequests: retractRows.map((row) => ({
          id: row.id,
          orderId: row.orderItem.orderId,
        })),
      });

      return {
        generatedAt: new Date().toISOString(),
        readOnlyVerified: true,
        scoped: Boolean(scopePrefix),
        ...simulation,
      };
    },
    { timeout: 30_000 },
  );
}

/**
 * Formatea el reporte agregado en texto legible para consola (100 % libre de PII).
 * @param {Awaited<ReturnType<typeof runIdentityDryRun>>} report
 * @returns {string}
 */
export function formatIdentityDryRunReport(report) {
  const s = report.sourceCounts;
  const f = report.forensics;
  const p = report.simulatedProjection;

  return [
    "══════════════════════════════════════════════════════════════════════",
    " PERFILAMIENTO READ-ONLY DE IDENTIDAD CANÓNICA (ADR-193 · CERO PII)",
    "══════════════════════════════════════════════════════════════════════",
    `  Modo transacción Postgres : ${report.readOnlyVerified ? "READ ONLY VERIFICADO (on)" : "NO VERIFICADO"}`,
    `  Fecha de corte (UTC)      : ${report.generatedAt}`,
    "",
    "  1. Universo fuente actual",
    `     - Customer activas / suprimidas         : ${s.activeCustomers} / ${s.softDeletedCustomers}`,
    `     - Order activas (registradas / guest)   : ${s.activeOrders} (${s.registeredOrders} / ${s.guestOrders}) · regalos=${s.giftOrdersTotal}`,
    `     - SupportTicket (registrados / guest)   : ${s.supportTicketsTotal} (${s.registeredSupportTickets} / ${s.guestSupportTickets})`,
    `     - Quote activas (con email / solo móvil): ${s.activeQuotes} (${s.quotesWithEmail} / ${s.quotesPhoneOnly})`,
    `     - AbandonedCart / Newsletter activo     : ${s.abandonedCartsTotal} / ${s.activeNewsletterUniqueEmails}`,
    `     - WarrantyClaim / RetractRequest        : ${s.warrantyClaimsTotal} / ${s.retractRequestsTotal}`,
    "",
    "  2. Diagnóstico forense de colisiones y aislamiento",
    `     - [ID-01] Order auth con email != cuenta: ${f.authOrderEmailMismatchTotal} (regalo=${f.authOrderEmailMismatchGift}, no-regalo=${f.authOrderEmailMismatchNonGift})`,
    `     - Teléfonos compartidos (>=2 Customer)  : ${f.sharedPhonesAcrossActiveCustomers}`,
    `     - Teléfonos compartidos (>=2 Contact)   : ${f.sharedPhonesAcrossContacts}`,
    `     - Documentos DIAN compartidos           : ${f.sharedTaxDocsAcrossContacts}`,
    `     - Teléfonos de destinatario aislados    : ${f.giftRecipientPhonesIsolated}`,
    `     - Filas Ley 1581 preservadas sin perfil : orders=${f.anonymizedRecordsPreservedNull.orders}, tickets=${f.anonymizedRecordsPreservedNull.supportTickets}, consents=${f.anonymizedRecordsPreservedNull.consents}`,
    "",
    "  3. Proyección simulada bajo ADR-193 (sin escrituras)",
    `     - Contact netos a crear                 : ${p.totalContacts} (con cuenta=${p.contactsWithCustomerAccount}, invitados/leads=${p.contactsGuestOrLeadOnly})`,
    `       · por origen: auth=${p.contactsBySource.CUSTOMER_AUTH}, guest_order=${p.contactsBySource.GUEST_ORDER}, ticket=${p.contactsBySource.SUPPORT_TICKET}, quote=${p.contactsBySource.QUOTE}, cart=${p.contactsBySource.ABANDONED_CART}, newsletter=${p.contactsBySource.NEWSLETTER}`,
    `     - ContactIdentity totales               : ${p.totalIdentities} (auth=${p.identitiesByType.SUPABASE_USER_VERIFIED}, email_verif=${p.identitiesByType.EMAIL_VERIFIED}, email_obs=${p.identitiesByType.EMAIL_UNVERIFIED_OBSERVED}, phone_obs=${p.identitiesByType.PHONE_UNVERIFIED_OBSERVED}, wa_obs=${p.identitiesByType.WHATSAPP_UNVERIFIED_OBSERVED})`,
    `     - IdentityMergeCandidate (revisión MFA) : ${p.mergeCandidatesTotalPairs} pares (phone=${p.mergeCandidatesByReason.SAME_BUYER_PHONE_E164}, doc=${p.mergeCandidatesByReason.SAME_BILLING_DOCUMENT}, id01=${p.mergeCandidatesByReason.HISTORICAL_ID01_EMAIL_MISMATCH})`,
    "══════════════════════════════════════════════════════════════════════",
  ].join("\n");
}
