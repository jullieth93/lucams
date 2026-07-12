/*
 * Tests de integración del SERVICE de CARRITO contra la DB real.
 *
 * El módulo @/features/cart/service.ts es lógica de dominio PURA-de-next
 * (sin next/*, sin cookies, sin fetch): toda su superficie pega a Prisma.
 * Por eso es 100% test de integración DB — NO hay nada que mockear.
 *
 * Cobertura:
 *   - addProductToCart: variante "-DEFAULT", snapshot de unitPrice, suma por
 *     variantId, clamp a MAX_QTY_PER_ITEM, validación de qty, producto inexistente/
 *     inactivo, producto sin variante default.
 *   - addPersonalizedToCart: requiere Design READY, agrupa por designId (no por
 *     variantId), validación de variantId (anti-tamper), fallback a 1ra variant.
 *   - updateCartItemQty / removeCartItem: cambio de qty, qty=0 borra, validación,
 *     item/cart inexistente.
 *   - getCartDetail / getCartItemCount: cálculo de subtotal/itemCount, filtrado de
 *     productos archivados (isActive=false / deletedAt), preview de Design.
 *   - mergeAnonCartIntoCustomer: las 4 ramas (sin anon, anon vacío, customer sin
 *     cart, merge con dedup por (variantId, designId)) + hard-delete del anon.
 *
 * Requiere DATABASE_URL (corre vía `dotenv -e .env.local -- vitest`). Si no
 * está, se salta (skipIf) para no romper CI sin DB.
 *
 * Aislamiento: TODO fixture lleva el prefijo RUN único por corrida:
 *   - Cart.sessionId empieza con RUN (el service NO valida shape UUID, así que
 *     usamos sessionIds legibles y filtrables por prefijo).
 *   - Product.slug / sku, Category.slug, ProductVariant.sku, Customer.email,
 *     Design.sessionId todos llevan RUN.
 * Limpieza en afterAll SCOPED al prefijo — JAMÁS toca datos reales (cuenta de
 * Lucy, productos seed, etc.).
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  CartError,
  addProductToCart,
  addPersonalizedToCart,
  getCartDetail,
  getCartItemCount,
  updateCartItemQty,
  removeCartItem,
  mergeAnonCartIntoCustomer,
} from "./service";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida. Toda fila creada lo lleva → limpieza scoped.
const RUN = `cart${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

// ───────────────────────── IDs de fixtures (se llenan en beforeAll) ─────────────────────────
let categoryId = "";

// Producto "simple": tiene variante default (-DEFAULT) con price propio.
let simpleProductId = "";
let simpleSlug = "";
let simpleDefaultVariantId = "";
const SIMPLE_PRICE = 12_000;

// Producto "sin price en variante": variante default con price=null → usa basePrice.
let noPriceProductId = "";
let noPriceSlug = "";
const NOPRICE_BASE = 8_500;

// Producto SIN variante default (tiene variantes pero ninguna -DEFAULT).
let noDefaultSlug = "";

// Producto inactivo (isActive=false).
let inactiveSlug = "";

// Producto personalizable: 2 variantes (NO default), para addPersonalizedToCart.
let persoProductId = "";
let persoVariantAId = "";
let persoVariantBId = "";
const PERSO_VAR_A_PRICE = 20_000;
const PERSO_VAR_B_PRICE = 35_000;

// Designs (status READY / DRAFT) sobre el producto personalizable.
let readyDesignId = "";
let readyDesign2Id = "";
let draftDesignId = "";

// ADR-057 — Nombre por ficha: producto TEXT_ONLY con variante de precio POR FICHA +
// designs "name" con distinto nº de letras en metadata.
let namePerTileProductId = "";
let nameVariantId = "";
let nameDesign5Id = ""; // metadata.letters = 5 letras
let nameDesign3Id = ""; // metadata.letters = 3 letras
let nameDesignNoLettersId = ""; // surface name pero sin letters → fallback
const NAME_PER_TILE = 5_000; // precio por ficha (centavos)

// Variante "extra" sobre el producto simple, para merge tests con designId distintos.
let extraVariantId = "";

// ───────────────────────── helpers ─────────────────────────

/** sessionId legible y filtrable por prefijo RUN. */
function sid(label: string): string {
  return `${RUN}-${label}-${Math.floor(Math.random() * 1e9)}`;
}

/** Sufijo único por invocación → tolera el retry de vitest (retry:2) sin colisiones unique. */
function uniq(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/**
 * Crea un Customer con email/referralCode/supabaseUserId únicos POR invocación
 * (no por label) — así un retry de vitest crea filas nuevas en vez de chocar
 * contra el unique de la corrida anterior. Todos llevan RUN → cleanup scoped.
 */
async function makeCustomer() {
  const u = uniq();
  return prisma.customer.create({
    data: {
      email: `${RUN}-${u}@lucams.test`,
      supabaseUserId: `${RUN}-${u}-sub`,
      referralCode: `${RUN}-${u}-ref`,
    },
    select: { id: true },
  });
}

// Timeout generoso por test — el pooler de Supabase (pgbouncer :6543) es lento
// bajo concurrencia; el default de 5s no alcanza. Espeja el patrón de los otros
// .integration.test.ts del repo (30000 por it).
const T = 30_000;

/** Crea un Cart con sessionId RUN-prefijado, sin items. Devuelve {id, sessionId}. */
async function makeEmptyCart(opts?: { customerId?: string | null }) {
  const sessionId = sid("ec");
  const cart = await prisma.cart.create({
    data: { sessionId, customerId: opts?.customerId ?? undefined },
    select: { id: true, sessionId: true },
  });
  return cart;
}

// `{ timeout: T }` aplica a TODOS los tests y hooks anidados (SuiteOptions extends
// TestOptions). Evita los 5s default que el pooler de Supabase no alcanza bajo carga.
describe.skipIf(!hasDb)("cart/service — integración DB", { timeout: T }, () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
    });
    categoryId = category.id;

    // Producto simple con variante -DEFAULT (price propio).
    const simple = await prisma.product.create({
      data: {
        slug: `${RUN}-simple`,
        name: `Simple ${RUN}`,
        description: "fixture cart simple",
        basePrice: 9_999,
        sku: `${RUN}-SIMPLE`.toUpperCase(),
        categoryId,
        variants: {
          create: [
            {
              name: "Default",
              sku: `${RUN}-SIMPLE-DEFAULT`.toUpperCase(),
              price: SIMPLE_PRICE,
              stock: 100,
              attributes: {},
            },
            {
              name: "Extra",
              sku: `${RUN}-SIMPLE-EXTRA`.toUpperCase(),
              price: 5_000,
              stock: 100,
              attributes: {},
            },
          ],
        },
      },
      select: { id: true, slug: true, variants: { select: { id: true, sku: true } } },
    });
    simpleProductId = simple.id;
    simpleSlug = simple.slug;
    simpleDefaultVariantId = simple.variants.find((v) => v.sku.endsWith("-DEFAULT"))!.id;
    extraVariantId = simple.variants.find((v) => v.sku.endsWith("-EXTRA"))!.id;

    // Producto cuya variante default tiene price=null → unitPrice debe caer a basePrice.
    const noPrice = await prisma.product.create({
      data: {
        slug: `${RUN}-noprice`,
        name: `NoPrice ${RUN}`,
        description: "fixture variante sin price",
        basePrice: NOPRICE_BASE,
        sku: `${RUN}-NOPRICE`.toUpperCase(),
        categoryId,
        variants: {
          create: [
            {
              name: "Default",
              sku: `${RUN}-NOPRICE-DEFAULT`.toUpperCase(),
              price: null,
              stock: 100,
              attributes: {},
            },
          ],
        },
      },
      select: { id: true, slug: true },
    });
    noPriceProductId = noPrice.id;
    noPriceSlug = noPrice.slug;

    // Producto con variantes pero NINGUNA -DEFAULT.
    const noDefault = await prisma.product.create({
      data: {
        slug: `${RUN}-nodefault`,
        name: `NoDefault ${RUN}`,
        description: "fixture sin variante default",
        basePrice: 7_000,
        sku: `${RUN}-NODEFAULT`.toUpperCase(),
        categoryId,
        variants: {
          create: [
            { name: "Solo", sku: `${RUN}-NODEFAULT-SOLO`.toUpperCase(), price: 7_000, stock: 5, attributes: {} },
          ],
        },
      },
      select: { slug: true },
    });
    noDefaultSlug = noDefault.slug;

    // Producto inactivo (con default variant, pero isActive=false).
    const inactive = await prisma.product.create({
      data: {
        slug: `${RUN}-inactive`,
        name: `Inactive ${RUN}`,
        description: "fixture inactivo",
        basePrice: 3_000,
        sku: `${RUN}-INACTIVE`.toUpperCase(),
        categoryId,
        isActive: false,
        variants: {
          create: [
            { name: "Default", sku: `${RUN}-INACTIVE-DEFAULT`.toUpperCase(), price: 3_000, stock: 10, attributes: {} },
          ],
        },
      },
      select: { slug: true },
    });
    inactiveSlug = inactive.slug;

    // Producto personalizable: 2 variantes activas, NINGUNA default.
    const perso = await prisma.product.create({
      data: {
        slug: `${RUN}-perso`,
        name: `Perso ${RUN}`,
        description: "fixture personalizable",
        basePrice: 15_000,
        sku: `${RUN}-PERSO`.toUpperCase(),
        categoryId,
        isPersonalizable: true,
        personalizationKind: "PHOTO_PACK",
        images: ["https://cdn.lucams.test/perso-generic.png"],
        variants: {
          create: [
            { name: "Set 6", sku: `${RUN}-PERSO-A`.toUpperCase(), price: PERSO_VAR_A_PRICE, stock: 50, attributes: {} },
            { name: "Set 12", sku: `${RUN}-PERSO-B`.toUpperCase(), price: PERSO_VAR_B_PRICE, stock: 50, attributes: {} },
          ],
        },
      },
      select: { id: true, variants: { select: { id: true, sku: true }, orderBy: { createdAt: "asc" } } },
    });
    persoProductId = perso.id;
    persoVariantAId = perso.variants.find((v) => v.sku.endsWith("-PERSO-A"))!.id;
    persoVariantBId = perso.variants.find((v) => v.sku.endsWith("-PERSO-B"))!.id;

    // Designs sobre el producto personalizable.
    const ready = await prisma.design.create({
      data: {
        sessionId: sid("design"),
        productId: persoProductId,
        status: "READY",
        canvasData: {},
        previewUrl: "https://cdn.lucams.test/preview-ready-1.png",
      },
      select: { id: true },
    });
    readyDesignId = ready.id;

    const ready2 = await prisma.design.create({
      data: {
        sessionId: sid("design"),
        productId: persoProductId,
        status: "READY",
        canvasData: {},
        previewUrl: "https://cdn.lucams.test/preview-ready-2.png",
      },
      select: { id: true },
    });
    readyDesign2Id = ready2.id;

    const draft = await prisma.design.create({
      data: {
        sessionId: sid("design"),
        productId: persoProductId,
        status: "DRAFT",
        canvasData: {},
        previewUrl: "https://cdn.lucams.test/preview-draft.png",
      },
      select: { id: true },
    });
    draftDesignId = draft.id;

    // ─── ADR-057 — Nombre por ficha ───
    const namePerTile = await prisma.product.create({
      data: {
        slug: `${RUN}-name`,
        name: `Name ${RUN}`,
        description: "fixture nombre por ficha",
        basePrice: 999,
        sku: `${RUN}-NAME`.toUpperCase(),
        categoryId,
        isPersonalizable: true,
        personalizationKind: "TEXT_ONLY",
        images: ["https://cdn.lucams.test/name-generic.png"],
        variants: {
          create: [
            {
              name: "Clásica con imán",
              sku: `${RUN}-NAME-CLAS`.toUpperCase(),
              price: NAME_PER_TILE, // precio POR FICHA
              stock: 50,
              attributes: { variant: "name", pricePerTile: true, letterCountMin: 3, letterCountMax: 10 },
            },
          ],
        },
      },
      select: { id: true, variants: { select: { id: true } } },
    });
    namePerTileProductId = namePerTile.id;
    nameVariantId = namePerTile.variants[0].id;

    const nameDesign5 = await prisma.design.create({
      data: {
        sessionId: sid("name-design"),
        productId: namePerTileProductId,
        status: "READY",
        canvasData: {},
        previewUrl: "https://cdn.lucams.test/name-mateo.png",
        metadata: { surface: "name", letters: ["M", "A", "T", "E", "O"], language: "es" },
      },
      select: { id: true },
    });
    nameDesign5Id = nameDesign5.id;

    const nameDesign3 = await prisma.design.create({
      data: {
        sessionId: sid("name-design"),
        productId: namePerTileProductId,
        status: "READY",
        canvasData: {},
        previewUrl: "https://cdn.lucams.test/name-ana.png",
        metadata: { surface: "name", letters: ["A", "N", "A"], language: "es" },
      },
      select: { id: true },
    });
    nameDesign3Id = nameDesign3.id;

    // Diseño "name" con metadata SIN letters → el carrito debe caer al precio unitario
    // por ficha (nunca 0 ni NaN). Defensa ante metadata corrupta.
    const nameDesignNoLetters = await prisma.design.create({
      data: {
        sessionId: sid("name-design"),
        productId: namePerTileProductId,
        status: "READY",
        canvasData: {},
        previewUrl: "https://cdn.lucams.test/name-empty.png",
        metadata: { surface: "name", language: "es" },
      },
      select: { id: true },
    });
    nameDesignNoLettersId = nameDesignNoLetters.id;
  }, T); // timeout explícito del hook (el pooler es lento; el default de 10s no alcanza)

  // ───────────────────────── limpieza ─────────────────────────
  // Borra todo lo creado en tests (carts RUN-prefijados) tras cada test, para que
  // los tests no se contaminen entre sí. Los fixtures (productos/variantes/designs)
  // persisten hasta afterAll.
  async function cleanupCarts() {
    const carts = await prisma.cart.findMany({
      where: { sessionId: { startsWith: RUN } },
      select: { id: true },
    });
    const ids = carts.map((c) => c.id);
    if (ids.length) {
      await prisma.cartItem.deleteMany({ where: { cartId: { in: ids } } });
      await prisma.cart.deleteMany({ where: { id: { in: ids } } });
    }
  }

  afterEach(async () => {
    await cleanupCarts();
    // Customers creados por tests — borrarlos evita que un retry de vitest choque
    // contra el unique de email/referralCode de la corrida fallida.
    await prisma.customer.deleteMany({ where: { email: { contains: RUN } } });
  });

  afterAll(async () => {
    await cleanupCarts();
    // Designs antes que variantes/productos (Design.product es Restrict).
    await prisma.design.deleteMany({ where: { productId: { in: [persoProductId, simpleProductId].filter(Boolean) } } });
    await prisma.design.deleteMany({ where: { sessionId: { startsWith: RUN } } });
    // Robustez: cualquier design que aún referencie un producto de esta categoría
    // (ej. designs de Nombre por ficha) — evita FK violation en el delete de productos.
    await prisma.design.deleteMany({ where: { product: { categoryId } } });
    // Customers de esta corrida (merge tests).
    await prisma.customer.deleteMany({ where: { email: { contains: RUN } } });
    // Variantes → productos → categoría (orden FK: CartItem.variant Restrict).
    await prisma.productVariant.deleteMany({ where: { product: { categoryId } } });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  }, T);

  // ════════════════════════════════════════════════════════════════════════
  // addProductToCart
  // ════════════════════════════════════════════════════════════════════════

  describe("addProductToCart", () => {
    it("crea cart + item con la variante -DEFAULT y snapshotea variant.price como unitPrice", async () => {
      const sessionId = sid("add");
      const detail = await addProductToCart({
        sessionId,
        customerId: null,
        productSlug: simpleSlug,
        qty: 2,
      });

      expect(detail.sessionId).toBe(sessionId);
      expect(detail.customerId).toBeNull();
      expect(detail.items).toHaveLength(1);
      const item = detail.items[0];
      expect(item.variantId).toBe(simpleDefaultVariantId);
      expect(item.qty).toBe(2);
      expect(item.unitPrice).toBe(SIMPLE_PRICE); // snapshot de variant.price
      expect(item.lineTotal).toBe(2 * SIMPLE_PRICE);
      expect(detail.itemCount).toBe(2);
      expect(detail.subtotal).toBe(2 * SIMPLE_PRICE);
    });

    it("usa product.basePrice cuando la variante default tiene price=null", async () => {
      const sessionId = sid("add");
      const detail = await addProductToCart({
        sessionId,
        customerId: null,
        productSlug: noPriceSlug,
        qty: 1,
      });
      expect(detail.items[0].unitPrice).toBe(NOPRICE_BASE);
    });

    it("agregar la misma variante 2 veces SUMA qty en el item existente (no duplica)", async () => {
      const sessionId = sid("add");
      await addProductToCart({ sessionId, customerId: null, productSlug: simpleSlug, qty: 2 });
      const detail = await addProductToCart({ sessionId, customerId: null, productSlug: simpleSlug, qty: 3 });
      expect(detail.items).toHaveLength(1);
      expect(detail.items[0].qty).toBe(5);
      expect(detail.itemCount).toBe(5);
    });

    it("clamp: sumar qty que excede MAX_QTY_PER_ITEM (99) se topa en 99", async () => {
      const sessionId = sid("add");
      await addProductToCart({ sessionId, customerId: null, productSlug: simpleSlug, qty: 90 });
      const detail = await addProductToCart({ sessionId, customerId: null, productSlug: simpleSlug, qty: 50 });
      // 90 + 50 = 140 → clamp a 99.
      expect(detail.items[0].qty).toBe(99);
    });

    it("setea customerId en el cart cuando se pasa (cart de usuario logueado)", async () => {
      const sessionId = sid("add");
      const customer = await makeCustomer();
      const detail = await addProductToCart({
        sessionId,
        customerId: customer.id,
        productSlug: simpleSlug,
        qty: 1,
      });
      expect(detail.customerId).toBe(customer.id);
    });

    it("transición anon→logueado: un cart anon (customerId=null) ADOPTA el customerId al re-agregar con customerId", async () => {
      // 1ª llamada: cliente anónimo → cart con customerId=null y 1 item.
      const sessionId = sid("add");
      const anon = await addProductToCart({
        sessionId,
        customerId: null,
        productSlug: simpleSlug,
        qty: 2,
      });
      expect(anon.customerId).toBeNull();
      const cartId = anon.cartId;

      // 2ª llamada: el MISMO sessionId, ahora con customerId (ensureCart detecta
      // existing.customerId !== customerId → hace UPDATE adoptando al dueño).
      const customer = await makeCustomer();
      const adopted = await addProductToCart({
        sessionId,
        customerId: customer.id,
        productSlug: simpleSlug,
        qty: 1,
      });

      // Es el MISMO cart (no se creó uno nuevo), ahora con customerId set.
      expect(adopted.cartId).toBe(cartId);
      expect(adopted.customerId).toBe(customer.id);
      // El item preexistente se preservó y sumó (2 + 1).
      expect(adopted.items).toHaveLength(1);
      expect(adopted.items[0].qty).toBe(3);

      // La adopción persistió en DB sobre la MISMA fila Cart.
      const row = await prisma.cart.findUnique({
        where: { id: cartId },
        select: { customerId: true },
      });
      expect(row!.customerId).toBe(customer.id);
      // Y no se creó un segundo cart para ese sessionId.
      expect(await prisma.cart.count({ where: { sessionId } })).toBe(1);
    });

    it("qty=0 lanza CartError QTY_INVALID y NO crea cart", async () => {
      const sessionId = sid("add");
      await expect(
        addProductToCart({ sessionId, customerId: null, productSlug: simpleSlug, qty: 0 }),
      ).rejects.toMatchObject({ name: "CartError", code: "QTY_INVALID" });
      expect(await prisma.cart.count({ where: { sessionId } })).toBe(0);
    });

    it("qty=100 (>MAX) lanza QTY_INVALID antes de tocar la DB", async () => {
      const sessionId = sid("add");
      await expect(
        addProductToCart({ sessionId, customerId: null, productSlug: simpleSlug, qty: 100 }),
      ).rejects.toMatchObject({ code: "QTY_INVALID" });
      expect(await prisma.cart.count({ where: { sessionId } })).toBe(0);
    });

    it("slug inexistente lanza PRODUCT_NOT_FOUND", async () => {
      await expect(
        addProductToCart({ sessionId: sid("add"), customerId: null, productSlug: `${RUN}-ghost`, qty: 1 }),
      ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
    });

    it("producto inactivo lanza PRODUCT_NOT_FOUND (isActive=false no es comprable)", async () => {
      await expect(
        addProductToCart({ sessionId: sid("add"), customerId: null, productSlug: inactiveSlug, qty: 1 }),
      ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
    });

    it("producto sin variante -DEFAULT lanza NO_DEFAULT_VARIANT", async () => {
      await expect(
        addProductToCart({ sessionId: sid("add"), customerId: null, productSlug: noDefaultSlug, qty: 1 }),
      ).rejects.toMatchObject({ code: "NO_DEFAULT_VARIANT" });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // addPersonalizedToCart
  // ════════════════════════════════════════════════════════════════════════

  describe("addPersonalizedToCart", () => {
    it("happy path: agrega item con designId + variant elegido, snapshot price del variant", async () => {
      const sessionId = sid("perso");
      const detail = await addPersonalizedToCart({
        sessionId,
        customerId: null,
        designId: readyDesignId,
        variantId: persoVariantBId,
        qty: 1,
      });
      expect(detail.items).toHaveLength(1);
      const item = detail.items[0];
      expect(item.designId).toBe(readyDesignId);
      expect(item.variantId).toBe(persoVariantBId);
      expect(item.unitPrice).toBe(PERSO_VAR_B_PRICE);
      expect(item.isPersonalizable).toBe(true);
      // El preview del Design reemplaza la imagen genérica del producto.
      expect(item.designPreviewUrl).toBe("https://cdn.lucams.test/preview-ready-1.png");
      expect(item.imageUrl).toBe("https://cdn.lucams.test/preview-ready-1.png");
    });

    it("sin variantId: fallback a la PRIMERA variant activa (orden createdAt) = Set 6", async () => {
      const sessionId = sid("perso");
      const detail = await addPersonalizedToCart({
        sessionId,
        customerId: null,
        designId: readyDesignId,
        qty: 1,
      });
      expect(detail.items[0].variantId).toBe(persoVariantAId);
      expect(detail.items[0].unitPrice).toBe(PERSO_VAR_A_PRICE);
    });

    it("re-agregar el MISMO designId suma qty al item existente (no duplica el diseño)", async () => {
      const sessionId = sid("perso");
      await addPersonalizedToCart({ sessionId, customerId: null, designId: readyDesignId, qty: 1 });
      const detail = await addPersonalizedToCart({ sessionId, customerId: null, designId: readyDesignId, qty: 2 });
      expect(detail.items).toHaveLength(1);
      expect(detail.items[0].qty).toBe(3);
    });

    it("dos designIds DISTINTOS son dos items separados (aunque compartan variant)", async () => {
      const sessionId = sid("perso");
      await addPersonalizedToCart({ sessionId, customerId: null, designId: readyDesignId, variantId: persoVariantAId, qty: 1 });
      const detail = await addPersonalizedToCart({ sessionId, customerId: null, designId: readyDesign2Id, variantId: persoVariantAId, qty: 1 });
      expect(detail.items).toHaveLength(2);
      const designIds = detail.items.map((i) => i.designId).sort();
      expect(designIds).toEqual([readyDesignId, readyDesign2Id].sort());
    });

    it("design en DRAFT lanza PRODUCT_NOT_FOUND (no surface de detalles internos)", async () => {
      await expect(
        addPersonalizedToCart({ sessionId: sid("perso"), customerId: null, designId: draftDesignId, qty: 1 }),
      ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
    });

    it("designId inexistente lanza PRODUCT_NOT_FOUND", async () => {
      await expect(
        addPersonalizedToCart({ sessionId: sid("perso"), customerId: null, designId: `${RUN}-no-design`, qty: 1 }),
      ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
    });

    it("SEGURIDAD anti-tamper: variantId que NO pertenece al producto del design lanza NO_DEFAULT_VARIANT", async () => {
      // simpleDefaultVariantId pertenece al producto SIMPLE, no al personalizable.
      await expect(
        addPersonalizedToCart({
          sessionId: sid("perso"),
          customerId: null,
          designId: readyDesignId,
          variantId: simpleDefaultVariantId,
          qty: 1,
        }),
      ).rejects.toMatchObject({ code: "NO_DEFAULT_VARIANT" });
    });

    it("qty inválida (0) lanza QTY_INVALID", async () => {
      await expect(
        addPersonalizedToCart({ sessionId: sid("perso"), customerId: null, designId: readyDesignId, qty: 0 }),
      ).rejects.toMatchObject({ code: "QTY_INVALID" });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // addPersonalizedToCart — PRECIO POR FICHA (ADR-057)
  // ════════════════════════════════════════════════════════════════════════

  describe("addPersonalizedToCart — precio POR FICHA (Nombre)", () => {
    it("nombre de 5 letras (MATEO): unitPrice = 5 × precio-por-ficha", async () => {
      const detail = await addPersonalizedToCart({
        sessionId: sid("name"),
        customerId: null,
        designId: nameDesign5Id,
        variantId: nameVariantId,
        qty: 1,
      });
      expect(detail.items[0].unitPrice).toBe(5 * NAME_PER_TILE);
      expect(detail.subtotal).toBe(5 * NAME_PER_TILE);
    });

    it("nombre de 3 letras (ANA): unitPrice = 3 × precio-por-ficha (corto = más barato)", async () => {
      const detail = await addPersonalizedToCart({
        sessionId: sid("name"),
        customerId: null,
        designId: nameDesign3Id,
        variantId: nameVariantId,
        qty: 1,
      });
      expect(detail.items[0].unitPrice).toBe(3 * NAME_PER_TILE);
    });

    it("qty multiplica sobre el precio por ficha: 5 letras × 2 uds → lineTotal = 2 × (5 × ficha)", async () => {
      const detail = await addPersonalizedToCart({
        sessionId: sid("name"),
        customerId: null,
        designId: nameDesign5Id,
        variantId: nameVariantId,
        qty: 2,
      });
      expect(detail.items[0].unitPrice).toBe(5 * NAME_PER_TILE); // por unidad = 5 fichas
      expect(detail.items[0].lineTotal).toBe(2 * 5 * NAME_PER_TILE);
    });

    it("surface != name (foto): NO multiplica — unitPrice = precio de variante tal cual", async () => {
      // readyDesignId es un design de FOTO (sin metadata.surface="name") sobre perso var A.
      const detail = await addPersonalizedToCart({
        sessionId: sid("name"),
        customerId: null,
        designId: readyDesignId,
        variantId: persoVariantAId,
        qty: 1,
      });
      expect(detail.items[0].unitPrice).toBe(PERSO_VAR_A_PRICE);
    });

    it("name design sin metadata.letters → fallback al precio por ficha unitario (nunca 0/NaN)", async () => {
      const detail = await addPersonalizedToCart({
        sessionId: sid("name"),
        customerId: null,
        designId: nameDesignNoLettersId,
        variantId: nameVariantId,
        qty: 1,
      });
      expect(detail.items[0].unitPrice).toBe(NAME_PER_TILE);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // updateCartItemQty / removeCartItem
  // ════════════════════════════════════════════════════════════════════════

  describe("updateCartItemQty / removeCartItem", () => {
    async function seedOneItemCart() {
      const sessionId = sid("upd");
      const detail = await addProductToCart({ sessionId, customerId: null, productSlug: simpleSlug, qty: 4 });
      // CartLineItem expone el id del CartItem como `itemId` (no `.id`).
      return { sessionId, itemId: detail.items[0].itemId };
    }

    it("cambia el qty del item y recalcula subtotal/itemCount", async () => {
      const { sessionId, itemId } = await seedOneItemCart();
      const detail = await updateCartItemQty(sessionId, itemId, 7);
      expect(detail.items[0].qty).toBe(7);
      expect(detail.itemCount).toBe(7);
      expect(detail.subtotal).toBe(7 * SIMPLE_PRICE);
    });

    it("qty=0 BORRA el item (cart queda sin items)", async () => {
      const { sessionId, itemId } = await seedOneItemCart();
      const detail = await updateCartItemQty(sessionId, itemId, 0);
      expect(detail.items).toHaveLength(0);
      expect(detail.subtotal).toBe(0);
      expect(await prisma.cartItem.count({ where: { id: itemId } })).toBe(0);
    });

    it("removeCartItem es alias de qty=0 → borra el item", async () => {
      const { sessionId, itemId } = await seedOneItemCart();
      const detail = await removeCartItem(sessionId, itemId);
      expect(detail.items).toHaveLength(0);
      expect(await prisma.cartItem.count({ where: { id: itemId } })).toBe(0);
    });

    it("qty negativa lanza QTY_INVALID y NO modifica el item", async () => {
      const { sessionId, itemId } = await seedOneItemCart();
      await expect(updateCartItemQty(sessionId, itemId, -1)).rejects.toMatchObject({ code: "QTY_INVALID" });
      const item = await prisma.cartItem.findUnique({ where: { id: itemId }, select: { qty: true } });
      expect(item!.qty).toBe(4);
    });

    it("qty > MAX (100) lanza QTY_INVALID", async () => {
      const { sessionId, itemId } = await seedOneItemCart();
      await expect(updateCartItemQty(sessionId, itemId, 100)).rejects.toMatchObject({ code: "QTY_INVALID" });
    });

    it("qty exactamente MAX (99) es válido", async () => {
      const { sessionId, itemId } = await seedOneItemCart();
      const detail = await updateCartItemQty(sessionId, itemId, 99);
      expect(detail.items[0].qty).toBe(99);
    });

    it("itemId que no pertenece al cart lanza ITEM_NOT_FOUND", async () => {
      const { sessionId } = await seedOneItemCart();
      await expect(updateCartItemQty(sessionId, `${RUN}-ghost-item`, 3)).rejects.toMatchObject({
        code: "ITEM_NOT_FOUND",
      });
    });

    it("sessionId sin cart lanza ITEM_NOT_FOUND", async () => {
      await expect(updateCartItemQty(`${RUN}-no-cart`, `${RUN}-x`, 2)).rejects.toMatchObject({
        code: "ITEM_NOT_FOUND",
      });
    });

    it("SEGURIDAD cross-cart: no se puede editar un item de OTRO cart vía un sessionId ajeno", async () => {
      // Cart A con un item; cart B (otro sessionId). Intentar editar el item de A
      // usando el sessionId de B debe fallar (el item no está en el cart de B).
      const a = await seedOneItemCart();
      const bSession = sid("upd-b");
      await addProductToCart({ sessionId: bSession, customerId: null, productSlug: simpleSlug, qty: 1 });
      await expect(updateCartItemQty(bSession, a.itemId, 9)).rejects.toMatchObject({
        code: "ITEM_NOT_FOUND",
      });
      // El item de A no cambió.
      const item = await prisma.cartItem.findUnique({ where: { id: a.itemId }, select: { qty: true } });
      expect(item!.qty).toBe(4);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // getCartDetail / getCartItemCount — filtrado de productos archivados
  // ════════════════════════════════════════════════════════════════════════

  describe("getCartDetail / getCartItemCount", () => {
    it("getCartDetail null cuando no hay cart para el sessionId", async () => {
      expect(await getCartDetail(`${RUN}-none`)).toBeNull();
    });

    it("getCartItemCount 0 cuando no hay cart", async () => {
      expect(await getCartItemCount(`${RUN}-none`)).toBe(0);
    });

    it("subtotal e itemCount agregan TODAS las líneas", async () => {
      const sessionId = sid("detail");
      await addProductToCart({ sessionId, customerId: null, productSlug: simpleSlug, qty: 2 }); // 2 * 12000
      await addPersonalizedToCart({ sessionId, customerId: null, designId: readyDesignId, variantId: persoVariantAId, qty: 3 }); // 3 * 20000

      const detail = await getCartDetail(sessionId);
      expect(detail!.items).toHaveLength(2);
      expect(detail!.itemCount).toBe(5);
      expect(detail!.subtotal).toBe(2 * SIMPLE_PRICE + 3 * PERSO_VAR_A_PRICE);
      expect(await getCartItemCount(sessionId)).toBe(5);
    });

    it("FILTRA items cuyo producto fue archivado (deletedAt) entre add y read", async () => {
      // Creamos un producto temporal con su default variant, lo agregamos, y luego
      // lo soft-deleteamos → el item debe desaparecer de getCartDetail.
      const tmpSlug = `${RUN}-archivable`;
      const tmp = await prisma.product.create({
        data: {
          slug: tmpSlug,
          name: `Archivable ${RUN}`,
          description: "se archiva mid-test",
          basePrice: 4_000,
          sku: `${RUN}-ARCHIVABLE`.toUpperCase(),
          categoryId,
          variants: {
            create: [
              { name: "Default", sku: `${RUN}-ARCHIVABLE-DEFAULT`.toUpperCase(), price: 4_000, stock: 9, attributes: {} },
            ],
          },
        },
        select: { id: true },
      });

      const sessionId = sid("detail");
      // Item del producto archivable + item del producto simple (sano).
      await addProductToCart({ sessionId, customerId: null, productSlug: tmpSlug, qty: 5 });
      await addProductToCart({ sessionId, customerId: null, productSlug: simpleSlug, qty: 1 });

      // Antes de archivar: 2 items, count 6.
      const before = await getCartDetail(sessionId);
      expect(before!.items).toHaveLength(2);
      expect(before!.itemCount).toBe(6);

      // Archivar (soft-delete) el producto temporal.
      await prisma.product.update({ where: { id: tmp.id }, data: { deletedAt: new Date() } });

      const after = await getCartDetail(sessionId);
      // Solo queda el item del producto simple.
      expect(after!.items).toHaveLength(1);
      expect(after!.items[0].productSlug).toBe(simpleSlug);
      expect(after!.itemCount).toBe(1);
      expect(after!.subtotal).toBe(SIMPLE_PRICE);
      // getCartItemCount aplica el mismo filtro.
      expect(await getCartItemCount(sessionId)).toBe(1);

      // Cleanup del producto temporal (CartItem lo borra cleanupCarts por cartId).
      await prisma.cartItem.deleteMany({ where: { cart: { sessionId } } });
      await prisma.productVariant.deleteMany({ where: { productId: tmp.id } });
      await prisma.product.delete({ where: { id: tmp.id } });
    });

    it("FILTRA items cuyo producto fue desactivado (isActive=false) entre add y read — no solo deletedAt", async () => {
      // El filtro de lectura combina isActive && deletedAt===null. Aquí flipeamos
      // SOLO isActive (deletedAt sigue null) para cubrir esa rama por separado.
      const tmpSlug = `${RUN}-deactivable`;
      const tmp = await prisma.product.create({
        data: {
          slug: tmpSlug,
          name: `Deactivable ${RUN}`,
          description: "se desactiva mid-test",
          basePrice: 6_000,
          sku: `${RUN}-DEACTIVABLE`.toUpperCase(),
          categoryId,
          variants: {
            create: [
              { name: "Default", sku: `${RUN}-DEACTIVABLE-DEFAULT`.toUpperCase(), price: 6_000, stock: 9, attributes: {} },
            ],
          },
        },
        select: { id: true },
      });

      const sessionId = sid("detail");
      // Item del producto desactivable + item del producto simple (sano).
      await addProductToCart({ sessionId, customerId: null, productSlug: tmpSlug, qty: 4 });
      await addProductToCart({ sessionId, customerId: null, productSlug: simpleSlug, qty: 1 });

      // Antes de desactivar: 2 items, count 5.
      const before = await getCartDetail(sessionId);
      expect(before!.items).toHaveLength(2);
      expect(before!.itemCount).toBe(5);

      // Desactivar (isActive=false) SIN soft-delete (deletedAt sigue null).
      await prisma.product.update({ where: { id: tmp.id }, data: { isActive: false } });
      const stillNotDeleted = await prisma.product.findUnique({
        where: { id: tmp.id },
        select: { deletedAt: true, isActive: true },
      });
      expect(stillNotDeleted!.deletedAt).toBeNull(); // confirma que el filtro es por isActive, no por deletedAt
      expect(stillNotDeleted!.isActive).toBe(false);

      const after = await getCartDetail(sessionId);
      // Solo queda el item del producto simple.
      expect(after!.items).toHaveLength(1);
      expect(after!.items[0].productSlug).toBe(simpleSlug);
      expect(after!.itemCount).toBe(1);
      expect(after!.subtotal).toBe(SIMPLE_PRICE);
      // getCartItemCount aplica el MISMO filtro por isActive.
      expect(await getCartItemCount(sessionId)).toBe(1);

      // Cleanup del producto temporal.
      await prisma.cartItem.deleteMany({ where: { cart: { sessionId } } });
      await prisma.productVariant.deleteMany({ where: { productId: tmp.id } });
      await prisma.product.delete({ where: { id: tmp.id } });
    });

    it("unitPrice es un SNAPSHOT: cambiar variant.price en DB tras el add NO reescribe el precio del item leído", async () => {
      // Producto temporal mono-variante para no contaminar el price de los fixtures
      // compartidos (otros tests asumen SIMPLE_PRICE).
      const tmpSlug = `${RUN}-snap`;
      const ORIGINAL_PRICE = 11_000;
      const tmp = await prisma.product.create({
        data: {
          slug: tmpSlug,
          name: `Snap ${RUN}`,
          description: "snapshot de unitPrice",
          basePrice: 999,
          sku: `${RUN}-SNAP`.toUpperCase(),
          categoryId,
          variants: {
            create: [
              { name: "Default", sku: `${RUN}-SNAP-DEFAULT`.toUpperCase(), price: ORIGINAL_PRICE, stock: 30, attributes: {} },
            ],
          },
        },
        select: { id: true, variants: { select: { id: true } } },
      });
      const variantId = tmp.variants[0].id;

      const sessionId = sid("detail");
      const added = await addProductToCart({ sessionId, customerId: null, productSlug: tmpSlug, qty: 2 });
      // Snapshot tomado de variant.price al momento del add.
      expect(added.items[0].unitPrice).toBe(ORIGINAL_PRICE);
      const itemId = added.items[0].itemId;

      // El admin sube el precio de la variante DESPUÉS del add.
      const NEW_PRICE = 99_000;
      await prisma.productVariant.update({ where: { id: variantId }, data: { price: NEW_PRICE } });

      // Re-leer el cart: el unitPrice del item sigue siendo el snapshot original,
      // NO el nuevo price. El lineTotal/subtotal respetan el snapshot.
      const reread = await getCartDetail(sessionId);
      expect(reread!.items[0].unitPrice).toBe(ORIGINAL_PRICE);
      expect(reread!.items[0].lineTotal).toBe(2 * ORIGINAL_PRICE);
      expect(reread!.subtotal).toBe(2 * ORIGINAL_PRICE);

      // El snapshot vive en la fila CartItem (no se deriva de la variante en lectura).
      const persisted = await prisma.cartItem.findUnique({
        where: { id: itemId },
        select: { unitPrice: true },
      });
      expect(persisted!.unitPrice).toBe(ORIGINAL_PRICE);
      // La variante SÍ tiene el price nuevo en DB — solo el cart quedó congelado.
      const variantRow = await prisma.productVariant.findUnique({
        where: { id: variantId },
        select: { price: true },
      });
      expect(variantRow!.price).toBe(NEW_PRICE);

      // Cleanup del producto temporal.
      await prisma.cartItem.deleteMany({ where: { cart: { sessionId } } });
      await prisma.productVariant.deleteMany({ where: { productId: tmp.id } });
      await prisma.product.delete({ where: { id: tmp.id } });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // mergeAnonCartIntoCustomer — 4 ramas
  // ════════════════════════════════════════════════════════════════════════

  describe("mergeAnonCartIntoCustomer", () => {
    it("rama: NO existe anon cart → devuelve el mismo sessionId (noop)", async () => {
      const customer = await makeCustomer();
      const anonSession = sid("m1-anon");
      const result = await mergeAnonCartIntoCustomer(anonSession, customer.id);
      expect(result).toBe(anonSession);
      // No se creó cart alguno.
      expect(await prisma.cart.count({ where: { sessionId: anonSession } })).toBe(0);
    });

    it("rama: anon cart VACÍO → solo asocia customerId, conserva el sessionId", async () => {
      const customer = await makeCustomer();
      const empty = await makeEmptyCart();
      const result = await mergeAnonCartIntoCustomer(empty.sessionId, customer.id);
      expect(result).toBe(empty.sessionId);
      const cart = await prisma.cart.findUnique({ where: { id: empty.id }, select: { customerId: true } });
      expect(cart!.customerId).toBe(customer.id);
    });

    it("rama: customer SIN cart previo → el anon pasa a ser suyo (mismo sessionId, ahora con customerId)", async () => {
      const customer = await makeCustomer();
      const anonSession = sid("m3-anon");
      await addProductToCart({ sessionId: anonSession, customerId: null, productSlug: simpleSlug, qty: 2 });

      const result = await mergeAnonCartIntoCustomer(anonSession, customer.id);
      expect(result).toBe(anonSession);
      const cart = await prisma.cart.findFirst({
        where: { sessionId: anonSession },
        select: { customerId: true, items: { select: { qty: true } } },
      });
      expect(cart!.customerId).toBe(customer.id);
      expect(cart!.items).toHaveLength(1);
      expect(cart!.items[0].qty).toBe(2);
    });

    it("rama: AMBOS existen → fold con dedup por variantId (suma qty) + hard-delete del anon, devuelve sessionId del customer", async () => {
      const customer = await makeCustomer();

      // Cart del customer (previo) con 1 unidad de la variante default del simple.
      const custSession = sid("m4-cust");
      await addProductToCart({ sessionId: custSession, customerId: customer.id, productSlug: simpleSlug, qty: 1 });

      // Cart anon con 3 unidades de la MISMA variante (default) + 2 de la variante extra
      // (que el anon obtiene vía addPersonalizedToCart? no — simple solo agrega default).
      // Para tener 2 variantes en el anon, sembramos manualmente el item extra.
      const anonSession = sid("m4-anon");
      await addProductToCart({ sessionId: anonSession, customerId: null, productSlug: simpleSlug, qty: 3 });
      const anonCart = await prisma.cart.findFirst({ where: { sessionId: anonSession }, select: { id: true } });
      await prisma.cartItem.create({
        data: { cartId: anonCart!.id, variantId: extraVariantId, qty: 2, unitPrice: 5_000 },
      });

      const result = await mergeAnonCartIntoCustomer(anonSession, customer.id);
      // Devuelve el sessionId del cart del customer (la cookie debe quedar en ese).
      expect(result).toBe(custSession);

      // El anon fue hard-deleteado.
      expect(await prisma.cart.count({ where: { sessionId: anonSession } })).toBe(0);

      // El cart del customer ahora tiene: default 1+3=4, extra 2.
      const merged = await getCartDetail(custSession);
      expect(merged!.items).toHaveLength(2);
      const byVariant = new Map(merged!.items.map((i) => [i.variantId, i.qty]));
      expect(byVariant.get(simpleDefaultVariantId)).toBe(4); // 1 + 3 (dedup)
      expect(byVariant.get(extraVariantId)).toBe(2); // nuevo item folded
    });

    it("merge clampa la suma de qty a MAX_QTY_PER_ITEM (99)", async () => {
      const customer = await makeCustomer();
      const custSession = sid("m5-cust");
      await addProductToCart({ sessionId: custSession, customerId: customer.id, productSlug: simpleSlug, qty: 60 });
      const anonSession = sid("m5-anon");
      await addProductToCart({ sessionId: anonSession, customerId: null, productSlug: simpleSlug, qty: 60 });

      await mergeAnonCartIntoCustomer(anonSession, customer.id);
      const merged = await getCartDetail(custSession);
      // 60 + 60 = 120 → clamp 99.
      expect(merged!.items[0].qty).toBe(99);
    });

    it("merge NO agrupa items con designId distinto aunque compartan variantId", async () => {
      const customer = await makeCustomer();

      // Cart del customer con un item personalizado (design ready 1, variant A).
      const custSession = sid("m6-cust");
      await addPersonalizedToCart({
        sessionId: custSession,
        customerId: customer.id,
        designId: readyDesignId,
        variantId: persoVariantAId,
        qty: 1,
      });

      // Cart anon con un item personalizado distinto (design ready 2) sobre la MISMA variant A.
      const anonSession = sid("m6-anon");
      await addPersonalizedToCart({
        sessionId: anonSession,
        customerId: null,
        designId: readyDesign2Id,
        variantId: persoVariantAId,
        qty: 1,
      });

      await mergeAnonCartIntoCustomer(anonSession, customer.id);
      const merged = await getCartDetail(custSession);
      // Dos items separados — mismo variant, distinto design → NO se agrupan.
      expect(merged!.items).toHaveLength(2);
      const designIds = merged!.items.map((i) => i.designId).sort();
      expect(designIds).toEqual([readyDesignId, readyDesign2Id].sort());
    });

    it("rama: customerCart.id === anonCart.id (mismo cart) → noop, devuelve su sessionId", async () => {
      // Un cart que ya pertenece al customer Y cuyo sessionId pasamos como 'anon'.
      const customer = await makeCustomer();
      const session = sid("m7");
      await addProductToCart({ sessionId: session, customerId: customer.id, productSlug: simpleSlug, qty: 2 });

      const result = await mergeAnonCartIntoCustomer(session, customer.id);
      expect(result).toBe(session);
      // Sigue habiendo exactamente 1 cart con 1 item de qty 2.
      const cart = await getCartDetail(session);
      expect(cart!.items).toHaveLength(1);
      expect(cart!.items[0].qty).toBe(2);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // CartError — forma del error (corre con DB porque el describe es skipIf)
  // ════════════════════════════════════════════════════════════════════════

  describe("CartError", () => {
    it("es una Error con name=CartError y message=code", () => {
      const e = new CartError("QTY_INVALID");
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe("CartError");
      expect(e.code).toBe("QTY_INVALID");
      expect(e.message).toBe("QTY_INVALID");
    });
  });
});
