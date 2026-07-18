"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { verifyTurnstileToken } from "@/lib/turnstile";
import {
  applyCoupon,
  CheckoutError,
  finalizeCheckout,
  finishCheckoutSession,
  removeCoupon,
  savePaymentMethodStep,
} from "@/features/checkout/service";
import { InsufficientStockError } from "@/features/orders/errors";
import { getClientIp } from "@/lib/client-ip";

export async function payWompiAction(formData: FormData): Promise<void> {
  // T4 — rate-limit por IP: finalizeCheckout crea una orden + pega a Wompi, así
  // que limitamos el abuso (creación masiva de órdenes basura). Generoso para no
  // bloquear reintentos legítimos de un cliente con errores.
  const hdrs = await headers();
  const ip = getClientIp(hdrs);

  // Anti-bot: crear una orden + pegar a Wompi es un flujo de abuso (órdenes/intentos
  // basura). El registro ya tenía Turnstile; el checkout no — se cierra ese hueco.
  const turnstile = await verifyTurnstileToken(
    String(formData.get("cf-turnstile-response") ?? ""),
    ip,
  );
  if (!turnstile.success) {
    logger.warn({ event: "checkout.pago.turnstile_fail", ip });
    redirect(
      `/checkout/pago?error=${encodeURIComponent(
        "No pudimos verificar que no eres un robot. Recarga la página e intenta de nuevo.",
      )}`,
    );
  }

  const isProd = process.env.VERCEL_ENV === "production";
  const rl = await rateLimit(ipKey("checkout_pay", ip), isProd ? 20 : 100, 600);
  if (!rl.allowed) {
    logger.warn({ event: "checkout.pago.rate_limited", ip, count: rl.count });
    redirect(
      `/checkout/pago?error=${encodeURIComponent(
        "Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.",
      )}`,
    );
  }

  await savePaymentMethodStep("WOMPI");

  // #3 caso A — el cupón guardado ya estaba inválido al renderizar la página (el resumen mostró
  // precio LLENO). Lo quitamos ANTES de finalizar para no rebotar por un cupón que ya no cuenta:
  // el cliente ya vio el total real. Quitar un cupón solo puede subir el total al valor correcto,
  // nunca cobrar de menos. La carrera (cupón válido al render, inválido al pagar) NO trae el flag →
  // el backstop atómico la rebota con aviso (nunca cobramos en silencio un total no visto).
  if (formData.get("couponInvalidAtRender") === "1") await removeCoupon();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4000";
  const redirectUrl = `${siteUrl}/checkout/gracias`;

  try {
    const result = await finalizeCheckout({ redirectUrl });
    logger.info({
      event: "checkout.pago.redirect_wompi",
      orderId: result.orderId,
      orderNumber: result.orderNumber,
    });
    redirect(result.checkoutUrl);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    // P0-002 — Stock se agotó entre /checkout/datos y este finalizeCheckout.
    // Redirigir a /carrito con mensaje claro. El cart todavía tiene los items
    // (no se vacía hasta PAID) — cliente puede ajustar qty o quitar el item.
    if (err instanceof InsufficientStockError) {
      logger.warn({
        event: "checkout.pago.stock_unavailable",
        variantId: err.variantId,
        requested: err.requested,
        available: err.available ?? null,
      });
      redirect(
        `/carrito?error=${encodeURIComponent(
          "Uno de los productos ya no está disponible. Por favor revisa tu carrito.",
        )}`,
      );
    }
    // #3 caso B — el cupón se invalidó en carrera (válido al render, inválido al pagar). finalize ya
    // limpió el cupón del state; avisamos con un aviso SUAVE (couponNotice) — no es un fallo de pago,
    // la tarjeta nunca se tocó. El cliente re-confirma viendo el total real (nunca cobro silencioso).
    if (err instanceof CheckoutError && err.code === "COUPON_INVALIDATED") {
      logger.info({ event: "checkout.pago.coupon_invalidated_bounce", method: "WOMPI" });
      redirect(`/checkout/pago?couponNotice=${encodeURIComponent(err.message)}`);
    }
    const msg = err instanceof CheckoutError ? err.message : "Error iniciando pago";
    logger.error({
      event: "checkout.pago.finalize_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`/checkout/pago?error=${encodeURIComponent(msg)}`);
  }
}

export async function payCodAction(formData: FormData): Promise<void> {
  const hdrs = await headers();
  const ip = getClientIp(hdrs);

  // Anti-bot: COD es aún MÁS sensible que Wompi (crea orden REAL + guía Aveonline con costo).
  const turnstile = await verifyTurnstileToken(
    String(formData.get("cf-turnstile-response") ?? ""),
    ip,
  );
  if (!turnstile.success) {
    logger.warn({ event: "checkout.pago.cod_turnstile_fail", ip });
    redirect(
      `/checkout/pago?error=${encodeURIComponent(
        "No pudimos verificar que no eres un robot. Recarga la página e intenta de nuevo.",
      )}`,
    );
  }

  const isProd = process.env.VERCEL_ENV === "production";
  // Bucket SEPARADO y más estricto que Wompi: cada COD permitido crea una orden REAL +
  // una guía Aveonline (con costo potencial), a diferencia de Wompi que no tiene efecto
  // hasta pagar. Anti-fraude/abuso (revisión adversarial COD). El tope POR IDENTIDAD
  // (teléfono/email: velocidad, en-vuelo, devoluciones previas, tope cliente nuevo) lo
  // aplica assessCodRisk dentro de finalizeCheckout (ADR-065) — este rate-limit es la
  // primera capa por IP.
  const rl = await rateLimit(ipKey("checkout_cod", ip), isProd ? 6 : 50, 600);
  if (!rl.allowed) {
    logger.warn({ event: "checkout.pago.cod_rate_limited", ip, count: rl.count });
    redirect(
      `/checkout/pago?error=${encodeURIComponent(
        "Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.",
      )}`,
    );
  }

  await savePaymentMethodStep("COD");

  // #3 caso A — ver payWompiAction: cupón ya inválido al render → quitarlo antes de finalizar.
  if (formData.get("couponInvalidAtRender") === "1") await removeCoupon();

  // finalizeCheckout exige un redirectUrl (lo usa Wompi); en COD no se usa.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4000";

  try {
    // Para COD, finalizeCheckout confirma la orden (stock + guía contraentrega + email)
    // y devuelve la URL pública por token (/pedido/<token>?nueva=1).
    const result = await finalizeCheckout({ redirectUrl: `${siteUrl}/checkout/gracias` });
    await finishCheckoutSession(); // limpiar la cookie de checkout (el cart ya lo vació el saga)
    logger.info({
      event: "checkout.pago.cod_confirmed",
      orderId: result.orderId,
      orderNumber: result.orderNumber,
    });
    redirect(result.checkoutUrl);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    // Stock agotado (al crear la orden o en la carrera al confirmar COD) → al carrito.
    if (
      err instanceof InsufficientStockError ||
      (err instanceof CheckoutError && err.code === "STOCK_UNAVAILABLE")
    ) {
      logger.warn({
        event: "checkout.pago.cod_stock_unavailable",
        err: err instanceof Error ? err.message : String(err),
      });
      redirect(
        `/carrito?error=${encodeURIComponent(
          err instanceof CheckoutError
            ? err.message
            : "Uno de los productos ya no está disponible. Por favor revisa tu carrito.",
        )}`,
      );
    }
    // #3 caso B — cupón invalidado en carrera: aviso suave, no fallo de pago (ver payWompiAction).
    if (err instanceof CheckoutError && err.code === "COUPON_INVALIDATED") {
      logger.info({ event: "checkout.pago.coupon_invalidated_bounce", method: "COD" });
      redirect(`/checkout/pago?couponNotice=${encodeURIComponent(err.message)}`);
    }
    const msg = err instanceof CheckoutError ? err.message : "Error confirmando tu pedido";
    logger.error({
      event: "checkout.pago.cod_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`/checkout/pago?error=${encodeURIComponent(msg)}`);
  }
}

// ─────────────────────────── F1 — Cupones ───────────────────────────

export type CouponActionState = {
  ok: boolean;
  message?: string;
  code?: string;
  discount?: number;
} | null;

/**
 * Aplica un código de cupón al checkout. Rate-limited por IP para evitar
 * enumeración de códigos (fuerza bruta adivinando cupones). Devuelve estado para
 * feedback en el UI vía useActionState.
 */
export async function applyCouponAction(
  _prev: CouponActionState,
  formData: FormData,
): Promise<CouponActionState> {
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const isProd = process.env.VERCEL_ENV === "production";
  const rl = await rateLimit(ipKey("coupon_apply", ip), isProd ? 15 : 100, 600);
  if (!rl.allowed) {
    return { ok: false, message: "Demasiados intentos. Espera unos minutos." };
  }

  const code = String(formData.get("code") ?? "");
  try {
    const res = await applyCoupon(code);
    if (!res.ok) return { ok: false, message: res.message };
    revalidatePath("/checkout/pago");
    return {
      ok: true,
      code: res.code,
      discount: res.discount,
      message: `Cupón ${res.code} aplicado ✨`,
    };
  } catch (err) {
    logger.warn({
      event: "checkout.coupon.apply_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, message: "No pudimos aplicar el cupón. Revisa tu carrito." };
  }
}

/** Quita el cupón aplicado y refresca el resumen. */
export async function removeCouponAction(): Promise<void> {
  await removeCoupon();
  revalidatePath("/checkout/pago");
}
