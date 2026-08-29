/*
 * Service layer — Cotizaciones (Etapa 1: catálogo + WhatsApp).
 *
 * Flujo: el cliente arma su carrito normal, llena el formulario de cotización
 * de 1 paso y cierra por WhatsApp. Acá se congela el carrito como Quote +
 * QuoteItems (snapshot de nombres/precios, como Order/OrderItem) y se VACÍA
 * el carrito con el mismo mecanismo del checkout pago (soft-delete, hermano de
 * clearCartAfterPaid de features/orders), que además hace de reclamo único del
 * carrito contra submits duplicados — ver createQuoteFromCart.
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
import { buildQuoteConsentRow } from "@/features/consent/service";
import { hashBearerToken } from "@/lib/token-hash";

export class QuoteError extends Error {
  constructor(
    public code: "CART_NOT_FOUND" | "EMPTY_CART" | "CREATE_FAILED" | "DUPLICATE_SUBMIT",
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

/** Contexto para la prueba de la autorización (Ley 1581): de dónde vino el titular. */
export type QuoteConsentContext = {
  ip?: string | null;
  userAgent?: string | null;
};

export type CreateQuoteResult = {
  /** Id interno — la action lo pasa al aviso por email al admin (link al detalle). */
  id: string;
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
 * cotizar, y QuoteError("DUPLICATE_SUBMIT") si otro envío simultáneo ya se
 * quedó con este carrito — la action los traduce a mensaje para el cliente.
 */
export async function createQuoteFromCart(
  input: CreateQuoteInput,
  sessionId: string,
  consent: QuoteConsentContext,
): Promise<CreateQuoteResult> {
  const cart = await getCartDetail(sessionId);
  if (!cart) throw new QuoteError("CART_NOT_FOUND");
  if (cart.items.length === 0) throw new QuoteError("EMPTY_CART");

  // Autorización de tratamiento (Ley 1581 art. 9). Se resuelve ANTES de la transacción para no
  // meter una lectura de CMS dentro de ella, y se escribe DENTRO: la prueba y la PII son atómicas.
  const { version: consentVersion, row: consentRow } = await buildQuoteConsentRow({
    phone: input.customerWhatsapp,
    email: input.customerEmail ?? null,
    ip: consent.ip,
    userAgent: consent.userAgent,
  });
  const consentAt = new Date();

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
    // mismo patrón que Order: 32 chars hex (128 bits). F-11: se persiste SOLO
    // el hash sha256; el plano se devuelve en el resultado (link de confirmación).
    const publicAccessToken = crypto.randomBytes(16).toString("hex");
    try {
      // El id de la Quote creada se captura para devolverlo (aviso al admin).
      let createdId = "";
      await prisma.$transaction(async (tx) => {
        // ─── Reclamo del carrito (idempotencia del submit) ───
        // Vaciar el carrito ya era el último paso; acá es el PRIMERO y CONDICIONAL, y con eso
        // solo sale una cotización por carrito. Dos envíos que se pisan (dos pestañas, un POST
        // reintentado) leen el carrito lleno antes de que ninguno cierre su transacción, así que
        // la lectura de arriba no protege nada; este UPDATE sí: en READ COMMITTED el segundo
        // espera el lock de fila y re-evalúa `deletedAt: null` sobre la versión ya actualizada
        // ("The search condition of the command (the WHERE clause) is re-evaluated to see if the
        // updated version of the row still matches" — PostgreSQL 17, Transaction Isolation
        // § 13.2.1 Read Committed, doc oficial consultada 2026-07-24), afecta 0 filas y aborta.
        // Un doble envío SECUENCIAL ya moría antes, en getCartDetail (carrito soft-deleted).
        // No delegamos en clearCartAfterPaid porque devuelve void: necesitamos el conteo.
        const claimed = await tx.cart.updateMany({
          where: { id: cart.cartId, deletedAt: null },
          data: { deletedAt: new Date(), deletedBy: "quote:create" },
        });
        if (claimed.count === 0) {
          throw new QuoteError("DUPLICATE_SUBMIT", "El carrito ya fue cotizado por otro envío");
        }

        const created = await tx.quote.create({
          data: {
            number,
            publicAccessTokenHash: hashBearerToken(publicAccessToken),
            customerName: input.customerName,
            customerWhatsapp: input.customerWhatsapp,
            customerEmail: input.customerEmail ?? null,
            city: input.city,
            department: input.department,
            notes: input.notes ?? null,
            subtotal,
            total,
            dataConsentAt: consentAt,
            dataConsentVersion: consentVersion,
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
        // Ledger central de consentimientos, en la misma transacción: si algo falla, no queda
        // ni la cotización ni una autorización huérfana.
        await tx.consent.create({ data: { ...consentRow, acceptedAt: consentAt } });
        createdId = created.id;
      });
      logger.info({
        event: "quote.created",
        number,
        itemCount: cart.items.length,
        total,
        city: input.city,
      });
      return { id: createdId, number, token: publicAccessToken };
    } catch (err) {
      // Colisión de number o publicAccessTokenHash → reintentar con valores nuevos.
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
    where: { publicAccessTokenHash: hashBearerToken(token), deletedAt: null },
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

/*
 * Cota del mensaje de WhatsApp.
 *
 * El CTA de la confirmación navega a `https://wa.me/<n>?text=<mensaje>` y wa.me termina lanzando
 * la app por protocolo (`whatsapp://`). Fuente oficial del límite: Microsoft — "URL Length Limits"
 * (blog IEInternals, 2014-08-13, archivado en Microsoft Learn, act. 2024-11-06): en Chrome, una URL
 * de protocolo de aplicación de más de **2046 caracteres** muestra el prompt de seguridad pero al
 * pulsar "Abrir aplicación" NO pasa nada; la barra de direcciones se corta en 2047 y
 * `INTERNET_MAX_URL_LENGTH` son 2083. WhatsApp NO publica un máximo propio para `?text=`
 * [pendiente verificación] → nos regimos por el límite del navegador, con margen.
 *
 * Sin cota, un carrito grande rompía el ÚNICO embudo de la Etapa 1: el cliente pulsaba el botón y
 * WhatsApp no abría (o abría con el mensaje cortado, perdiendo el total, que va al final). Por eso
 * detallamos los primeros ítems y el resto se resume con el link a /cotizacion/<token>, que ya
 * tiene el detalle completo. El número de cotización y el total viven en la plantilla, fuera del
 * bloque acotado: nunca se pierden.
 *
 * Presupuesto: base de la plantilla fallback + nombre + link ≈ 450 chars codificados; 900 para los
 * ítems y ~250 para la línea de resumen dejan la URL en ~1600, holgada bajo los 2000.
 */
const WA_MAX_DETAILED_ITEMS = 8;
const WA_ITEMS_ENCODED_BUDGET = 900;
const WA_MAX_ITEM_NAME_CHARS = 60;

/**
 * Recorta respetando GRAFEMAS, nunca unidades UTF-16.
 *
 * `String.prototype.slice` corta por unidades UTF-16: si un emoji cae en el borde, deja media
 * pareja subrogada y `encodeURIComponent` lanza `URIError: URI malformed`. El caller es un server
 * component sin try/catch, así que la página de la cotización respondería 500 — y para entonces la
 * Quote ya está creada y el carrito ya se vació: el cliente no podría ni reintentar ni ver su
 * cotización. Estrictamente peor que la URL larga que la cota vino a evitar, y perfectamente
 * alcanzable: `Product.name` admite hasta 120 caracteres y la marca usa emoji por todas partes.
 *
 * `Intl.Segmenter` con granularity "grapheme" tampoco parte secuencias ZWJ (👩‍👧) ni pares
 * base+modificador. Si el runtime no lo trae, `Array.from` (code points) ya evita el crash.
 */
export function truncateForWhatsApp(text: string, maxChars: number): string {
  const units =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? Array.from(new Intl.Segmenter("es", { granularity: "grapheme" }).segment(text), (s) =>
          typeof s === "string" ? s : s.segment,
        )
      : Array.from(text);
  if (units.length <= maxChars) return text;
  return `${units.slice(0, maxChars - 1).join("")}…`;
}

/**
 * Neutraliza los caracteres de formato de WhatsApp dentro de texto que no controlamos.
 *
 * WhatsApp interpreta `*`, `_`, `~` y ``` como marcas de formato, así que un producto llamado
 * "Set 12_pack" italizaría media línea y uno con un asterisco suelto podría dejar el resto del
 * mensaje en negrita. Se sustituyen por caracteres visualmente equivalentes (no hay escape en el
 * formato de WhatsApp) para que el texto se lea igual sin activar el marcado.
 */
function neutralizeWhatsAppMarkup(text: string): string {
  return text.replace(/\*/g, "∗").replace(/_/g, "‗").replace(/~/g, "∼").replace(/`/g, "ʼ");
}

/** Una línea del detalle: "• 2× *Imán Corazón* (Set 6) — $ 300". */
function formatQuoteItemLine(i: QuoteForWhatsApp["items"][number]): string {
  // La variante "Default" es interna (productos sin opciones) — la UI del
  // storefront tampoco la muestra; no la mandamos por WhatsApp.
  const variant =
    i.variantName && i.variantName !== "Default"
      ? ` (${neutralizeWhatsAppMarkup(i.variantName)})`
      : "";
  // El nombre es el único trozo sin tope de largo; se recorta ANTES del precio para que un
  // nombre kilométrico no deje la línea sin su valor (y para que la cota de abajo sea firme).
  const name = neutralizeWhatsAppMarkup(truncateForWhatsApp(i.productName, WA_MAX_ITEM_NAME_CHARS));
  // El nombre en negrita: es lo que se busca al repasar la lista. La cantidad y el precio quedan
  // planos para que la línea no se vuelva un bloque ilegible.
  return `• ${i.quantity}× *${name}*${variant} — ${formatCOP(i.unitPrice * i.quantity)}`;
}

/**
 * Bloque de ítems acotado (ver el comentario de arriba). Corta por cantidad de ítems Y por
 * caracteres YA percent-encoded — un solo nombre patológico infla la URL tanto como diez normales.
 * Lo omitido se resume con el link público, que tiene el detalle completo.
 */
function buildQuoteItemsSummary(items: QuoteForWhatsApp["items"], quoteUrl: string): string {
  const lines: string[] = [];
  let encodedLen = 0;
  for (const item of items) {
    if (lines.length >= WA_MAX_DETAILED_ITEMS) break;
    const line = formatQuoteItemLine(item);
    const cost = encodeURIComponent(`${line}\n`).length;
    // El primer ítem entra siempre: un mensaje sin ni una línea de detalle no ayuda a nadie.
    if (lines.length > 0 && encodedLen + cost > WA_ITEMS_ENCODED_BUDGET) break;
    lines.push(line);
    encodedLen += cost;
  }

  const omitted = items.length - lines.length;
  if (omitted > 0) {
    lines.push(
      `…y ${omitted} producto${omitted === 1 ? "" : "s"} más — mira el detalle aquí: ${quoteUrl}`,
    );
  }
  return lines.join("\n");
}

/**
 * URL wa.me con el mensaje pre-armado de la cotización (número, items con
 * cantidades, total formateado COP, nombre del cliente). Usa el contexto
 * "quote" de lib/wa (plantilla configurable desde el CMS, key WA_MSG_QUOTE).
 */
export async function buildQuoteWhatsAppUrl(quote: QuoteForWhatsApp): Promise<string> {
  const quoteUrl = buildPublicShareUrl(`/cotizacion/${quote.token}`);
  const itemsSummary = buildQuoteItemsSummary(quote.items, quoteUrl);
  return buildWhatsAppUrl({
    kind: "quote",
    quoteNumber: quote.number,
    customerName: quote.customerName,
    itemsSummary,
    total: formatCOP(quote.total),
    quoteUrl,
  });
}
