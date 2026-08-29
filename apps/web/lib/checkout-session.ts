/*
 * Checkout multi-step state — AES-256-GCM sealed cookie.
 *
 * Por qué cookie y no DB:
 *  - Si el cliente abandona en step 2, no queremos una Order draft en
 *    /admin/pedidos contaminando el listado.
 *  - La Order se crea atómicamente solo cuando el cliente llega a step 3
 *    y dispara "Pagar" → entonces sí se persiste en DB con status PENDING_PAYMENT.
 *
 * F-9 (security audit 2026-08-24): the state carries full PII (contact name,
 * email, phone, document number, address), so the cookie value is SEALED with
 * AES-256-GCM — random IV per write, key derived from CSRF_SECRET — and not
 * merely signed: base64 is not encryption, and anyone with access to the
 * client's browser profile could read it. The GCM auth tag replaces the old
 * outer HMAC for integrity (tamper-evident, verified on unseal). If unsealing
 * fails (tampered, legacy HMAC format, wrong secret) or the state expired,
 * the cookie is ignored and the client goes back to step 1.
 *
 * TTL: 60 min — tiempo razonable para completar un checkout. Si expira,
 * el cliente vuelve al inicio.
 */

import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { logger } from "@/lib/logger";

const COOKIE_NAME = "checkout_state";
const TTL_SECONDS = 60 * 60; // 60 min
const ALGORITHM = "sha256";

export type CheckoutStep = 1 | 2 | 3;

export type ContactData = {
  fullName: string;
  email: string;
  phone: string;
  documentType?: "CC" | "CE" | "NIT" | "PP" | "TI";
  documentNumber?: string;
};

type BaseAddress = {
  deptCode: string; // 2 dígitos DANE
  cityCode: string; // 5 dígitos DANE
  department: string;
  city: string;
  zip?: string;
  notes?: string;
};

type UrbanAddress = BaseAddress & {
  kind: "urban";
  viaType:
    | "Calle"
    | "Carrera"
    | "Diagonal"
    | "Transversal"
    | "Avenida"
    | "Avenida Calle"
    | "Avenida Carrera"
    | "Autopista"
    | "Circular"
    | "Manzana";
  viaNumber: string;
  /** Bis (segunda vía paralela, nomenclatura DIAN CO). */
  viaBis?: boolean;
  /** Cuadrante (Norte/Sur/Este/Oeste) — Lucy 2026-05-21 */
  viaCardinal?: "" | "Norte" | "Sur" | "Este" | "Oeste";
  cruceNumber: string;
  cruceCardinal?: "" | "Norte" | "Sur" | "Este" | "Oeste";
  detail?: string;
};

type RuralAddress = BaseAddress & {
  kind: "rural";
  vereda: string;
  finca?: string;
  referencia: string;
};

// Discriminated union: cliente elige urbana o rural en step 1 (Lucy
// 2026-05-21 — Colombia tiene mucho envío rural que no encaja en
// nomenclatura DIAN urbana).
export type AddressData = UrbanAddress | RuralAddress;

export type BillingData = {
  wantsInvoice: boolean;
  documentType?: "CC" | "CE" | "NIT" | "PP";
  documentNumber?: string;
  name?: string;
};

export type ShippingSelection = {
  carrier: string;
  carrierName: string;
  fleteCop: number;
  deliveryDays: number;
  contraentrega: boolean;
  quoteId: string;
};

/**
 * Set de cotizaciones de envío que el SERVIDOR ofreció en el step 2
 * (anti-manipulación de flete — certificación 2026-07-29). Viaja en 2 sitios:
 *   1. Hidden input `offersToken` del form de /checkout/envio, sellado HMAC
 *      (sealShippingOffersPayload) — la página RSC no puede escribir cookies,
 *      así que el set firmado hace ida y vuelta dentro del HTML.
 *   2. Este campo en la cookie (lo escribe saveShippingSelectionStep, una
 *      Server Action que SÍ puede) — finalizeCheckout lo re-valida antes de
 *      crear la Order (el carrito/destino pudo cambiar tras seleccionar).
 */
export type ShippingOffersPayload = {
  /** Cotizaciones EXACTAS ofrecidas (fuente de verdad del flete). */
  offers: ShippingSelection[];
  /** Huella del carrito (variantId/qty/unitPrice) al cotizar. */
  cartHash: string;
  /** Destino (deptCode:cityCode DANE) al cotizar. */
  destKey: string;
  /** epoch ms de la cotización — expira con el mismo TTL que la cookie. */
  quotedAt: number;
};

export type CheckoutState = {
  step: CheckoutStep;
  contact?: ContactData;
  address?: AddressData;
  billing?: BillingData;
  shippingSelection?: ShippingSelection;
  shippingOffers?: ShippingOffersPayload;
  paymentMethod?: "WOMPI" | "COD";
  couponCode?: string; // F1 — código aplicado; el descuento se recalcula al vuelo
  updatedAt: number; // epoch ms
};

function getSecret(): string {
  const secret = process.env.CSRF_SECRET?.trim();
  if (!secret || secret.startsWith("GENERATE_WITH")) {
    throw new Error(
      "CSRF_SECRET no configurado (usado para sellar la checkout cookie y firmar tokens). " +
        "Generar con: openssl rand -hex 32",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac(ALGORITHM, getSecret()).update(payload).digest("base64url");
}

function verify(payload: string, signature: string): boolean {
  const expected = sign(payload);
  // timing-safe compare
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// --- Cookie sealing (AES-256-GCM) ---------------------------------------------
// Domain-separated key: the raw CSRF_SECRET still keys the HMAC of the shipping
// offers token below, so the GCM key is derived with a purpose prefix instead of
// reusing the secret directly for two primitives.
function encryptionKey(): Buffer {
  return crypto.createHash("sha256").update(`checkout-session:${getSecret()}`).digest();
}

/** Seals a JSON string as `base64url(iv).base64url(tag).base64url(ciphertext)`. */
function sealPayload(json: string): string {
  const iv = crypto.randomBytes(12); // 96-bit IV — GCM standard, random per write
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(json, "utf-8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString("base64url")).join(".");
}

/**
 * Opens a sealed cookie value. Returns null when the value is not a current
 * sealed payload — including LEGACY HMAC cookies (`payload.signature`, 2
 * segments; they live at most one 60-min TTL past deploy), tampering (GCM
 * auth tag mismatch) or corruption.
 */
function unsealPayload(raw: string): string | null {
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64url"));
  // Key derivation stays OUTSIDE the try: a missing CSRF_SECRET is a config
  // error and must throw loudly, not degrade to "no session".
  const key = encryptionKey();
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
  } catch {
    return null;
  }
}

/**
 * Lee el state de la cookie. Devuelve null si:
 *  - no hay cookie
 *  - no des-sella (manipulada, formato legacy HMAC, secreto equivocado)
 *  - JSON corrupto
 *  - expirada (updatedAt + TTL < ahora)
 */
export async function getCheckoutState(): Promise<CheckoutState | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const decoded = unsealPayload(raw);
  if (decoded === null) {
    logger.warn({ event: "checkout.cookie.unseal_fail" });
    return null;
  }

  try {
    const state = JSON.parse(decoded) as CheckoutState;
    if (Date.now() - state.updatedAt > TTL_SECONDS * 1000) {
      logger.info({ event: "checkout.cookie.expired" });
      return null;
    }
    return state;
  } catch (err) {
    logger.warn({
      event: "checkout.cookie.parse_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Guarda state sellado. Merge sobre lo que ya había para que cada step
 * solo necesite pasar sus campos nuevos.
 */
export async function setCheckoutState(partial: Partial<CheckoutState>): Promise<CheckoutState> {
  const current = (await getCheckoutState()) ?? { step: 1 as CheckoutStep, updatedAt: Date.now() };
  const next: CheckoutState = {
    ...current,
    ...partial,
    updatedAt: Date.now(),
  };
  const value = sealPayload(JSON.stringify(next));

  const jar = await cookies();
  jar.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
  return next;
}

export async function clearCheckoutState(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/**
 * Sella el set de cotizaciones de envío para que viaje por el FORM del step 2
 * (hidden input `offersToken`) sin que el cliente pueda alterarlo — HMAC
 * (integrity only: this payload has no PII — carrier quotes + cart/dest
 * hashes — so unlike the checkout cookie it does not need GCM sealing).
 * La página RSC que cotiza no puede escribir cookies (Next solo
 * permite writes en Server Actions / Route Handlers), así que el set firmado
 * hace ida y vuelta dentro del HTML y la Server Action lo valida al recibirlo.
 */
export function sealShippingOffersPayload(payload: ShippingOffersPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  return `${body}.${sign(body)}`;
}

/**
 * Abre un `offersToken` sellado. Devuelve null si: firma inválida (manipulado),
 * JSON corrupto, shape inesperado o cotización más vieja que el TTL (la misma
 * ventana de 60 min de la cookie).
 */
export function openShippingOffersPayload(token: string): ShippingOffersPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  if (!verify(body, signature)) {
    logger.warn({ event: "checkout.shipping_offers.invalid_signature" });
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    const payload = decoded as ShippingOffersPayload;
    if (
      !Array.isArray(payload.offers) ||
      typeof payload.cartHash !== "string" ||
      typeof payload.destKey !== "string" ||
      typeof payload.quotedAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - payload.quotedAt > TTL_SECONDS * 1000) {
      logger.info({ event: "checkout.shipping_offers.expired" });
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
