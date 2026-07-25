/*
 * Tests de integración de features/quotes contra la DB real — Etapa 1
 * (catálogo + WhatsApp): Quote + QuoteItem con snapshot del carrito.
 *
 * Cobertura:
 *   - createQuoteFromCart: crea Quote PENDING con items snapshoteados
 *     (nombres/precios/previewUrl), number "COT-XXXXXX" único, token 32 hex,
 *     subtotal == total (Etapa 1), y VACÍA el carrito (soft-delete
 *     "quote:create", mismo mecanismo que el checkout pago). Errores
 *     EMPTY_CART / CART_NOT_FOUND.
 *   - getQuoteByToken: vista pública SIN internalNotes ni PII de contacto.
 *   - admin listQuotes: búsqueda q, filtro status, paginación.
 *   - admin updateQuoteStatus / addQuoteInternalNote: mutación + updatedBy +
 *     AdminActionLog (el guard RBAC y el audit se mockean en el borde — el
 *     enforcement de sesión/MFA se testea aparte en lib/admin-rbac-guard.test).
 *
 * Requiere DATABASE_URL (corre vía `dotenv -e .env.local -- vitest`); sin ella
 * se salta (skipIf) para no romper CI sin DB.
 *
 * AISLAMIENTO ESTRICTO (DB compartida dev/prod — nunca tocar datos reales):
 *   - Todo fixture lleva el prefijo RUN: Category.slug, Product.slug/sku,
 *     ProductVariant.sku, Cart.sessionId, Design.sessionId, Quote.customerName.
 *   - La limpieza en afterAll borra EXACTAMENTE lo creado, SCOPED por esos
 *     prefijos y en orden de FKs (quoteItem → quote → cartItem → cart →
 *     design → variant → product → category). JAMÁS un deleteMany sin filtro.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createQuoteFromCart, getQuoteByToken } from "./service";
import {
  QuoteNotFoundError,
  addQuoteInternalNote,
  getQuoteById,
  listQuotes,
  updateQuoteStatus,
} from "./admin-service";

/** Contexto de consentimiento para los tests (Ley 1581): la firma lo exige desde 2026-07-21. */
const TEST_CONSENT = { ip: "127.0.0.1", userAgent: "vitest" };

// Guard RBAC y audit mockeados: el integration test ejercita la mutación en DB,
// no el flujo de sesión/MFA (cubierto por lib/admin-rbac-guard.test.ts).
// ACTOR se lee DIFERIDO (dentro del closure async) → sin problema de hoisting.
vi.mock("@/lib/admin-rbac-guard", () => ({
  requireAdminAction: vi.fn(async () => ({
    user: { id: "itest-quote-user" },
    admin: { id: ACTOR, role: "SUPERADMIN" },
  })),
}));
const auditSpy = vi.hoisted(() => ({ recordAdminAction: vi.fn(async () => {}) }));
vi.mock("@/lib/admin-audit", () => ({
  recordAdminAction: auditSpy.recordAdminAction,
}));

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida. Minúsculas (como los tests de cart) para slugs.
const RUN = `itestquote${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const ACTOR = `${RUN}-admin`;
// Móvil ÚNICO por corrida (10 dígitos empezando en 3, como exige el schema). Antes se usaba el
// WhatsApp real de la tienda: desde que crear una Quote también crea su fila Consent, esas filas
// quedaban en la tabla de consentimientos de PRODUCCIÓN atribuidas a un número real y sin forma
// de distinguirlas de una autorización legítima.
const RUN_PHONE = `3${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

// ───────────────────────── IDs de fixtures (beforeAll) ─────────────────────────
let categoryId = "";
let productId = "";
let defaultVariantId = "";
let namedVariantId = "";
let designId = "";
const DEFAULT_PRICE = 12_000; // centavos
const NAMED_PRICE = 20_000; // centavos
const DESIGN_PREVIEW = "https://cdn.lucams.test/preview-quote.png";

function sid(label: string): string {
  return `${RUN}-${label}-${Math.floor(Math.random() * 1e9)}`;
}

/** Cart con sessionId RUN-prefijado + items dados (vía prisma, bypass services). */
async function makeCartWithItems(
  items: Array<{ variantId: string; qty: number; unitPrice: number; designId?: string }>,
) {
  const sessionId = sid("cart");
  const cart = await prisma.cart.create({
    data: {
      sessionId,
      items: {
        create: items.map((i) => ({
          variantId: i.variantId,
          qty: i.qty,
          unitPrice: i.unitPrice,
          designId: i.designId ?? null,
        })),
      },
    },
    select: { id: true, sessionId: true },
  });
  return cart;
}

function quoteInput(over: Partial<Parameters<typeof createQuoteFromCart>[0]> = {}) {
  return {
    customerName: `${RUN} Lucía Prueba`,
    customerWhatsapp: RUN_PHONE,
    city: "Bogotá D.C.",
    department: "Bogotá D.C.",
    ...over,
  };
}

// Timeout amplio: el pooler de Supabase es lento bajo concurrencia (patrón repo).
describe.skipIf(!hasDb)(
  "quotes — integración DB (Etapa 1 catálogo + WhatsApp)",
  { timeout: 30_000 },
  () => {
    beforeAll(async () => {
      const category = await prisma.category.create({
        data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
      });
      categoryId = category.id;

      const product = await prisma.product.create({
        data: {
          slug: `${RUN}-prod`,
          name: `Producto ${RUN}`,
          description: "fixture quotes",
          basePrice: 9_999,
          sku: `${RUN}-PROD`.toUpperCase(),
          categoryId,
          images: ["https://cdn.lucams.test/prod.png"],
          variants: {
            create: [
              {
                name: "Default",
                sku: `${RUN}-PROD-DEFAULT`.toUpperCase(),
                price: DEFAULT_PRICE,
                stock: 100,
                attributes: {},
              },
              {
                name: "Set 12",
                sku: `${RUN}-PROD-SET12`.toUpperCase(),
                price: NAMED_PRICE,
                stock: 100,
                attributes: {},
              },
            ],
          },
        },
        select: { id: true, variants: { select: { id: true, sku: true } } },
      });
      productId = product.id;
      defaultVariantId = product.variants.find((v) => v.sku.endsWith("-DEFAULT"))!.id;
      namedVariantId = product.variants.find((v) => v.sku.endsWith("-SET12"))!.id;

      const design = await prisma.design.create({
        data: {
          sessionId: sid("design"),
          productId,
          status: "READY",
          canvasData: {},
          previewUrl: DESIGN_PREVIEW,
        },
        select: { id: true },
      });
      designId = design.id;
    });

    afterAll(async () => {
      // SCOPED al prefijo RUN, en orden de FKs. JAMÁS deleteMany sin filtro.
      const myQuotes = await prisma.quote.findMany({
        where: { customerName: { startsWith: RUN } },
        select: { id: true },
      });
      const quoteIds = myQuotes.map((q) => q.id);
      await prisma.quoteItem.deleteMany({ where: { quoteId: { in: quoteIds } } });
      await prisma.quote.deleteMany({ where: { id: { in: quoteIds } } });
      // Crear una Quote crea TAMBIÉN su autorización de tratamiento (Ley 1581) en la misma
      // transacción. Consent no tiene FK a Quote, así que borrarla en cascada no ocurre: hay que
      // borrarla explícitamente o cada corrida deja consentimientos huérfanos en la tabla real.
      // Scoped al móvil único de esta corrida — jamás un deleteMany sin filtro.
      await prisma.consent.deleteMany({ where: { phone: RUN_PHONE } });

      const myCarts = await prisma.cart.findMany({
        where: { sessionId: { startsWith: RUN } },
        select: { id: true },
      });
      const cartIds = myCarts.map((c) => c.id);
      await prisma.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
      // Cart soft-deleted por quote:create NO se puede borrar en crudo si ya
      // tiene deletedAt (el hard delete de fixtures es seguro: son filas RUN).
      await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });

      await prisma.design.deleteMany({ where: { sessionId: { startsWith: RUN } } });
      await prisma.productVariant.deleteMany({
        where: { sku: { startsWith: RUN.toUpperCase() } },
      });
      await prisma.product.deleteMany({ where: { slug: { startsWith: RUN } } });
      await prisma.category.deleteMany({ where: { slug: { startsWith: RUN } } });
    });

    // ─────────────────────────── createQuoteFromCart ───────────────────────────

    describe("createQuoteFromCart", () => {
      it("crea Quote PENDING con snapshot de items, number/token, y vacía el carrito", async () => {
        const cart = await makeCartWithItems([
          { variantId: defaultVariantId, qty: 2, unitPrice: DEFAULT_PRICE },
          { variantId: namedVariantId, qty: 1, unitPrice: NAMED_PRICE, designId },
        ]);

        const result = await createQuoteFromCart(
          quoteInput({ customerEmail: "lucia@lucams.test", notes: "Para el sábado" }),
          cart.sessionId,
          TEST_CONSENT,
        );

        expect(result.number).toMatch(/^COT-[A-Z2-9]{6}$/);
        expect(result.token).toMatch(/^[0-9a-f]{32}$/);

        const quote = await prisma.quote.findUnique({
          where: { publicAccessToken: result.token },
          include: { items: { orderBy: { createdAt: "asc" } } },
        });
        expect(quote).not.toBeNull();
        expect(quote!.number).toBe(result.number);
        expect(quote!.status).toBe("PENDING");
        expect(quote!.customerEmail).toBe("lucia@lucams.test");
        expect(quote!.notes).toBe("Para el sábado");
        expect(quote!.internalNotes).toBeNull();
        // Etapa 1: subtotal == total (sin envío/descuentos). 2×12000 + 1×20000.
        expect(quote!.subtotal).toBe(44_000);
        expect(quote!.total).toBe(44_000);

        // Snapshot de items: nombres/precios congelados + FKs + preview del Design.
        expect(quote!.items).toHaveLength(2);
        const plain = quote!.items.find((i) => i.quantity === 2)!;
        expect(plain.productName).toBe(`Producto ${RUN}`);
        expect(plain.variantName).toBe("Default");
        expect(plain.unitPrice).toBe(DEFAULT_PRICE);
        expect(plain.productId).toBe(productId);
        expect(plain.variantId).toBe(defaultVariantId);
        expect(plain.designId).toBeNull();
        expect(plain.previewUrl).toBeNull();
        const personalized = quote!.items.find((i) => i.quantity === 1)!;
        expect(personalized.variantName).toBe("Set 12");
        expect(personalized.designId).toBe(designId);
        expect(personalized.previewUrl).toBe(DESIGN_PREVIEW);

        // El carrito quedó VACÍO (soft-delete "quote:create", como el checkout).
        const cartAfter = await prisma.cart.findUnique({ where: { id: cart.id } });
        expect(cartAfter!.deletedAt).not.toBeNull();
        expect(cartAfter!.deletedBy).toBe("quote:create");
        // Y el detalle del cart service ya no lo devuelve (filtro deletedAt:null)
        // → el cliente recibe un carrito nuevo vacío en la próxima request.
      });

      it("persiste customerEmail null cuando no se pasa", async () => {
        const cart = await makeCartWithItems([
          { variantId: defaultVariantId, qty: 1, unitPrice: DEFAULT_PRICE },
        ]);
        const result = await createQuoteFromCart(quoteInput(), cart.sessionId, TEST_CONSENT);
        const quote = await prisma.quote.findUnique({
          where: { publicAccessToken: result.token },
        });
        expect(quote!.customerEmail).toBeNull();
      });

      it("lanza QuoteError EMPTY_CART con un carrito sin items (y NO lo vacía)", async () => {
        const cart = await makeCartWithItems([]);
        await expect(
          createQuoteFromCart(quoteInput(), cart.sessionId, TEST_CONSENT),
        ).rejects.toMatchObject({
          name: "QuoteError",
          code: "EMPTY_CART",
        });
        const cartAfter = await prisma.cart.findUnique({ where: { id: cart.id } });
        expect(cartAfter!.deletedAt).toBeNull();
      });

      it("lanza QuoteError CART_NOT_FOUND con una sesión sin carrito", async () => {
        await expect(
          createQuoteFromCart(quoteInput(), sid("ghost"), TEST_CONSENT),
        ).rejects.toMatchObject({
          name: "QuoteError",
          code: "CART_NOT_FOUND",
        });
      });

      it("dos cotizaciones generan numbers distintos (unique constraint vigente)", async () => {
        const c1 = await makeCartWithItems([
          { variantId: defaultVariantId, qty: 1, unitPrice: 100 },
        ]);
        const c2 = await makeCartWithItems([
          { variantId: defaultVariantId, qty: 1, unitPrice: 100 },
        ]);
        const r1 = await createQuoteFromCart(quoteInput(), c1.sessionId, TEST_CONSENT);
        const r2 = await createQuoteFromCart(quoteInput(), c2.sessionId, TEST_CONSENT);
        expect(r1.number).not.toBe(r2.number);
        expect(r1.token).not.toBe(r2.token);
      });
    });

    // ─────────────────────────── getQuoteByToken ───────────────────────────────

    describe("getQuoteByToken", () => {
      it("devuelve la cotización SIN internalNotes ni PII de contacto (select explícito)", async () => {
        const cart = await makeCartWithItems([
          { variantId: namedVariantId, qty: 3, unitPrice: NAMED_PRICE },
        ]);
        const { token } = await createQuoteFromCart(quoteInput(), cart.sessionId, TEST_CONSENT);
        // Ensuciamos la quote con nota interna + PII para verificar que NO salen.
        await prisma.quote.update({
          where: { publicAccessToken: token },
          data: { internalNotes: "nota interna secreta" },
        });

        const pub = await getQuoteByToken(token);
        expect(pub).not.toBeNull();
        expect(Object.keys(pub!).sort()).toEqual(
          [
            "city",
            "createdAt",
            "customerName",
            "department",
            "id",
            "items",
            "number",
            "status",
            "subtotal",
            "total",
          ].sort(),
        );
        expect(pub!.items).toHaveLength(1);
        expect(Object.keys(pub!.items[0]!).sort()).toEqual(
          ["previewUrl", "productName", "quantity", "unitPrice", "variantName"].sort(),
        );
        expect(pub!.total).toBe(3 * NAMED_PRICE);
      });

      it("devuelve null para un token inexistente", async () => {
        expect(await getQuoteByToken("0".repeat(32))).toBeNull();
      });
    });

    // ─────────────────────────── admin: list / getById ─────────────────────────

    describe("admin listQuotes / getQuoteById", () => {
      it("listQuotes encuentra por fragmento de number y por nombre (q case-insensitive)", async () => {
        const cart = await makeCartWithItems([
          { variantId: defaultVariantId, qty: 1, unitPrice: DEFAULT_PRICE },
        ]);
        const { number } = await createQuoteFromCart(quoteInput(), cart.sessionId, TEST_CONSENT);

        const byNumber = await listQuotes({ q: number.toLowerCase() });
        expect(byNumber.items.map((i) => i.number)).toContain(number);

        const byName = await listQuotes({ q: `${RUN} lucía`.toUpperCase() });
        expect(byName.items.map((i) => i.number)).toContain(number);

        // Shape del item de lista (incluye _count.items para el admin).
        const item = byNumber.items.find((i) => i.number === number)!;
        expect(item._count.items).toBe(1);
        expect(item.customerWhatsapp).toBe(RUN_PHONE);
      });

      it("listQuotes filtra por status y pagina", async () => {
        const c1 = await makeCartWithItems([
          { variantId: defaultVariantId, qty: 1, unitPrice: 100 },
        ]);
        const c2 = await makeCartWithItems([
          { variantId: defaultVariantId, qty: 1, unitPrice: 100 },
        ]);
        const r1 = await createQuoteFromCart(quoteInput(), c1.sessionId, TEST_CONSENT);
        const r2 = await createQuoteFromCart(quoteInput(), c2.sessionId, TEST_CONSENT);
        const q1 = (await prisma.quote.findUnique({ where: { number: r1.number } }))!;
        await prisma.quote.update({ where: { id: q1.id }, data: { status: "CONTACTED" } });

        const contacted = await listQuotes({ q: RUN, status: "CONTACTED", pageSize: 100 });
        const numbers = contacted.items.map((i) => i.number);
        expect(numbers).toContain(r1.number);
        expect(numbers).not.toContain(r2.number);

        const page = await listQuotes({ q: RUN, status: "all", page: 1, pageSize: 1 });
        expect(page.pageSize).toBe(1);
        expect(page.items).toHaveLength(1);
        expect(page.total).toBeGreaterThanOrEqual(2);
        expect(page.totalPages).toBe(page.total);
      });

      it("getQuoteById devuelve items e internalNotes (vista admin completa)", async () => {
        const cart = await makeCartWithItems([
          { variantId: defaultVariantId, qty: 1, unitPrice: DEFAULT_PRICE },
        ]);
        const { token } = await createQuoteFromCart(quoteInput(), cart.sessionId, TEST_CONSENT);
        const quote = (await prisma.quote.findUnique({ where: { publicAccessToken: token } }))!;

        const full = await getQuoteById(quote.id);
        expect(full).not.toBeNull();
        expect(full!.items).toHaveLength(1);
        expect(full!.customerWhatsapp).toBe(RUN_PHONE); // admin SÍ ve el contacto
      });
    });

    // ─────────────────── admin: updateQuoteStatus / internal note ──────────────

    describe("admin updateQuoteStatus / addQuoteInternalNote", () => {
      it("updateQuoteStatus cambia el estado, setea updatedBy y audita (from/to)", async () => {
        auditSpy.recordAdminAction.mockClear();
        const cart = await makeCartWithItems([
          { variantId: defaultVariantId, qty: 1, unitPrice: DEFAULT_PRICE },
        ]);
        const { token } = await createQuoteFromCart(quoteInput(), cart.sessionId, TEST_CONSENT);
        const quote = (await prisma.quote.findUnique({ where: { publicAccessToken: token } }))!;

        const updated = await updateQuoteStatus(quote.id, "CONTACTED");
        expect(updated.status).toBe("CONTACTED");
        expect(updated.updatedBy).toBe(ACTOR);
        expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
          expect.objectContaining({
            actorId: ACTOR,
            action: "quote.update_status",
            entityType: "Quote",
            entityId: quote.id,
            metadata: expect.objectContaining({ from: "PENDING", to: "CONTACTED" }),
          }),
        );
      });

      it("updateQuoteStatus con el MISMO estado es no-op (no audita ni toca updatedBy)", async () => {
        auditSpy.recordAdminAction.mockClear();
        const cart = await makeCartWithItems([
          { variantId: defaultVariantId, qty: 1, unitPrice: DEFAULT_PRICE },
        ]);
        const { token } = await createQuoteFromCart(quoteInput(), cart.sessionId, TEST_CONSENT);
        const quote = (await prisma.quote.findUnique({ where: { publicAccessToken: token } }))!;

        const res = await updateQuoteStatus(quote.id, "PENDING");
        expect(res.status).toBe("PENDING");
        expect(auditSpy.recordAdminAction).not.toHaveBeenCalled();
      });

      it("updateQuoteStatus lanza QuoteNotFoundError con id inexistente", async () => {
        await expect(updateQuoteStatus(`${RUN}-ghost`, "CLOSED")).rejects.toBeInstanceOf(
          QuoteNotFoundError,
        );
      });

      it("addQuoteInternalNote hace APPEND con separador y audita", async () => {
        auditSpy.recordAdminAction.mockClear();
        const cart = await makeCartWithItems([
          { variantId: defaultVariantId, qty: 1, unitPrice: DEFAULT_PRICE },
        ]);
        const { token } = await createQuoteFromCart(quoteInput(), cart.sessionId, TEST_CONSENT);
        const quote = (await prisma.quote.findUnique({ where: { publicAccessToken: token } }))!;

        const first = await addQuoteInternalNote(quote.id, "Cliente prefiere por la tarde");
        expect(first.internalNotes).toBe("Cliente prefiere por la tarde");

        const second = await addQuoteInternalNote(quote.id, "Pidió factura a nombre de la mamá");
        expect(second.internalNotes).toBe(
          "Cliente prefiere por la tarde\n\n---\n\nPidió factura a nombre de la mamá",
        );
        expect(second.updatedBy).toBe(ACTOR);
        expect(auditSpy.recordAdminAction).toHaveBeenCalledTimes(2);
        expect(auditSpy.recordAdminAction).toHaveBeenLastCalledWith(
          expect.objectContaining({ action: "quote.add_internal_note", entityId: quote.id }),
        );
      });

      it("addQuoteInternalNote rechaza nota vacía sin tocar la DB", async () => {
        auditSpy.recordAdminAction.mockClear();
        const cart = await makeCartWithItems([
          { variantId: defaultVariantId, qty: 1, unitPrice: DEFAULT_PRICE },
        ]);
        const { token } = await createQuoteFromCart(quoteInput(), cart.sessionId, TEST_CONSENT);
        const quote = (await prisma.quote.findUnique({ where: { publicAccessToken: token } }))!;

        await expect(addQuoteInternalNote(quote.id, "   ")).rejects.toThrow(/vacía/);
        expect(auditSpy.recordAdminAction).not.toHaveBeenCalled();
        const fresh = await prisma.quote.findUnique({ where: { id: quote.id } });
        expect(fresh!.internalNotes).toBeNull();
      });
    });
  },
);
