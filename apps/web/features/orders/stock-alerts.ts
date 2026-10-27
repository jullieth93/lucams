/*
 * Alerta in-app INMEDIATA al admin cuando una venta se pierde por stock
 * (2026-10-26 — decisión owner: SOLO canal in-app; sin email, sin umbral
 * configurable de "stock bajo"). El resumen diario cuenta variantes con
 * stock ≤ 5, pero una VENTA perdida no puede esperar a mañana.
 *
 * Cubre los puntos donde un intento de compra muere por InsufficientStockError:
 *  - checkout_step: assertCheckoutAvailability al entrar a un paso del checkout
 *    (features/checkout/service.ts) — la venta se frena antes de crear la orden.
 *  - order_create: assertStockAvailable dentro de createOrderFromCart (misma
 *    validación, en la frontera del dinero) — la orden nunca nace.
 *  - saga_paid: decrementStockForOrder pierde la carrera POST-pago (Wompi ya
 *    cobró) — la orden queda PENDING_PAYMENT con needsReconciliation; esta
 *    alerta la complementa con inmediatez (el cron de alertas tarda hasta 5 min).
 *  - cod_finalize: la misma carrera en COD — finalizeCheckout cancela la orden
 *    y devuelve al cliente al carrito (no hubo cobro en línea).
 *
 * Anti-spam: máximo 1 alerta por VARIANTE cada 6h, persistido en AlertState
 * (mismo mecanismo de ventana que daily-summary / dispatchAlerts — no hay otro
 * dedup por tiempo para notificaciones; el dedupKey de Notification solo agrupa
 * mientras la alerta sigue SIN LEER). El dedupKey de la Notification es el
 * mismo, así que una alerta no leída se ACTUALIZA en vez de duplicarse. La
 * ventana se sella SOLO si notify() tuvo éxito (misma política que
 * daily-summary: no silenciar una alerta que nunca llegó).
 *
 * Redundancia entre puntos: order_create y cod_finalize/saga_paid no se
 * solapan (si la orden no se creó, la saga nunca corre); checkout_step y los
 * demás sí pueden repetirse por la misma variante (reload del paso + submit) —
 * la ventana de 6h los colapsa en una sola fila.
 *
 * NUNCA lanza: los call sites están en la frontera del checkout y de la saga —
 * un fallo de notificación jamás puede romper una compra. Best-effort con log,
 * mismo patrón que notifyCronFailure / markNeedsReconciliation.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notify } from "@/features/notifications/service";

/** Ventana anti-spam por variante (6h). */
export const STOCK_SALE_LOST_DEDUP_MS = 6 * 60 * 60 * 1000;

export type StockSaleLostContext = "checkout_step" | "order_create" | "saga_paid" | "cod_finalize";

const CONTEXT_LABEL: Record<StockSaleLostContext, string> = {
  checkout_step: "el cliente estaba en el checkout",
  order_create: "el cliente confirmó el pago (creación de la orden)",
  saga_paid: "Wompi aprobó el pago y el stock se agotó al confirmarlo (carrera perdida)",
  cod_finalize: "se confirmaba un pedido contra entrega y el stock se agotó en la carrera",
};

export type StockSaleLostInput = {
  context: StockSaleLostContext;
  variantId: string;
  /** Unidades que pedía el cliente (agregado por variante). */
  requested: number;
  /** Stock disponible al momento del fallo (undefined si la variante no existe). */
  available?: number;
  /** Nombre de display ("Producto (Variante)") si el error lo trajo. */
  productName?: string;
  orderId?: string;
  orderNumber?: string;
  /** Inyectable para tests. */
  now?: Date;
};

export async function notifyStockSaleLost(input: StockSaleLostInput): Promise<void> {
  const now = input.now ?? new Date();
  const dedupKey = `stock_sale_lost:${input.variantId}`;
  try {
    const state = await prisma.alertState.findUnique({ where: { key: dedupKey } });
    if (state && now.getTime() - state.lastSentAt.getTime() < STOCK_SALE_LOST_DEDUP_MS) {
      logger.info({
        event: "stock_sale_lost.dedup_skip",
        context: input.context,
        variantId: input.variantId,
      });
      return;
    }

    const name = input.productName ?? `variante ${input.variantId}`;
    const demanded =
      input.available !== undefined
        ? `pedía ${input.requested} y quedaban ${input.available}`
        : `pedía ${input.requested} y ya no existe disponibilidad registrada`;
    const moneyCaptured = input.context === "saga_paid";
    const title = moneyCaptured
      ? `Pago aprobado SIN stock: «${name}»`
      : `Venta perdida por stock: «${name}»`;

    const detail = [
      `Cuando ${CONTEXT_LABEL[input.context]}, ${demanded}.`,
      moneyCaptured
        ? `El pedido ${input.orderNumber ?? "—"} quedó marcado para reconciliación: el dinero YA se cobró — decide reembolso o repón stock.`
        : input.context === "cod_finalize"
          ? `El pedido ${input.orderNumber ?? "—"} se canceló y el cliente volvió al carrito (no hubo cobro en línea).`
          : "No se creó la orden; el cliente volvió al carrito con el aviso.",
      "Acción: repón el stock o pausa la variante desde Inventario.",
    ].join(" ");

    // Deep link accionable: al pedido cuando existe (saga/COD), al inventario si no.
    const actionUrl = input.orderNumber
      ? `/admin/pedidos/${input.orderNumber}`
      : "/admin/inventario";

    await notify({
      type: "ALERT",
      severity: moneyCaptured ? "critical" : "warning",
      title,
      detail,
      actionUrl,
      actionLabel: input.orderNumber ? "Ver pedido" : "Ver inventario",
      dedupKey,
      metadata: {
        context: input.context,
        variantId: input.variantId,
        requested: input.requested,
        available: input.available ?? null,
        orderId: input.orderId ?? null,
        orderNumber: input.orderNumber ?? null,
      },
    });

    // Sellar la ventana SOLO si la notificación se creó (si notify falla, el
    // próximo intento de compra reintenta la alerta en vez de quedar 6h muda).
    await prisma.alertState.upsert({
      where: { key: dedupKey },
      create: { key: dedupKey, lastSentAt: now, lastDetail: title },
      update: { lastSentAt: now, lastDetail: title },
    });
    logger.info({
      event: "stock_sale_lost.notified",
      context: input.context,
      variantId: input.variantId,
      orderId: input.orderId ?? null,
    });
  } catch (err) {
    logger.error({
      event: "stock_sale_lost.notify_failed",
      context: input.context,
      variantId: input.variantId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
