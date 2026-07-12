"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import {
  applyCoupon,
  CheckoutError,
  finalizeCheckout,
  finishCheckoutSession,
  removeCoupon,
  savePaymentMethodStep,
} from "@/features/checkout/service";
import { InsufficientStockError } from "@/features/orders/errors";

export async function payWompiAction(): Promise<void> {
  // T4 — rate-limit por IP: finalizeCheckout crea una orden + pega a Wompi, así
  // que limitamos el abuso (creación masiva de órdenes basura). Generoso para no
  // bloquear reintentos legítimos de un cliente con errores.
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
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
    const msg = err instanceof CheckoutError ? err.message : "Error iniciando pago";
    logger.error({
      event: "checkout.pago.finalize_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`/checkout/pago?error=${encodeURIComponent(msg)}`);
  }
}

export async function payCodAction(): Promise<void> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const isProd = process.env.VERCEL_ENV === "production";
  // Bucket SEPARADO y más estricto que Wompi: cada COD permitido crea una orden REAL +
  // una guía Aveonline (con costo potencial), a diferencia de Wompi que no tiene efecto
  // hasta pagar. Anti-fraude/abuso (revisión adversarial COD). [Pendiente: tope por
  // cliente/global diario si el volumen lo exige.]
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
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
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
    return { ok: true, code: res.code, discount: res.discount, message: `Cupón ${res.code} aplicado ✨` };
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
