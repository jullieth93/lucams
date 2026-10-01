/*
 * Token firmado de reseña (email "Dejar una reseña" → /resena/<token>).
 *
 * Problema (F-11): el email de solicitud de reseña no puede apuntar a la vista
 * pública del pedido porque el publicTrackingToken ya no se persiste en claro,
 * y el form de la PDP exige login — los invitados no tenían cómo reseñar.
 *
 * Solución: token HMAC-SHA256 STATELESS (sin tabla ni migración) con el payload
 * mínimo para verificar la compra: pedido + productos reseñables + correo del
 * comprador + expiración. La firma se deriva de CSRF_SECRET con separación de
 * dominio (`review-token:` prefijo, mismo patrón que la llave GCM de
 * lib/checkout-session.ts) para que un token de otro propósito no sea
 * intercambiable con este aunque compartan secreto raíz.
 *
 * Formato: `base64url(json).base64url(hmac)` — igual que el offersToken del
 * checkout (sealShippingOffersPayload). El payload NO es secreto (lo recibe el
 * propio cliente en su correo), solo necesita integridad.
 *
 * Expiración: 30 días desde la emisión. El correo sale ~7-30 días post-entrega
 * (cron de review-request), así que el link vive holgado para que el cliente lo
 * abra cuando tenga tiempo.
 *
 * Uso único: no hay constraint (orderId, productId) en Review y no se agrega
 * migración. Garantías combinadas (ver token-actions.ts):
 *   - Si el correo matchea un Customer, el índice parcial existente
 *     Review_productId_customerId_active_unique lo hace imposible a nivel DB
 *     (se captura P2002).
 *   - Si es invitado puro (customerId null), se valida consultando si ya existe
 *     reseña con el marcador createdBy `review-token:<orderNumber>` para ese
 *     producto. Una race de doble submit concurrente podría colar un duplicado
 *     huérfano: queda mitigada porque TODA reseña entra PENDING (isApproved
 *     false) y la moderación en /admin/resenas ve el duplicado antes de
 *     publicarlo.
 */

import "server-only";
import crypto from "node:crypto";
import { logger } from "@/lib/logger";

const ALGORITHM = "sha256";
export const REVIEW_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

export type ReviewTokenPayload = {
  orderId: string;
  orderNumber: string;
  email: string;
  productIds: string[];
  /** epoch ms de expiración. */
  exp: number;
};

function getSecret(): string {
  const secret = process.env.CSRF_SECRET?.trim();
  if (!secret || secret.startsWith("GENERATE_WITH")) {
    throw new Error(
      "CSRF_SECRET no configurado (usado para firmar el token de reseña). " +
        "Generar con: openssl rand -hex 32",
    );
  }
  return secret;
}

// Llave derivada con separación de dominio (mismo patrón que encryptionKey()
// de checkout-session): el HMAC de este token no comparte llave cruda con los
// otros usos de CSRF_SECRET.
function signingKey(): Buffer {
  return crypto.createHash("sha256").update(`review-token:${getSecret()}`).digest();
}

function sign(body: string): string {
  return crypto.createHmac(ALGORITHM, signingKey()).update(body).digest("base64url");
}

export function createReviewToken(
  input: Omit<ReviewTokenPayload, "exp">,
  now: number = Date.now(),
): string {
  const payload: ReviewTokenPayload = { ...input, exp: now + REVIEW_TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  return `${body}.${sign(body)}`;
}

/**
 * Abre un token de reseña. Devuelve null si: firma inválida (manipulado),
 * formato inesperado, JSON corrupto, shape inválido o expirado. Una
 * CSRF_SECRET faltante es error de configuración y lanza (mismo criterio que
 * checkout-session: fallar ruidoso, no degradar a "token inválido").
 */
export function verifyReviewToken(
  token: string,
  now: number = Date.now(),
): ReviewTokenPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = sign(body);
  if (signature.length !== expected.length) {
    logger.warn({ event: "review.token.invalid_signature" });
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    logger.warn({ event: "review.token.invalid_signature" });
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof payload.orderId !== "string" ||
      typeof payload.orderNumber !== "string" ||
      typeof payload.email !== "string" ||
      !Array.isArray(payload.productIds) ||
      payload.productIds.length === 0 ||
      !payload.productIds.every((id: unknown) => typeof id === "string") ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp <= now) {
      logger.info({ event: "review.token.expired", orderNumber: payload.orderNumber });
      return null;
    }
    return payload as ReviewTokenPayload;
  } catch {
    return null;
  }
}
