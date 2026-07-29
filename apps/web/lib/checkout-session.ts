/*
 * Checkout multi-step state — cookie firmada con HMAC.
 *
 * Por qué cookie y no DB:
 *  - Si el cliente abandona en step 2, no queremos una Order draft en
 *    /admin/pedidos contaminando el listado.
 *  - La Order se crea atómicamente solo cuando el cliente llega a step 3
 *    y dispara "Pagar" → entonces sí se persiste en DB con status PENDING_PAYMENT.
 *
 * HMAC firma: cliente no puede manipular el JSON (cambiar precio, etc.).
 * Si la firma falla, se ignora la cookie y se manda al cliente a step 1.
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
      "CSRF_SECRET no configurado (usado para firmar checkout cookie). " +
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

/**
 * Lee el state de la cookie. Devuelve null si:
 *  - no hay cookie
 *  - firma inválida (manipulada)
 *  - JSON corrupto
 *  - expirada (updatedAt + TTL < ahora)
 */
export async function getCheckoutState(): Promise<CheckoutState | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);

  if (!verify(payload, signature)) {
    logger.warn({ event: "checkout.cookie.invalid_signature" });
    return null;
  }

  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf-8");
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
 * Guarda state firmado. Merge sobre lo que ya había para que cada step
 * solo necesite pasar sus campos nuevos.
 */
export async function setCheckoutState(partial: Partial<CheckoutState>): Promise<CheckoutState> {
  const current = (await getCheckoutState()) ?? { step: 1 as CheckoutStep, updatedAt: Date.now() };
  const next: CheckoutState = {
    ...current,
    ...partial,
    updatedAt: Date.now(),
  };
  const payload = Buffer.from(JSON.stringify(next), "utf-8").toString("base64url");
  const signature = sign(payload);
  const value = `${payload}.${signature}`;

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
 * (hidden input `offersToken`) sin que el cliente pueda alterarlo — mismo HMAC
 * de la cookie. La página RSC que cotiza no puede escribir cookies (Next solo
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
