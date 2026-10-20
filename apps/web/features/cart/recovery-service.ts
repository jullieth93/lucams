import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { hashBearerToken } from "@/lib/token-hash";
import { getSiteUrl } from "@/features/emails/layout";
import { peekCartSession } from "@/lib/cart-session";
import {
  buildCommercialEmailHeaders,
  encodeUnsubscribeParam,
} from "@/features/newsletter/unsubscribe";
import { renderCartRecoveryEmail } from "@/features/emails/registry";
import { designDisplayUnits } from "@/features/personalization/design-units";
import { getCartRecoverySettings } from "@/features/cart/recovery-settings";

/*
 * Recuperación de carrito abandonado (palanca de ingreso, auditoría 2026-07-13).
 *  - recordAbandonedCartEmail: hook ADITIVO del checkout (al escribir el email) que registra el
 *    carrito como abandonable. Best-effort → nunca rompe checkout.
 *  - sendCartRecoveryReminders: cron que envía recordatorios según la CONFIG del módulo
 *    (features/cart/recovery-settings.ts, Fase 4 2026-10-13): enabled/mode/idleHours/
 *    maxReminders/intervalHours. Defaults = comportamiento histórico (UN recordatorio
 *    a carritos con email inactivos ≥4h). Detecta conversión (el saga soft-deletea el
 *    cart tras PAID → recoveredAt).
 *  - sendReminderToCart: envío MANUAL a voluntad desde /admin/carritos (Fase 4).
 *
 * F-11 (auditoría seguridad 2026-08-24): el recoverToken se genera RECIÉN al
 * enviar el recordatorio (no al registrar el abandono) y en DB solo queda su
 * hash sha256 — el plano vive únicamente en el email enviado. Si un envío falla
 * tras persistir el hash, el próximo ciclo ROTA el token (no podemos releerlo)
 * y manda un link nuevo; el link del intento anterior nunca llegó al cliente.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Select compartido por el batch del cron y el envío manual (Fase 4). */
const REMINDER_ROW_SELECT = {
  id: true,
  email: true,
  reminderCount: true,
  lastReminderSentAt: true,
  recoveredAt: true,
  cart: {
    select: {
      deletedAt: true,
      items: {
        select: {
          qty: true,
          variant: { select: { product: { select: { name: true } } } },
          // Multi-unidad (2026-09-09): la línea de un diseño con N unidades
          // tiene qty=1 (el pack va en unitPrice) — el ×N del correo sale
          // de las unidades reales del diseño.
          design: { select: { canvasData: true, metadata: true } },
        },
      },
    },
  },
} as const;

type ReminderRow = {
  id: string;
  email: string;
  reminderCount: number;
  lastReminderSentAt: Date | null;
  recoveredAt: Date | null;
  cart: {
    deletedAt: Date | null;
    items: Array<{
      qty: number;
      variant: { product: { name: string } };
      design: Parameters<typeof designDisplayUnits>[0];
    }>;
  };
};

export async function recordAbandonedCartEmail(email: string): Promise<void> {
  try {
    const sessionId = await peekCartSession();
    if (!sessionId) return;
    const cart = await prisma.cart.findFirst({
      where: { sessionId, deletedAt: null },
      select: { id: true, _count: { select: { items: true } } },
    });
    if (!cart || cart._count.items === 0) return;
    // F-11: el token de recuperación NO se genera acá sino al enviar el
    // recordatorio (solo su hash toca la DB).
    await prisma.abandonedCart.upsert({
      where: { cartId: cart.id },
      create: {
        cartId: cart.id,
        email,
      },
      // Solo refresca el email si cambió; NO toca token/recovered/reminder (idempotente).
      update: { email },
    });
  } catch (err) {
    logger.error({
      event: "abandoned_cart.record.fail",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Items del correo: unidades físicas = unidades del diseño × qty de la línea. */
function toEmailItems(row: ReminderRow): Array<{ name: string; qty: number; units?: number }> {
  return row.cart.items.map((i) => {
    const perDesign = designDisplayUnits(i.design);
    return {
      name: i.variant.product.name,
      qty: i.qty,
      units: perDesign === null ? undefined : perDesign * i.qty,
    };
  });
}

type AttemptResult = "sent" | "skipped" | "circuit-open" | "failed";

/**
 * Núcleo de UN envío de recordatorio (cron y manual, Fase 4 2026-10-13):
 * token fresco (solo hash en DB), render con overrides y sendEmail comercial.
 * NO marca lastReminderSentAt ni reminderCount — eso lo decide el caller según
 * el resultado (markReminderSent).
 */
async function attemptReminder(
  row: ReminderRow,
  items: Array<{ name: string; qty: number; units?: number }>,
  siteUrl: string,
): Promise<AttemptResult> {
  // F-11 — token fresco por intento de envío: persistimos SOLO su hash
  // (reemplaza cualquier hash previo: el plano viejo no es recuperable y su
  // email nunca se envió con éxito, o no estaríamos reintentando).
  const recoverToken = crypto.randomBytes(24).toString("base64url");
  await prisma.abandonedCart.update({
    where: { id: row.id },
    data: { recoverTokenHash: hashBearerToken(recoverToken) },
  });
  const tpl = await renderCartRecoveryEmail({
    recoverToken,
    items,
    unsubscribeUrl: `${siteUrl}/unsubscribe?u=${encodeUnsubscribeParam(row.email)}`,
  });
  const result = await sendEmail({
    to: row.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    // Fase 4 — clave POR INTENTO (row.id + nº de recordatorio): con
    // maxReminders > 1 o reenvíos manuales, la clave fija `cart-recovery-<id>`
    // de antes haría que Resend DEDUPE el segundo correo del mismo carrito.
    idempotencyKey: `cart-recovery-${row.id}-${row.reminderCount + 1}`,
    tags: [{ name: "type", value: "cart_recovery" }],
    // #7/#8 — recordatorio COMERCIAL: se suprime si rebotó/quejó + lleva One-Click unsubscribe.
    commercial: true,
    headers: buildCommercialEmailHeaders(row.email, siteUrl),
  });
  if (!result.sent && result.skipped && result.reason === "circuit-open") return "circuit-open";
  if (result.sent) return "sent";
  // Stub de dev (reason 'no-api-key'): se "salta" pero cuenta como procesado.
  if (result.skipped) return "skipped";
  return "failed";
}

/** Marca el recordatorio como enviado: fecha + conteo (Fase 4). */
async function markReminderSent(id: string, now: Date): Promise<void> {
  await prisma.abandonedCart.update({
    where: { id },
    data: { lastReminderSentAt: now, reminderCount: { increment: 1 } },
  });
}

export type CartRecoveryBatchResult = {
  sent: number;
  recovered: number;
  considered: number;
  /**
   * Fase 4 (2026-10-13) — por qué el batch no envió nada SIN ser error:
   *  - "disabled": el módulo está apagado (CART_RECOVERY_ENABLED=false).
   *  - "manual":   modo manual — el cron no envía, solo el admin a voluntad.
   * undefined = el batch corrió normal.
   */
  skippedReason?: "disabled" | "manual";
};

export async function sendCartRecoveryReminders(
  now: Date = new Date(),
): Promise<CartRecoveryBatchResult> {
  // Fase 4 — la lógica la gobierna la config del módulo (admin › Carritos ›
  // Configuración). El schedule pg_cron NO cambia: corre periódico y acá se
  // decide si toca enviar o no.
  const settings = await getCartRecoverySettings();
  if (!settings.enabled) {
    logger.info({ event: "cart_recovery.batch", skippedReason: "disabled", considered: 0 });
    return { sent: 0, recovered: 0, considered: 0, skippedReason: "disabled" };
  }
  if (settings.mode === "manual") {
    logger.info({ event: "cart_recovery.batch", skippedReason: "manual", considered: 0 });
    return { sent: 0, recovered: 0, considered: 0, skippedReason: "manual" };
  }

  const notOlderThan = new Date(now.getTime() - 7 * DAY_MS); // ignora abandonos > 7 días
  const waitedAtLeast = new Date(now.getTime() - settings.idleHours * HOUR_MS);
  const resendCutoff = new Date(now.getTime() - settings.intervalHours * HOUR_MS);

  const rows = await prisma.abandonedCart.findMany({
    where: {
      recoveredAt: null,
      createdAt: { gte: notOlderThan, lte: waitedAtLeast },
      // Fase 4 — N recordatorios por carrito: elegible si no llegó al tope Y
      // (nunca se le escribió O ya pasó el intervalo mínimo desde el último).
      // Con los defaults (max 1) equivale al gate histórico `lastReminderSentAt: null`.
      reminderCount: { lt: settings.maxReminders },
      OR: [{ lastReminderSentAt: null }, { lastReminderSentAt: { lte: resendCutoff } }],
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: REMINDER_ROW_SELECT,
  });

  // #7 — base para el link de baja del header List-Unsubscribe (una vez por corrida, cacheado).
  const siteUrl = await getSiteUrl();
  let sent = 0;
  let recovered = 0;
  for (const row of rows) {
    try {
      // Convertido: el saga soft-deletea el cart tras PAID → marcar recuperado y no molestar.
      if (row.cart.deletedAt) {
        await prisma.abandonedCart.update({ where: { id: row.id }, data: { recoveredAt: now } });
        recovered++;
        continue;
      }
      const items = toEmailItems(row);
      // Carrito vaciado → cuenta como "ya procesado" para no reconsiderarlo
      // cada corrida (reminderCount también sube: con max 1 queda fuera para
      // siempre, igual que el gate histórico de lastReminderSentAt NOT NULL).
      if (items.length === 0) {
        await markReminderSent(row.id, now);
        continue;
      }
      const attempt = await attemptReminder(row, items, siteUrl);
      // #18 — el breaker de Resend abierto (fallo TRANSITORIO): NO marcar y
      // cortar el batch (el resto también caería en circuit-open).
      if (attempt === "circuit-open") break;
      if (attempt === "sent" || attempt === "skipped") {
        await markReminderSent(row.id, now);
        if (attempt === "sent") sent++;
      }
      // Fallo REAL (no skipped) → no marcar → reintenta el próximo ciclo.
    } catch (err) {
      logger.error({
        event: "cart_recovery.fail",
        abandonedCartId: row.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info({ event: "cart_recovery.batch", considered: rows.length, sent, recovered });
  return { sent, recovered, considered: rows.length };
}

export type ManualReminderResult =
  | { status: "sent" }
  /** El carrito ya compró (si no estaba marcado, queda recoveredAt=now). */
  | { status: "recovered" }
  | {
      status: "skipped";
      reason:
        | "module-disabled" // kill-switch del módulo apagado
        | "too-soon" // anti-duplicación: no pasó intervalHours desde el último envío
        | "empty-cart" // el carrito ya no tiene items
        | "circuit-open"; // breaker de Resend abierto (transitorio)
      /** Con reason "too-soon": desde cuándo se puede reenviar. */
      retryAt?: Date;
    }
  | { status: "failed"; reason: "not-found" | "send-failed" };

/**
 * Envío MANUAL a voluntad (Fase 4, 2026-10-13) — /admin/carritos.
 *
 * A voluntad pero con candados razonables:
 *  - respeta el kill-switch del módulo (enabled=false → no sale nada);
 *  - NO respeta maxReminders (el admin decide — es el punto del modo manual),
 *    pero SÍ la anti-duplicación de intervalHours desde el último envío
 *    (contra doble-click / dos admins a la vez);
 *  - detecta conversión al vuelo (cart soft-deleted → recoveredAt);
 *  - cada envío rota el token (F-11), queda lastReminderSentAt + reminderCount
 *    y una idempotency-key por intento (ver attemptReminder).
 */
export async function sendReminderToCart(
  abandonedCartId: string,
  now: Date = new Date(),
): Promise<ManualReminderResult> {
  const settings = await getCartRecoverySettings();
  if (!settings.enabled) return { status: "skipped", reason: "module-disabled" };

  const row = await prisma.abandonedCart.findUnique({
    where: { id: abandonedCartId },
    select: REMINDER_ROW_SELECT,
  });
  if (!row) return { status: "failed", reason: "not-found" };
  if (row.recoveredAt) return { status: "recovered" };
  // Conversión detectada al vuelo (el cron aún no la había marcado).
  if (row.cart.deletedAt) {
    await prisma.abandonedCart.update({ where: { id: row.id }, data: { recoveredAt: now } });
    return { status: "recovered" };
  }
  const items = toEmailItems(row);
  if (items.length === 0) return { status: "skipped", reason: "empty-cart" };
  if (row.lastReminderSentAt) {
    const retryAt = new Date(row.lastReminderSentAt.getTime() + settings.intervalHours * HOUR_MS);
    if (retryAt.getTime() > now.getTime()) {
      return { status: "skipped", reason: "too-soon", retryAt };
    }
  }

  const siteUrl = await getSiteUrl();
  const attempt = await attemptReminder(row, items, siteUrl);
  if (attempt === "circuit-open") return { status: "skipped", reason: "circuit-open" };
  if (attempt === "failed") return { status: "failed", reason: "send-failed" };
  // "sent" o "skipped" (stub dev sin API key): igual que el cron, se marca.
  await markReminderSent(row.id, now);
  return { status: "sent" };
}
