/*
 * Programa "Puntos Lucams" (2026-10-12) — lógica de acumulación y redención.
 *
 * ACUMULACIÓN (earn): la saga post-PAID (features/orders/saga.ts) llama
 * awardLoyaltyPointsForPaidOrder — el cliente gana floor(totalPagado /
 * earnCopPerPoint) puntos sobre el TOTAL cobrado (productos + envío −
 * descuentos). Atómico (LoyaltyTxn + incremento del balance en una tx) e
 * idempotente por orden: el índice único parcial LoyaltyTxn(orderId, reason)
 * convierte el retry del webhook/saga en P2002 → no-op.
 *
 * REDENCIÓN: el checkout guarda los puntos a redimir en el state sellado
 * (CheckoutState.loyaltyPoints) y createOrderFromCart los RESERVA dentro de la
 * tx de creación (decremento gateado del balance + LoyaltyTxn REDEEM +
 * Order.loyaltyPointsRedeemed/loyaltyDiscount) — el descuento queda fijo en el
 * total que se cobra por Wompi/COD, y los puntos salen del balance de
 * inmediato (una PENDING_PAYMENT abandonada los retiene hasta que el cron
 * expire-pending la cancela, igual que el compromiso de stock). La restauración
 * es simétrica a la liberación de cupón (F2): transitionOrder a
 * CANCELLED/REFUNDED devuelve los puntos con LoyaltyTxn REFUND.
 *
 * ORDEN DE APLICACIÓN DE DESCUENTOS (documentado para el negocio): primero el
 * cupón, luego los puntos sobre el subtotal de productos RESTANTE
 * (merchandiseAfterCoupon = subtotal − discount). El tope maxPercent se mide
 * sobre ese restante; el envío NUNCA se paga con puntos. Compatible con
 * cupones sin tocar su validación.
 *
 * Los puntos ganados NO se revierten en un reembolso (queda para ajuste manual
 * futuro); los redimidos sí se restauran.
 */

import "server-only";
import { prisma, Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getLoyaltySettings, type LoyaltySettings } from "./settings";

/** Razones del ledger LoyaltyTxn (el índice único parcial es por (orderId, reason)). */
export const LOYALTY_REASONS = {
  earn: "EARN",
  redeem: "REDEEM",
  refund: "REFUND",
} as const;

/** Etiquetas de cliente para el historial de /mi-cuenta. */
export const LOYALTY_REASON_LABELS: Record<string, string> = {
  EARN: "Puntos ganados por tu compra",
  REDEEM: "Puntos redimidos en tu compra",
  REFUND: "Puntos restaurados (pedido cancelado o reembolsado)",
};

/**
 * El cliente redimió puntos que al crear la orden ya no cubren su balance (los
 * gastó en otra orden en paralelo) o la redención dejó de ser válida (programa
 * apagado, mínimo/tope cambiado). Es el equivalente al CouponInvalidatedError
 * de F1: NUNCA se cobra en silencio un total distinto al exhibido — el checkout
 * limpia los puntos del state y el cliente re-confirma viendo el total real.
 * El `message` es copy customer-safe (es-CO, tuteo).
 */
export class LoyaltyRedemptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoyaltyRedemptionError";
  }
}

// ─────────────────────── Núcleo puro (testeable sin DB) ───────────────────────

/**
 * Puntos ganados por una compra pagada: floor(totalPagadoCOP / earnCopPerPoint).
 * `totalCents` viene en centavos (Order.total); earnCopPerPoint en pesos.
 */
export function computeEarnedPoints(
  totalCents: number,
  settings: Pick<LoyaltySettings, "earnCopPerPoint">,
): number {
  if (totalCents <= 0) return 0;
  return Math.floor(totalCents / 100 / settings.earnCopPerPoint);
}

/** Valor en centavos COP de UN punto según la tasa de redención configurada. */
export function pointValueCents(settings: Pick<LoyaltySettings, "redeemPointsPer1000">): number {
  // 100 puntos = $1.000 COP = 100_000 centavos → 1 punto = 100_000 / per1000.
  return Math.floor(100_000 / settings.redeemPointsPer1000);
}

export type RedemptionQuote =
  | {
      ok: true;
      /** Puntos efectivamente consumidos (clamp por balance y por tope %). */
      points: number;
      discountCents: number;
      /** Qué recortó la redención respecto a lo pedido (null = se aplicó tal cual). */
      cappedBy: "balance" | "cap" | null;
    }
  | { ok: false; message: string };

/**
 * Tarifica una redención de puntos (puro):
 *  - mínimo de redención (redeemMinPoints),
 *  - balance disponible,
 *  - tope: maxPercent% del subtotal de productos TRAS cupón; el envío nunca se
 *    cubre con puntos.
 * El descuento es proporcional (valor por punto × puntos aplicados), así que un
 * tope que recorta no cobra puntos de más: se consumen solo los puntos que
 * efectivamente generan descuento.
 */
export function quoteRedemption(input: {
  requestedPoints: number;
  balance: number;
  /** Subtotal de productos menos el descuento del cupón (centavos COP). */
  merchandiseAfterCouponCents: number;
  settings: Pick<LoyaltySettings, "redeemPointsPer1000" | "redeemMinPoints" | "redeemMaxPercent">;
}): RedemptionQuote {
  const { settings } = input;
  const requested = Math.floor(input.requestedPoints);
  if (!Number.isFinite(requested) || requested <= 0) {
    return { ok: false, message: "Escribe cuántos puntos quieres redimir." };
  }
  if (requested < settings.redeemMinPoints) {
    return {
      ok: false,
      message: `El mínimo de redención es ${settings.redeemMinPoints.toLocaleString("es-CO")} puntos.`,
    };
  }

  const valueCents = pointValueCents(settings);
  const capCents = Math.max(
    0,
    Math.min(
      input.merchandiseAfterCouponCents,
      Math.floor((input.merchandiseAfterCouponCents * settings.redeemMaxPercent) / 100),
    ),
  );
  const maxPointsByCap = Math.floor(capCents / valueCents);

  let cappedBy: "balance" | "cap" | null = null;
  let points = requested;
  const balance = Math.max(0, input.balance);
  if (points > balance) {
    points = balance;
    cappedBy = "balance";
  }
  if (points > maxPointsByCap) {
    points = maxPointsByCap;
    cappedBy = "cap";
  }
  if (points < settings.redeemMinPoints) {
    if (points <= 0) {
      return { ok: false, message: "No tienes puntos suficientes para redimir en esta compra." };
    }
    return {
      ok: false,
      message: `Con esta compra puedes redimir máximo ${points.toLocaleString("es-CO")} puntos (tope del ${settings.redeemMaxPercent}% del subtotal o tu saldo). El mínimo es ${settings.redeemMinPoints.toLocaleString("es-CO")}.`,
    };
  }
  return { ok: true, points, discountCents: points * valueCents, cappedBy };
}

// ─────────────────────── Earn (saga post-PAID) ───────────────────────

/**
 * Acredita los puntos de una orden recién pagada. Lo llama la saga
 * (processPaidOrder) junto a la recompensa de referidos. Best-effort: NUNCA
 * lanza ni interrumpe la saga (mismo criterio que
 * issueReferralRewardsIfFirstPaidOrder). Idempotente por orden vía el índice
 * único LoyaltyTxn(orderId, "EARN"): un retry del webhook o del fallback de
 * /checkout/gracias es un P2002 → no-op.
 */
export async function awardLoyaltyPointsForPaidOrder(orderId: string): Promise<void> {
  try {
    const settings = await getLoyaltySettings();
    if (!settings.enabled) return;
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, number: true, total: true, customerId: true },
    });
    // Invitado (customerId null): sin cuenta no hay balance donde acreditar.
    if (!order?.customerId) return;
    const points = computeEarnedPoints(order.total, settings);
    if (points <= 0) return;

    await prisma.$transaction(async (tx) => {
      await tx.loyaltyTxn.create({
        data: {
          customerId: order.customerId,
          delta: points,
          reason: LOYALTY_REASONS.earn,
          orderId: order.id,
        },
      });
      await tx.customer.update({
        where: { id: order.customerId! },
        data: { loyaltyPoints: { increment: points } },
      });
    });
    logger.info({
      event: "loyalty.earn.awarded",
      orderId: order.id,
      orderNumber: order.number,
      customerId: order.customerId,
      points,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Retry de la saga: la orden ya acreditó sus puntos. Idempotente.
      logger.info({ event: "loyalty.earn.already_awarded", orderId });
      return;
    }
    logger.error({
      event: "loyalty.earn.fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────── Retrocrédito al crear la cuenta (guest → registrado) ───────────────────────

/**
 * Ventana del retrocrédito (decisión owner 2026-10-26): las compras de
 * INVITADO acreditan sus puntos si la persona crea/verifica la cuenta con el
 * MISMO email dentro de los 30 días siguientes a la compra.
 */
export const RETROACTIVE_EARN_WINDOW_DAYS = 30;

/** Estados "dinero recibido" que acreditan puntos (mismo set que referidos). */
const PAID_LIKE_STATUSES = ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] as const;

/**
 * Acredita al Customer recién verificado los puntos de sus órdenes de
 * invitado: PAID (o posterior), email de contacto coincidente EXACTO
 * (case-insensitive), creadas dentro de la ventana de 30 días y sin EARN
 * previo. Lo llaman los flujos de verificación de signup y login (junto al
 * claim de pedidos guest) — NUNCA antes de probar que el caller controla el
 * buzón, o un atacante cobraría los puntos de compras ajenas con solo
 * registrarse con el email de la víctima.
 *
 * Idempotente por orden: el índice único LoyaltyTxn(orderId, "EARN") convierte
 * un retry (o una carrera con la saga) en P2002 → se salta esa orden. Best-
 * effort: NUNCA lanza ni interrumpe el registro/login. Devuelve el total de
 * puntos acreditados en esta corrida (0 si no había nada que acreditar).
 */
export async function awardRetroactivePointsForNewCustomer(input: {
  customerId: string;
  email: string;
}): Promise<number> {
  try {
    const settings = await getLoyaltySettings();
    if (!settings.enabled) return 0;
    const email = input.email.trim();
    if (!email) return 0;
    const since = new Date(Date.now() - RETROACTIVE_EARN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const orders = await prisma.order.findMany({
      where: {
        email: { equals: email, mode: "insensitive" },
        deletedAt: null,
        status: { in: [...PAID_LIKE_STATUSES] },
        createdAt: { gte: since },
        // Nunca órdenes de OTRO Customer ya vinculado (null = guest; el propio
        // id cubre las que claimGuestOrdersForCustomer acaba de atribuirle).
        OR: [{ customerId: null }, { customerId: input.customerId }],
      },
      select: { id: true, number: true, total: true },
    });
    if (orders.length === 0) return 0;

    // Filtro lógico además del índice único: no re-acreditar órdenes que YA
    // tienen su EARN (la saga se los acreditó a otra cuenta legítima, o un
    // retry nuestro ya corrió).
    const earned = await prisma.loyaltyTxn.findMany({
      where: { orderId: { in: orders.map((o) => o.id) }, reason: LOYALTY_REASONS.earn },
      select: { orderId: true },
    });
    const alreadyEarned = new Set(earned.map((t) => t.orderId));

    let awarded = 0;
    for (const order of orders) {
      if (alreadyEarned.has(order.id)) continue;
      const points = computeEarnedPoints(order.total, settings);
      if (points <= 0) continue;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.loyaltyTxn.create({
            data: {
              customerId: input.customerId,
              delta: points,
              reason: LOYALTY_REASONS.earn,
              orderId: order.id,
            },
          });
          await tx.customer.update({
            where: { id: input.customerId },
            data: { loyaltyPoints: { increment: points } },
          });
        });
        awarded += points;
        logger.info({
          event: "loyalty.earn.retroactive",
          orderId: order.id,
          orderNumber: order.number,
          customerId: input.customerId,
          points,
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          // Carrera con la saga o retry: la orden ya acreditó sus puntos.
          logger.info({ event: "loyalty.earn.retroactive_already", orderId: order.id });
          continue;
        }
        throw err;
      }
    }
    return awarded;
  } catch (err) {
    // Best-effort: un fallo acá NUNCA rompe el registro ni el login.
    logger.error({
      event: "loyalty.earn.retroactive_fail",
      customerId: input.customerId,
      err: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

// ─────────────────────── Redeem (creación de la orden) ───────────────────────

/**
 * Tarifica la redención pedida contra la config vigente y el balance del
 * cliente. Devuelve null si no hay redención que aplicar (programa apagado,
 * sin puntos pedidos o sin cliente). Lanza LoyaltyRedemptionError si la
 * redención pedida ya no es válida — el checkout aborta la creación de la
 * orden y pide re-confirmación (nunca cobra un total distinto al exhibido).
 */
export async function quoteRedemptionForOrder(input: {
  customerId: string | null;
  requestedPoints: number | undefined;
  merchandiseAfterCouponCents: number;
}): Promise<{ points: number; discountCents: number; settings: LoyaltySettings } | null> {
  const requested = input.requestedPoints ?? 0;
  if (requested <= 0 || !input.customerId) return null;
  const settings = await getLoyaltySettings();
  if (!settings.enabled) {
    throw new LoyaltyRedemptionError("El programa de puntos está en pausa en este momento.");
  }
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, deletedAt: null },
    select: { loyaltyPoints: true },
  });
  const balance = customer?.loyaltyPoints ?? 0;
  const quote = quoteRedemption({
    requestedPoints: requested,
    balance,
    merchandiseAfterCouponCents: input.merchandiseAfterCouponCents,
    settings,
  });
  if (!quote.ok) throw new LoyaltyRedemptionError(quote.message);
  return { points: quote.points, discountCents: quote.discountCents, settings };
}

/**
 * Reserva los puntos de una orden DENTRO de la tx de creación/reconciliación:
 * decremento gateado del balance (WHERE loyaltyPoints >= points — dos checkouts
 * concurrentes del mismo cliente no pueden gastar los mismos puntos) +
 * LoyaltyTxn REDEEM con el orderId. Lanza LoyaltyRedemptionError si el balance
 * ya no alcanza (aborta la tx; el checkout limpia los puntos del state).
 */
export async function reserveRedeemedPoints(
  tx: Prisma.TransactionClient,
  input: { orderId: string; customerId: string; points: number },
): Promise<void> {
  const dec = await tx.customer.updateMany({
    where: { id: input.customerId, loyaltyPoints: { gte: input.points } },
    data: { loyaltyPoints: { decrement: input.points } },
  });
  if (dec.count !== 1) {
    throw new LoyaltyRedemptionError(
      "Tu saldo de puntos cambió (quizás los usaste en otra compra).",
    );
  }
  await tx.loyaltyTxn.create({
    data: {
      customerId: input.customerId,
      delta: -input.points,
      reason: LOYALTY_REASONS.redeem,
      orderId: input.orderId,
    },
  });
}

/**
 * Libera la reserva de puntos de una orden PENDING que se está reconciliando
 * (el cliente cambió cuántos puntos redimir entre "ir a pagar" y "pagar", o
 * quitó la redención): devuelve los puntos al balance y borra la fila REDEEM
 * (la reserva aún no es historia — la orden no se ha pagado; al pagar queda
 * una sola fila REDEEM con el valor final). No-op si la orden no tenía reserva.
 */
export async function releaseRedeemedPoints(
  tx: Prisma.TransactionClient,
  input: { orderId: string; customerId: string; points: number },
): Promise<void> {
  if (input.points <= 0) return;
  await tx.loyaltyTxn.deleteMany({
    where: { orderId: input.orderId, reason: LOYALTY_REASONS.redeem },
  });
  await tx.customer.updateMany({
    where: { id: input.customerId },
    data: { loyaltyPoints: { increment: input.points } },
  });
}

/**
 * Restauración al CANCELAR/REEMBOLSAR (la llama transitionOrder dentro de su tx,
 * simétrica a la liberación del cupón — F2): devuelve los puntos redimidos con
 * una fila REFUND. Idempotente por el índice único (orderId, "REFUND"): el P2002
 * se traduce a no-op (la transición ya es no-op si el estado no cambia, así que
 * esto es solo defensa ante una doble corrida en carrera).
 */
export async function restoreRedeemedPoints(
  tx: Prisma.TransactionClient,
  input: { orderId: string; customerId: string; points: number },
): Promise<void> {
  if (input.points <= 0) return;
  try {
    await tx.loyaltyTxn.create({
      data: {
        customerId: input.customerId,
        delta: input.points,
        reason: LOYALTY_REASONS.refund,
        orderId: input.orderId,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
  await tx.customer.updateMany({
    where: { id: input.customerId },
    data: { loyaltyPoints: { increment: input.points } },
  });
}

// ─────────────────────── Lecturas de cliente (mi-cuenta / checkout) ───────────────────────

/**
 * Resumen para /mi-cuenta: balance, equivalencia en pesos e historial de
 * movimientos. null si el programa está apagado (la sección no se muestra).
 */
export async function getLoyaltyAccountSummary(customerId: string): Promise<{
  settings: LoyaltySettings;
  balance: number;
  /** Equivalencia del balance en centavos COP si se redimiera todo. */
  balanceValueCents: number;
  txns: Array<{ id: string; delta: number; reason: string; createdAt: Date }>;
} | null> {
  const settings = await getLoyaltySettings();
  if (!settings.enabled) return null;
  const [customer, txns] = await Promise.all([
    prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { loyaltyPoints: true },
    }),
    prisma.loyaltyTxn.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, delta: true, reason: true, createdAt: true },
    }),
  ]);
  const balance = customer?.loyaltyPoints ?? 0;
  return {
    settings,
    balance,
    balanceValueCents: balance * pointValueCents(settings),
    txns,
  };
}
