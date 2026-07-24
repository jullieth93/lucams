/*
 * Service layer — Cotizaciones (Etapa 1: catálogo + WhatsApp).
 *
 * Flujo: el cliente arma su carrito normal, llena el formulario de cotización
 * de 1 paso y cierra por WhatsApp. Acá se congela el carrito como Quote +
 * QuoteItems (snapshot de nombres/precios, como Order/OrderItem) y se VACÍA
 * el carrito con el mismo mecanismo del checkout pago (soft-delete vía
 * clearCartAfterPaid de features/orders).
 *
 * En Etapa 1 NO hay envío calculado, cupones ni impuestos: total == subtotal.
 * Cuando la tienda pase a modo full (Etapa 2) este módulo convive con pedidos;
 * las cotizaciones quedan como histórico en el admin.
 *
 * Patrón doc'd en CONVENTIONS.md § capa de servicio: lógica de dominio, sin
 * imports de next/*. La Server Action (actions.ts) envuelve con Turnstile,
 * rate-limit y la sesión de carrito (cookie).
 */

import "server-only";
import crypto from "node:crypto";
import { prisma, Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { formatCOP } from "@/lib/format";
import { buildWhatsAppUrl } from "@/lib/wa";
import { buildPublicShareUrl } from "@/lib/public-url";
import { getCartDetail } from "@/features/cart/service";
import { clearCartAfterPaid } from "@/features/orders/service";

export class QuoteError extends Error {
  constructor(
    public code: "CART_NOT_FOUND" | "EMPTY_CART" | "CREATE_FAILED",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "QuoteError";
  }
}

// Alfabeto sin ambiguos (sin 0/O/1/I/L) — mismo criterio que los recovery
// codes de admin-mfa: el número se dicta/lee por WhatsApp a mano.
const NUMBER_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const NUMBER_LEN = 6;

/**
 * Genera Quote.number, formato "COT-XXXXXX" (6 chars alfanuméricos sin
 * ambiguos). 31^6 ≈ 887M combinaciones; Quote.number es @unique y el create
 * reintenta ante P2002, así que una colisión solo cuesta un reintento.
 */
export function generateQuoteNumber(): string {
  let raw = "";
  for (let i = 0; i < NUMBER_LEN; i++)
    raw += NUMBER_ALPHABET[crypto.randomInt(NUMBER_ALPHABET.length)];
  return `COT-${raw}`;
}

export type CreateQuoteInput = {
  customerName: string;
  customerWhatsapp: string;
  customerEmail?: string;
  city: string;
  department: string;
  notes?: string;
};

export type CreateQuoteResult = {
  number: string;
  token: string;
};

/**
 * Snapshot atómico Cart → Quote. Lee el carrito de la sesión anónima
 * (features/cart/service.getCartDetail — misma fuente de items y precios que
 * la UI del carrito), persiste Quote + QuoteItems y VACÍA el carrito en la
 * misma transacción (soft-delete, igual que el checkout pago).
 *
 * Lanza QuoteError("CART_NOT_FOUND" | "EMPTY_CART") si no hay nada que
 * cotizar — la action lo traduce a mensaje para el cliente.
 */
export async function createQuoteFromCart(
  input: CreateQuoteInput,
  sessionId: string,
): Promise<CreateQuoteResult> {
  const cart = await getCartDetail(sessionId);
  if (!cart) throw new QuoteError("CART_NOT_FOUND");
  if (cart.items.length === 0) throw new QuoteError("EMPTY_CART");

  // Etapa 1: sin envío ni descuentos — el total es el subtotal del carrito.
  const subtotal = cart.subtotal;
  const total = subtotal;

  // Retry sobre colisión del @unique (number/token): improbable (887M números,
  // 128 bits de token) pero barato de cubrir — mismo criterio que el retry de
  // Order.number en createOrderFromCart.
  const MAX_RETRIES = 10;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const number = generateQuoteNumber();
    // Token público para la vista /cotizacion/<token> (guest sin login) —
    // mismo patrón que Order.publicAccessToken: 32 chars hex (128 bits).
    const publicAccessToken = crypto.randomBytes(16).toString("hex");
    try {
      await prisma.$transaction(async (tx) => {
        await tx.quote.create({
          data: {
            number,
            publicAccessToken,
            customerName: input.customerName,
            customerWhatsapp: input.customerWhatsapp,
            customerEmail: input.customerEmail ?? null,
            city: input.city,
            department: input.department,
            notes: input.notes ?? null,
            subtotal,
            total,
            items: {
              create: cart.items.map((i) => ({
                productId: i.productId,
                variantId: i.variantId,
                designId: i.designId,
                productName: i.productName,
                variantName: i.variantName,
                unitPrice: i.unitPrice,
                quantity: i.qty,
                previewUrl: i.designPreviewUrl,
              })),
            },
          },
        });
        // Vaciar el carrito al confirmar — mismo mecanismo que el checkout
        // pago (soft-delete; el próximo lookup crea un cart vacío nuevo).
        await clearCartAfterPaid(cart.cartId, tx, "quote:create");
      });
      logger.info({
        event: "quote.created",
        number,
        itemCount: cart.items.length,
        total,
        city: input.city,
      });
      return { number, token: publicAccessToken };
    } catch (err) {
      // Colisión de number o publicAccessToken → reintentar con valores nuevos.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        logger.warn({ event: "quote.create.unique_collision", attempt });
        continue;
      }
      throw err;
    }
  }
  throw new QuoteError("CREATE_FAILED", "No se pudo generar un número de cotización único");
}

/**
 * Vista pública de la cotización por su token (guest sin login).
 *
 * Select explícito: NO expone internalNotes (notas del admin), ni
 * customerWhatsapp/customerEmail (PII — la página de confirmación no los
 * necesita), ni audit fields.
 */
export async function getQuoteByToken(token: string) {
  return prisma.quote.findFirst({
    where: { publicAccessToken: token, deletedAt: null },
    select: {
      id: true,
      number: true,
      status: true,
      customerName: true,
      city: true,
      department: true,
      subtotal: true,
      total: true,
      createdAt: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          productName: true,
          variantName: true,
          unitPrice: true,
          quantity: true,
          previewUrl: true,
        },
      },
    },
  });
}

export type QuoteForWhatsApp = {
  number: string;
  token: string;
  customerName: string;
  total: number; // centavos COP
  items: Array<{
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: number; // centavos COP
  }>;
};

/**
 * URL wa.me con el mensaje pre-armado de la cotización (número, items con
 * cantidades, total formateado COP, nombre del cliente). Usa el contexto
 * "quote" de lib/wa (plantilla configurable desde el CMS, key WA_MSG_QUOTE).
 */
export async function buildQuoteWhatsAppUrl(quote: QuoteForWhatsApp): Promise<string> {
  const itemsSummary = quote.items
    .map((i) => {
      // La variante "Default" es interna (productos sin opciones) — la UI del
      // storefront tampoco la muestra; no la mandamos por WhatsApp.
      const variant = i.variantName && i.variantName !== "Default" ? ` (${i.variantName})` : "";
      return `• ${i.quantity}× ${i.productName}${variant} — ${formatCOP(i.unitPrice * i.quantity)}`;
    })
    .join("\n");
  return buildWhatsAppUrl({
    kind: "quote",
    quoteNumber: quote.number,
    customerName: quote.customerName,
    itemsSummary,
    total: formatCOP(quote.total),
    quoteUrl: buildPublicShareUrl(`/cotizacion/${quote.token}`),
  });
}
