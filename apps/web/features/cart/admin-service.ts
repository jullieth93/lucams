/*
 * Service de lectura y diagnóstico del módulo admin `/admin/carritos`.
 *
 * Consolida el estado real de cada `AbandonedCart`:
 *   - `pending`: activo, con productos, sin recordatorio enviado aún.
 *   - `reminded`: activo, con productos y al menos un recordatorio enviado.
 *   - `recovered`: convertido en pedido pagado (`recoveredAt` o `closedReason === "ORDER_PAID"`).
 *   - `closed`: cerrado sin pago online directo (`CART_EMPTIED` al vaciarse).
 *
 * Incluye snapshot inmutable de productos/diseños, etapa de checkout alcanzada
 * (`DATOS` → `ENVIO` → `PAGO`), pedidos asociados (incluyendo intentos/rechazos Wompi)
 * y ficha `Contacto 360` + WhatsApp del cliente.
 */

import "server-only";
import { prisma, Prisma } from "@/lib/db";
import { formatDayMonthCO, formatIsoDateCO } from "@/lib/datetime";
import { designDisplayUnits } from "@/features/personalization/design-units";
import {
  parseAbandonedItemsSnapshot,
  type AbandonedCartSnapshotItem,
} from "@/features/cart/recovery-service";

export type AbandonedCartStatus = "pending" | "reminded" | "recovered" | "closed";

export const ABANDONED_STATUS_LABEL: Record<AbandonedCartStatus, string> = {
  pending: "Pendiente",
  reminded: "Recordatorio enviado",
  recovered: "Recuperado (pagado)",
  closed: "Cerrado (vaciado)",
};

export const CHECKOUT_STEP_LABEL: Record<string, string> = {
  DATOS: "Paso 1 · Datos y dirección",
  ENVIO: "Paso 2 · Selección de envío",
  PAGO: "Paso 3 · Intento de pago",
};

export const CLOSED_REASON_LABEL: Record<string, string> = {
  ORDER_PAID: "Convertido en pedido pagado",
  CART_EMPTIED: "Vaciado manualmente por el cliente",
};

export type AbandonedCartListItem = {
  id: string;
  email: string;
  contactId: string | null;
  contactName: string | null;
  createdAt: Date;
  /** Última actividad conocida del registro (registro, recordatorio o recuperación). */
  lastActivityAt: Date;
  lastReminderSentAt: Date | null;
  reminderCount: number;
  recoveredAt: Date | null;
  checkoutStep: string | null;
  closedReason: string | null;
  recoveredOrderNumber: string | null;
  status: AbandonedCartStatus;
  itemCount: number;
  totalCents: number;
  /** Nombres de producto (hasta 3) para el resumen de la fila. */
  productNames: string[];
  /** Indica si el correo registra rebote duro o queja de spam en `EmailEvent` (Resend). */
  bouncedOrComplained: boolean;
};

const PAGE_SIZE = 25;

type ListOpts = {
  q?: string;
  allowPiiSearch?: boolean;
  status?: AbandonedCartStatus | "all";
  page?: number;
};

const RECOVERED_WHERE: Prisma.AbandonedCartWhereInput = {
  OR: [
    { recoveredAt: { not: null } },
    { closedReason: "ORDER_PAID" },
    {
      recoveredAt: null,
      closedReason: null,
      cart: { deletedAt: { not: null } },
    },
  ],
};

const CLOSED_NON_PAID_WHERE: Prisma.AbandonedCartWhereInput = {
  recoveredAt: null,
  closedReason: "CART_EMPTIED",
};

const OPEN_CART_WHERE: Prisma.AbandonedCartWhereInput = {
  recoveredAt: null,
  closedReason: null,
  cart: { deletedAt: null },
};

/** WHERE compartido entre el listado y el conteo. */
function buildWhere(opts: ListOpts): Prisma.AbandonedCartWhereInput {
  const status = opts.status ?? "all";
  const allowPiiSearch = opts.allowPiiSearch ?? true;
  const trimmedQ = opts.q?.trim();
  const searchFilter: Prisma.AbandonedCartWhereInput = trimmedQ
    ? {
        OR: allowPiiSearch
          ? [
              { email: { contains: trimmedQ, mode: "insensitive" } },
              { contact: { displayName: { contains: trimmedQ, mode: "insensitive" } } },
              { recoveredOrder: { number: { contains: trimmedQ, mode: "insensitive" } } },
            ]
          : [
              { recoveredOrder: { number: { contains: trimmedQ, mode: "insensitive" } } },
              {
                cart: {
                  items: {
                    some: {
                      variant: { product: { name: { contains: trimmedQ, mode: "insensitive" } } },
                    },
                  },
                },
              },
            ],
      }
    : {};

  const statusFilter: Prisma.AbandonedCartWhereInput =
    status === "pending"
      ? { ...OPEN_CART_WHERE, lastReminderSentAt: null }
      : status === "reminded"
        ? { ...OPEN_CART_WHERE, lastReminderSentAt: { not: null } }
        : status === "recovered"
          ? RECOVERED_WHERE
          : status === "closed"
            ? CLOSED_NON_PAID_WHERE
            : {};

  return {
    AND: [searchFilter, statusFilter],
  };
}

function classifyStatus(row: {
  recoveredAt: Date | null;
  closedReason: string | null;
  lastReminderSentAt: Date | null;
  cart: { deletedAt: Date | null; deletedBy: string | null };
}): AbandonedCartStatus {
  if (
    row.recoveredAt ||
    row.closedReason === "ORDER_PAID" ||
    (row.cart.deletedAt && row.closedReason === null)
  ) {
    return "recovered";
  }
  if (row.closedReason === "CART_EMPTIED") {
    return "closed";
  }
  return row.lastReminderSentAt ? "reminded" : "pending";
}

const LIST_SELECT = {
  id: true,
  email: true,
  contactId: true,
  createdAt: true,
  updatedAt: true,
  lastReminderSentAt: true,
  reminderCount: true,
  recoveredAt: true,
  checkoutStep: true,
  closedReason: true,
  itemsSnapshot: true,
  subtotalCents: true,
  contact: {
    select: {
      id: true,
      displayName: true,
    },
  },
  recoveredOrder: {
    select: {
      id: true,
      number: true,
      total: true,
    },
  },
  cart: {
    select: {
      deletedAt: true,
      deletedBy: true,
      items: {
        select: {
          qty: true,
          unitPrice: true,
          variant: { select: { product: { select: { name: true } } } },
        },
      },
    },
  },
} satisfies Prisma.AbandonedCartSelect;

type ListRow = Prisma.AbandonedCartGetPayload<{ select: typeof LIST_SELECT }>;

async function resolveBouncedEmails(emails: string[]): Promise<Set<string>> {
  const normalized = [
    ...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => e.length > 0)),
  ];
  if (normalized.length === 0) return new Set();
  const rows = await prisma.$queryRaw<Array<{ email_lower: string }>>`
    SELECT DISTINCT LOWER("to") AS email_lower
    FROM "EmailEvent"
    WHERE "type" IN ('email.bounced', 'email.complained')
      AND LOWER("to") IN (${Prisma.join(normalized)})
  `;
  return new Set(rows.map((r) => r.email_lower));
}

function toListItem(row: ListRow, bouncedSet: Set<string>): AbandonedCartListItem {
  const status = classifyStatus(row);
  const snap = parseAbandonedItemsSnapshot(row.itemsSnapshot);
  const hasLiveItems = row.cart.items.length > 0;

  const itemCount = hasLiveItems
    ? row.cart.items.reduce((acc, i) => acc + i.qty, 0)
    : snap.reduce((acc, s) => acc + s.qty, 0);

  const totalCents = hasLiveItems
    ? row.cart.items.reduce((acc, i) => acc + i.qty * i.unitPrice, 0)
    : (row.subtotalCents ??
      (snap.length > 0
        ? snap.reduce((acc, s) => acc + s.qty * s.unitPrice, 0)
        : (row.recoveredOrder?.total ?? 0)));

  const productNames = hasLiveItems
    ? [...new Set(row.cart.items.map((i) => i.variant.product.name))].slice(0, 3)
    : [...new Set(snap.map((s) => s.productName))].slice(0, 3);

  const dates = [row.createdAt, row.lastReminderSentAt, row.recoveredAt].filter(
    (d): d is Date => d instanceof Date,
  );
  const lastActivityAt = dates.reduce((max, d) => (d > max ? d : max), row.createdAt);

  return {
    id: row.id,
    email: row.email,
    contactId: row.contact?.id ?? row.contactId ?? null,
    contactName: row.contact?.displayName ?? null,
    createdAt: row.createdAt,
    lastActivityAt,
    lastReminderSentAt: row.lastReminderSentAt,
    reminderCount: row.reminderCount,
    recoveredAt: row.recoveredAt,
    checkoutStep: row.checkoutStep,
    closedReason: row.closedReason,
    recoveredOrderNumber: row.recoveredOrder?.number ?? null,
    status,
    itemCount,
    totalCents,
    productNames,
    bouncedOrComplained: bouncedSet.has(row.email.trim().toLowerCase()),
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
  const bouncedSet = await resolveBouncedEmails(rows.map((r) => r.email));
  return {
    items: rows.map((r) => toListItem(r, bouncedSet)),
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export type AbandonedCartDiagnosticOrder = {
  id: string;
  number: string;
  status: string;
  paymentMethod: string;
  total: number;
  createdAt: Date;
  wompiDeclines: Array<{
    externalId: string;
    status: string;
    paymentMethodType: string | null;
    statusMessage: string | null;
    createdAt: Date;
  }>;
};

export type AbandonedCartDetail = {
  id: string;
  cartId: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  lastReminderSentAt: Date | null;
  reminderCount: number;
  recoveredAt: Date | null;
  checkoutStep: string | null;
  closedReason: string | null;
  status: AbandonedCartStatus;
  totalCents: number;
  itemsSource: "live" | "snapshot" | "order" | "empty";
  /** Líneas ricas para inspección visual en `/admin/carritos/[id]`. */
  lineItems: AbandonedCartSnapshotItem[];
  /** Items listos para el template del correo (con ×N multi-unidad). */
  items: Array<{ name: string; qty: number; units?: number }>;
  contact: {
    id: string;
    displayName: string | null;
    whatsappPhone: string | null;
  } | null;
  bouncedOrComplained: boolean;
  linkedOrders: AbandonedCartDiagnosticOrder[];
};

/** Detalle completo de un registro para diagnóstico y envío (`/admin/carritos/[id]`). */
export async function getAbandonedCartDetail(id: string): Promise<AbandonedCartDetail | null> {
  const row = await prisma.abandonedCart.findUnique({
    where: { id },
    select: {
      id: true,
      cartId: true,
      email: true,
      contactId: true,
      createdAt: true,
      updatedAt: true,
      lastReminderSentAt: true,
      reminderCount: true,
      recoveredAt: true,
      recoveredOrderId: true,
      checkoutStep: true,
      closedReason: true,
      itemsSnapshot: true,
      subtotalCents: true,
      contact: {
        select: {
          id: true,
          displayName: true,
          deletedAt: true,
          customer: { select: { phone: true } },
          identities: {
            where: {
              type: { in: ["WHATSAPP", "PHONE"] },
              verificationStatus: { not: "REVOKED" },
            },
            orderBy: { createdAt: "desc" },
            take: 2,
            select: { type: true, normalizedValue: true },
          },
        },
      },
      cart: {
        select: {
          deletedAt: true,
          deletedBy: true,
          items: {
            select: {
              qty: true,
              unitPrice: true,
              variant: {
                select: {
                  name: true,
                  images: true,
                  product: { select: { name: true, slug: true, images: true } },
                },
              },
              design: {
                select: { id: true, previewUrl: true, canvasData: true, metadata: true },
              },
            },
          },
        },
      },
    },
  });
  if (!row) return null;

  const status = classifyStatus(row);
  const effectiveClosedReason = row.closedReason;

  // Pedidos asociados al mismo cartId o al recoveredOrderId
  const orderWhereOr: Prisma.OrderWhereInput[] = [{ cartId: row.cartId }];
  if (row.recoveredOrderId) {
    orderWhereOr.push({ id: row.recoveredOrderId });
  }
  const ordersRaw = await prisma.order.findMany({
    where: { deletedAt: null, OR: orderWhereOr },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      number: true,
      status: true,
      paymentMethod: true,
      subtotal: true,
      total: true,
      createdAt: true,
      shippingAddress: true,
      items: {
        select: {
          qty: true,
          unitPrice: true,
          designId: true,
          design: { select: { previewUrl: true } },
          variant: {
            select: {
              name: true,
              images: true,
              product: { select: { name: true, slug: true, images: true } },
            },
          },
        },
      },
      wompiAttempts: {
        orderBy: { createdAt: "desc" },
        take: 4,
        select: {
          transactions: {
            where: { status: { in: ["DECLINED", "ERROR", "VOIDED"] } },
            orderBy: { firstSeenAt: "desc" },
            take: 4,
            select: {
              externalId: true,
              status: true,
              paymentMethodType: true,
              statusMessage: true,
              providerCreatedAt: true,
              firstSeenAt: true,
            },
          },
        },
      },
    },
  });

  // Resolver líneas de producto con fallback: live CartItem -> itemsSnapshot -> OrderItem
  let itemsSource: AbandonedCartDetail["itemsSource"] = "empty";
  let lineItems: AbandonedCartSnapshotItem[] = [];

  if (row.cart.items.length > 0) {
    itemsSource = "live";
    lineItems = row.cart.items.map((i) => {
      const perDesign = designDisplayUnits(i.design);
      return {
        productName: i.variant.product.name,
        productSlug: i.variant.product.slug,
        variantName: i.variant.name,
        imageUrl: i.variant.images[0] ?? i.variant.product.images[0] ?? null,
        qty: i.qty,
        unitPrice: i.unitPrice,
        units: perDesign === null ? undefined : perDesign * i.qty,
        designId: i.design?.id ?? null,
        designPreviewUrl: i.design?.previewUrl ?? null,
      };
    });
  } else {
    const snap = parseAbandonedItemsSnapshot(row.itemsSnapshot);
    if (snap.length > 0) {
      itemsSource = "snapshot";
      lineItems = snap;
    } else if (ordersRaw[0]?.items.length) {
      itemsSource = "order";
      lineItems = ordersRaw[0].items.map((oi) => ({
        productName: oi.variant.product.name,
        productSlug: oi.variant.product.slug,
        variantName: oi.variant.name,
        imageUrl: oi.variant.images[0] ?? oi.variant.product.images[0] ?? null,
        qty: oi.qty,
        unitPrice: oi.unitPrice,
        designId: oi.designId ?? null,
        designPreviewUrl: oi.design?.previewUrl ?? null,
      }));
    }
  }

  const totalCents =
    row.cart.items.length > 0
      ? row.cart.items.reduce((acc, i) => acc + i.qty * i.unitPrice, 0)
      : (row.subtotalCents ??
        (lineItems.length > 0
          ? lineItems.reduce((acc, li) => acc + li.qty * li.unitPrice, 0)
          : (ordersRaw[0]?.subtotal ?? 0)));

  // Resolver WhatsApp del cliente (ContactIdentity -> Customer.phone -> Order.shippingAddress.phone)
  let orderPhone: string | null = null;
  const firstShip = ordersRaw[0]?.shippingAddress;
  if (firstShip && typeof firstShip === "object" && !Array.isArray(firstShip)) {
    const p = (firstShip as Record<string, unknown>).phone;
    if (typeof p === "string" && p.trim()) orderPhone = p.trim();
  }

  const activeContact = row.contact && row.contact.deletedAt === null ? row.contact : null;
  const waIdentity =
    activeContact?.identities.find((i) => i.type === "WHATSAPP")?.normalizedValue ??
    activeContact?.identities.find((i) => i.type === "PHONE")?.normalizedValue ??
    activeContact?.customer?.phone ??
    orderPhone;

  const linkedOrders: AbandonedCartDiagnosticOrder[] = ordersRaw.map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    paymentMethod: o.paymentMethod,
    total: o.total,
    createdAt: o.createdAt,
    wompiDeclines: o.wompiAttempts.flatMap((att) =>
      att.transactions.map((tx) => ({
        externalId: tx.externalId,
        status: tx.status ?? "DECLINED",
        paymentMethodType: tx.paymentMethodType,
        statusMessage: tx.statusMessage,
        createdAt: tx.providerCreatedAt ?? tx.firstSeenAt,
      })),
    ),
  }));

  const effectiveStep =
    row.checkoutStep ?? (ordersRaw.length > 0 ? "PAGO" : row.email ? "DATOS" : null);
  const bouncedSet = await resolveBouncedEmails([row.email]);

  return {
    id: row.id,
    cartId: row.cartId,
    email: row.email,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastReminderSentAt: row.lastReminderSentAt,
    reminderCount: row.reminderCount,
    recoveredAt: row.recoveredAt,
    checkoutStep: effectiveStep,
    closedReason: effectiveClosedReason,
    status,
    totalCents,
    itemsSource,
    lineItems,
    items: lineItems.map((li) => ({
      name: li.productName,
      qty: li.qty,
      units: li.units,
    })),
    contact: activeContact
      ? {
          id: activeContact.id,
          displayName: activeContact.displayName,
          whatsappPhone: waIdentity ?? null,
        }
      : null,
    bouncedOrComplained: bouncedSet.has(row.email.trim().toLowerCase()),
    linkedOrders,
  };
}

export type CartRecoveryMetrics = {
  /** Registros sin recuperar y SIN recordatorio todavía (la cola de trabajo). */
  pendingCount: number;
  pendingValueCents: number;
  /** Registros con al menos un recordatorio, aún sin recuperar. */
  remindedCount: number;
  recoveredCount: number;
  /** Registros cerrados por vaciado manual (excluidos de envíos). */
  closedCount: number;
  totalCount: number;
  /** % recuperados sobre registros con recordatorio enviado (los contactados). */
  recoveryRatePct: number | null;
  /** Valor real o snapshot de los carritos recuperados. */
  recoveredValueCents: number;
};

/** Tarjetas de métricas del módulo (`/admin/carritos`). */
export async function getCartRecoveryMetrics(): Promise<CartRecoveryMetrics> {
  const [pending, reminded, recovered, closed, totalCount, pendingSumRows, recoveredSumRows] =
    await Promise.all([
      prisma.abandonedCart.count({
        where: { ...OPEN_CART_WHERE, lastReminderSentAt: null },
      }),
      prisma.abandonedCart.count({
        where: { ...OPEN_CART_WHERE, lastReminderSentAt: { not: null } },
      }),
      prisma.abandonedCart.count({
        where: RECOVERED_WHERE,
      }),
      prisma.abandonedCart.count({
        where: CLOSED_NON_PAID_WHERE,
      }),
      prisma.abandonedCart.count(),
      prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COALESCE(SUM(
          COALESCE(
            ac."subtotalCents",
            (SELECT SUM(ci."qty" * ci."unitPrice") FROM "CartItem" ci WHERE ci."cartId" = c."id"),
            0
          )
        ), 0)::bigint AS total
        FROM "AbandonedCart" ac
        INNER JOIN "Cart" c ON c."id" = ac."cartId"
        WHERE ac."recoveredAt" IS NULL
          AND ac."closedReason" IS NULL
          AND ac."lastReminderSentAt" IS NULL
          AND c."deletedAt" IS NULL
      `,
      prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COALESCE(SUM(
          COALESCE(
            ord."total",
            ac."subtotalCents",
            (SELECT SUM(ci."qty" * ci."unitPrice") FROM "CartItem" ci WHERE ci."cartId" = c."id"),
            0
          )
        ), 0)::bigint AS total
        FROM "AbandonedCart" ac
        INNER JOIN "Cart" c ON c."id" = ac."cartId"
        LEFT JOIN "Order" ord ON ord."id" = ac."recoveredOrderId" AND ord."deletedAt" IS NULL
        WHERE ac."recoveredAt" IS NOT NULL
           OR ac."closedReason" = 'ORDER_PAID'
           OR (
             ac."recoveredAt" IS NULL
             AND ac."closedReason" IS NULL
             AND c."deletedAt" IS NOT NULL
           )
      `,
    ]);

  const contacted = reminded + recovered;
  return {
    pendingCount: pending,
    pendingValueCents: Number(pendingSumRows[0]?.total ?? BigInt(0)),
    remindedCount: reminded,
    recoveredCount: recovered,
    closedCount: closed,
    totalCount,
    recoveryRatePct: contacted > 0 ? Math.round((recovered / contacted) * 100) : null,
    recoveredValueCents: Number(recoveredSumRows[0]?.total ?? BigInt(0)),
  };
}

export type CartRecoveryDailyBucket = {
  key: string;
  label: string;
  tickLabel: string;
  detectedCount: number;
  recoveredCount: number;
  recoveredValueCents: number;
};

/**
 * Pulso diario de 14 días (hora Colombia `-05:00`) para `/admin/carritos`:
 * carritos abandonados detectados vs recuperados pagados por día calendario COT.
 */
export async function getCartRecoveryDailyPulse(days = 14): Promise<CartRecoveryDailyBucket[]> {
  const safeDays = Math.max(1, Math.min(90, Math.floor(days)));
  const todayIso = formatIsoDateCO(new Date());
  const noonToday = new Date(`${todayIso}T12:00:00.000-05:00`);
  const buckets: CartRecoveryDailyBucket[] = [];
  const byKey = new Map<string, CartRecoveryDailyBucket>();

  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(noonToday.getTime() - i * 86_400_000);
    const key = formatIsoDateCO(d);
    const bucket: CartRecoveryDailyBucket = {
      key,
      label: formatDayMonthCO(d),
      tickLabel: `${key.slice(8)}/${key.slice(5, 7)}`,
      detectedCount: 0,
      recoveredCount: 0,
      recoveredValueCents: 0,
    };
    buckets.push(bucket);
    byKey.set(key, bucket);
  }

  const firstKey = buckets[0]?.key ?? todayIso;
  const since = new Date(`${firstKey}T00:00:00.000-05:00`);

  const [detectedRows, recoveredRows] = await Promise.all([
    prisma.abandonedCart.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.abandonedCart.findMany({
      where: {
        OR: [
          { recoveredAt: { gte: since } },
          { recoveredAt: null, closedReason: "ORDER_PAID", updatedAt: { gte: since } },
        ],
      },
      select: {
        recoveredAt: true,
        updatedAt: true,
        subtotalCents: true,
        recoveredOrder: { select: { total: true } },
      },
    }),
  ]);

  for (const row of detectedRows) {
    const b = byKey.get(formatIsoDateCO(row.createdAt));
    if (b) b.detectedCount += 1;
  }

  for (const row of recoveredRows) {
    const ts = row.recoveredAt ?? row.updatedAt;
    const b = byKey.get(formatIsoDateCO(ts));
    if (b) {
      b.recoveredCount += 1;
      b.recoveredValueCents += row.recoveredOrder?.total ?? row.subtotalCents ?? 0;
    }
  }

  return buckets;
}
