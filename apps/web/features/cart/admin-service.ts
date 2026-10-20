/*
 * Service de lectura del módulo admin /admin/carritos (Fase 4, 2026-10-13):
 * listado con filtros/paginación, detalle para el preview del correo y las
 * métricas del módulo. Solo lectura — las mutaciones (envío manual) viven en
 * features/cart/recovery-service.ts (sendReminderToCart) y la config en
 * features/cart/recovery-settings.ts.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { designDisplayUnits } from "@/features/personalization/design-units";

export type AbandonedCartStatus = "pending" | "reminded" | "recovered";

export const ABANDONED_STATUS_LABEL: Record<AbandonedCartStatus, string> = {
  pending: "Pendiente",
  reminded: "Recordatorio enviado",
  recovered: "Recuperado",
};

export type AbandonedCartListItem = {
  id: string;
  email: string;
  createdAt: Date;
  /** Última actividad conocida del registro (registro o último recordatorio). */
  lastActivityAt: Date;
  lastReminderSentAt: Date | null;
  reminderCount: number;
  recoveredAt: Date | null;
  status: AbandonedCartStatus;
  itemCount: number;
  totalCents: number;
  /** Nombres de producto (hasta 3) para el resumen de la fila. */
  productNames: string[];
};

const PAGE_SIZE = 25;

type ListOpts = {
  q?: string;
  status?: AbandonedCartStatus | "all";
  page?: number;
};

/** WHERE compartido entre el listado y el conteo. */
function buildWhere(opts: ListOpts) {
  const status = opts.status ?? "all";
  return {
    ...(opts.q ? { email: { contains: opts.q, mode: "insensitive" as const } } : {}),
    ...(status === "pending"
      ? { recoveredAt: null, lastReminderSentAt: null, cart: { deletedAt: null } }
      : status === "reminded"
        ? { recoveredAt: null, lastReminderSentAt: { not: null }, cart: { deletedAt: null } }
        : status === "recovered"
          ? {
              // "Recuperado" cubre lo ya marcado y lo convertido al vuelo
              // (cart soft-deleted que el cron todavía no marcó).
              OR: [{ recoveredAt: { not: null } }, { cart: { deletedAt: { not: null } } }],
            }
          : {}),
  };
}

const LIST_SELECT = {
  id: true,
  email: true,
  createdAt: true,
  updatedAt: true,
  lastReminderSentAt: true,
  reminderCount: true,
  recoveredAt: true,
  cart: {
    select: {
      deletedAt: true,
      items: {
        select: {
          qty: true,
          unitPrice: true,
          variant: { select: { product: { select: { name: true } } } },
        },
      },
    },
  },
} as const;

type ListRow = {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  lastReminderSentAt: Date | null;
  reminderCount: number;
  recoveredAt: Date | null;
  cart: {
    deletedAt: Date | null;
    items: Array<{ qty: number; unitPrice: number; variant: { product: { name: string } } }>;
  };
};

function toListItem(row: ListRow): AbandonedCartListItem {
  const status: AbandonedCartStatus =
    row.recoveredAt || row.cart.deletedAt
      ? "recovered"
      : row.lastReminderSentAt
        ? "reminded"
        : "pending";
  return {
    id: row.id,
    email: row.email,
    createdAt: row.createdAt,
    lastActivityAt:
      row.lastReminderSentAt && row.lastReminderSentAt > row.createdAt
        ? row.lastReminderSentAt
        : row.createdAt,
    lastReminderSentAt: row.lastReminderSentAt,
    reminderCount: row.reminderCount,
    recoveredAt: row.recoveredAt,
    status,
    itemCount: row.cart.items.reduce((acc, i) => acc + i.qty, 0),
    totalCents: row.cart.items.reduce((acc, i) => acc + i.qty * i.unitPrice, 0),
    productNames: [...new Set(row.cart.items.map((i) => i.variant.product.name))].slice(0, 3),
  };
}

export async function listAbandonedCartsAdmin(opts: ListOpts): Promise<{
  items: AbandonedCartListItem[];
  total: number;
  totalPages: number;
}> {
  const where = buildWhere(opts);
  const page = Math.max(1, opts.page ?? 1);
  const [rows, total] = await Promise.all([
    prisma.abandonedCart.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: LIST_SELECT,
    }),
    prisma.abandonedCart.count({ where }),
  ]);
  return {
    items: rows.map(toListItem),
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export type AbandonedCartDetail = {
  id: string;
  email: string;
  createdAt: Date;
  lastReminderSentAt: Date | null;
  reminderCount: number;
  recoveredAt: Date | null;
  status: AbandonedCartStatus;
  totalCents: number;
  /** Items listos para el template del correo (con ×N multi-unidad). */
  items: Array<{ name: string; qty: number; units?: number }>;
};

/** Detalle de un registro para la pantalla de preview/envío (/admin/carritos/[id]). */
export async function getAbandonedCartDetail(id: string): Promise<AbandonedCartDetail | null> {
  const row = await prisma.abandonedCart.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      createdAt: true,
      lastReminderSentAt: true,
      reminderCount: true,
      recoveredAt: true,
      cart: {
        select: {
          deletedAt: true,
          items: {
            select: {
              qty: true,
              unitPrice: true,
              variant: { select: { product: { select: { name: true } } } },
              design: { select: { canvasData: true, metadata: true } },
            },
          },
        },
      },
    },
  });
  if (!row) return null;
  const status: AbandonedCartStatus =
    row.recoveredAt || row.cart.deletedAt
      ? "recovered"
      : row.lastReminderSentAt
        ? "reminded"
        : "pending";
  return {
    id: row.id,
    email: row.email,
    createdAt: row.createdAt,
    lastReminderSentAt: row.lastReminderSentAt,
    reminderCount: row.reminderCount,
    recoveredAt: row.recoveredAt,
    status,
    totalCents: row.cart.items.reduce((acc, i) => acc + i.qty * i.unitPrice, 0),
    items: row.cart.items.map((i) => {
      // Multi-unidad (misma regla que recovery-service): el ×N del correo
      // sale de las unidades reales del diseño.
      const perDesign = designDisplayUnits(i.design);
      return {
        name: i.variant.product.name,
        qty: i.qty,
        units: perDesign === null ? undefined : perDesign * i.qty,
      };
    }),
  };
}

export type CartRecoveryMetrics = {
  /** Registros sin recuperar y SIN recordatorio todavía (la cola de trabajo). */
  pendingCount: number;
  pendingValueCents: number;
  /** Registros con al menos un recordatorio, aún sin recuperar. */
  remindedCount: number;
  recoveredCount: number;
  /** % recuperados sobre registros con recordatorio enviado (los contactados). */
  recoveryRatePct: number | null;
  /**
   * APROXIMACIÓN: valor del carrito al momento de recuperarse (suma
   * unitPrice×qty). El pedido real pudo diferir (cupón, ediciones posteriores);
   * es la señal direccional del módulo, no un dato contable.
   */
  recoveredValueCents: number;
};

/** Tarjetas de métricas del módulo (/admin/carritos). */
export async function getCartRecoveryMetrics(): Promise<CartRecoveryMetrics> {
  const alive = { cart: { deletedAt: null } };
  const [pending, reminded, recovered, pendingValue, recoveredValue] = await Promise.all([
    prisma.abandonedCart.count({
      where: { recoveredAt: null, lastReminderSentAt: null, ...alive },
    }),
    prisma.abandonedCart.count({
      where: { recoveredAt: null, lastReminderSentAt: { not: null }, ...alive },
    }),
    // Recuperados: marcados o convertidos al vuelo (cart soft-deleted).
    prisma.abandonedCart.count({
      where: { OR: [{ recoveredAt: { not: null } }, { cart: { deletedAt: { not: null } } }] },
    }),
    prisma.abandonedCart.findMany({
      where: { recoveredAt: null, lastReminderSentAt: null, ...alive },
      select: { cart: { select: { items: { select: { qty: true, unitPrice: true } } } } },
    }),
    prisma.abandonedCart.findMany({
      where: { OR: [{ recoveredAt: { not: null } }, { cart: { deletedAt: { not: null } } }] },
      select: { cart: { select: { items: { select: { qty: true, unitPrice: true } } } } },
    }),
  ]);
  const contacted = reminded + recovered;
  return {
    pendingCount: pending,
    pendingValueCents: pendingValue.reduce(
      (acc, r) => acc + r.cart.items.reduce((a, i) => a + i.qty * i.unitPrice, 0),
      0,
    ),
    remindedCount: reminded,
    recoveredCount: recovered,
    recoveryRatePct: contacted > 0 ? Math.round((recovered / contacted) * 100) : null,
    recoveredValueCents: recoveredValue.reduce(
      (acc, r) => acc + r.cart.items.reduce((a, i) => a + i.qty * i.unitPrice, 0),
      0,
    ),
  };
}
