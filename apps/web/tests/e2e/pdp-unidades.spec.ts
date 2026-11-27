import { expect, test } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";
import { PHOTO_PACK_UNITS_PER_PACK } from "@/features/products/variant-schemas";

/*
 * E2E — Regla 2026-09-08b (Lucy, unificación "Unidades" + "¿Con imán?" en TODOS
 * los productos). Solo LECTURA (no sube fotos ni muta carrito): corre en
 * cualquier ambiente con los productos activos; si un producto falta en la DB
 * del ambiente, su test se salta con mensaje claro.
 *
 *   1. Composición FIJA — abecedario-completo (compra directa): stepper
 *      "Unidades" (copias, CartItem.qty) + grupo "¿Con imán?" con Con imán
 *      primero; NUNCA un grupo "Cantidad" (la cantidad de fichas la define el
 *      idioma y se describe como texto, no es selector).
 *   2. Composición FIJA personalizable — nombre-personalizado: stepper
 *      "Unidades" (copias) junto al picker de letras (otro concepto: precio
 *      por ficha); el link al Estudio lleva ?copies=N cuando N>1.
 *   3. Composición FIJA personalizable — calendario: par Con/Sin imán sembrado
 *      (packages/db/scripts/seed-magnet-variants.mjs) → "¿Con imán?" con
 *      CON IMÁN PRESELECCIONADO (default) y el CTA habilitado sin clicks;
 *      el stepper "Unidades" suma ?copies=N al link.
 *   4. Tamaño VARIABLE — polaroid y cuadrados: "Packs" como stepper −/+.
 *      Los valores se derivan de las variantes reales y, cuando todas son
 *      múltiplos de seis, se convierten a packs igual que VariantSelector.
 *      Polaroid arranca en 1 pack con precio EXACTO y CTA ?variant=; NUNCA
 *      ?copies= en los packs de tamaño variable.
 *   5. "¿Con imán?" en los PACKS DE FOTO: el grupo aparece también en
 *      polaroid, tiras y separadores (Con imán primero). Si Polaroid tiene
 *      una variante Sin imán activa, elegirla cambia la variante del CTA;
 *      si el ambiente solo ofrece Con imán, ese caso se omite explícitamente.
 *   6. HÍBRIDO tiras (2026-09-09, owner): DOS selectores — "Fotos por tira"
 *      (composición 3/4, photoSlots relabelado, CHIPS — excepción al stepper
 *      universal vía PDP_QUANTITY_CHIP_DIMS) + "Unidades" (stepper de copias
 *      1..99 → ?copies=N junto al ?variant= del CTA).
 */

const prisma = new PrismaClient();

const SLUGS = [
  "abecedario-completo",
  "nombre-personalizado",
  "calendario-mes-a-mes-fotos",
  "set-fotoimanes-polaroid",
  "set-fotoimanes-cuadrados",
  "tiras-magneticas-fotos",
  "separadores-magneticos",
] as const;

const active = new Map<string, boolean>();
const packSteps = new Map<string, number[]>();
const packRangeAll = new Map<string, number[]>();
const hasSinIman = new Map<string, boolean>();

test.beforeAll(async () => {
  const products = await prisma.product.findMany({
    where: { slug: { in: [...SLUGS] }, isActive: true, deletedAt: null },
    select: { slug: true },
  });
  for (const p of products) active.set(p.slug, true);

  for (const slug of ["set-fotoimanes-polaroid", "set-fotoimanes-cuadrados"] as const) {
    if (!active.get(slug)) continue;
    const variants = await prisma.productVariant.findMany({
      where: { product: { slug }, isActive: true, deletedAt: null },
      select: {
        attributes: true,
        stock: true,
        safetyStock: true,
        product: { select: { fulfillmentMode: true } },
      },
    });
    hasSinIman.set(
      slug,
      variants.some((v) => (v.attributes as { magnet?: boolean } | null)?.magnet === false),
    );
    const visibleSteps = (vs: typeof variants) => {
      const slots = [
        ...new Set(
          vs
            .map((v) => (v.attributes as { photoSlots?: number } | null)?.photoSlots)
            .filter((n): n is number => typeof n === "number"),
        ),
      ];
      const usePacks = slots.length > 0 && slots.every((n) => n % PHOTO_PACK_UNITS_PER_PACK === 0);
      return (usePacks ? slots.map((n) => n / PHOTO_PACK_UNITS_PER_PACK) : slots).sort(
        (a, b) => a - b,
      );
    };
    packRangeAll.set(slug, visibleSteps(variants));
    packSteps.set(
      slug,
      visibleSteps(
        variants.filter(
          (v) =>
            v.product.fulfillmentMode === "MADE_TO_ORDER" ||
            v.stock - Math.max(0, v.safetyStock) > 0,
        ),
      ),
    );
  }
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** Cierra el banner de cookies si tapa la ficha. El banner monta TARDE (tras la
 *  hidratación): sin el waitFor corto, `count()` corre antes de que exista y el
 *  banner queda tapando controles del buy-box (mismo flake visto en mobile). */
async function dismissCookies(page: import("@playwright/test").Page) {
  const accept = page.getByRole("button", { name: /Aceptar todas/i });
  try {
    await accept.first().waitFor({ state: "visible", timeout: 5_000 });
    await accept.first().click();
  } catch {
    // Sin banner (consentimiento ya persistido en este contexto).
  }
}

test.describe("PDP — Unidades o Packs según la familia del producto", () => {
  test("abecedario (compra directa): ¿Con imán? (Con imán primero) y la cantidad de fichas NO es selector", async ({
    page,
  }) => {
    test.skip(!active.get("abecedario-completo"), "abecedario-completo no activo en la DB");
    await page.goto("/producto/abecedario-completo", { waitUntil: "domcontentloaded" });
    await dismissCookies(page);

    // ¿Con imán? visible, Con imán listado primero (default del catálogo).
    const iman = page.getByRole("group", { name: "¿Con imán?" });
    await expect(iman).toBeVisible({ timeout: 15_000 });
    await expect(iman.getByRole("button").first()).toHaveText(/Con imán/);

    // La cantidad de fichas NO es selector (la define el idioma) — se describe.
    await expect(page.getByRole("group", { name: "Cantidad" })).toHaveCount(0);
    await expect(page.getByText(/27 en Español · 26 en Inglés/)).toBeVisible();

    // El abecedario se vende por packs: cada pack contiene el set completo.
    // El stepper usa esa misma etiqueta en su nombre accesible y en sus botones.
    const agotado = await page.getByText(/Producto agotado/).count();
    if (agotado === 0) {
      const packs = page.getByRole("group", { name: "Packs" });
      await expect(packs).toBeVisible();
      await packs.getByLabel("Aumentar packs").click();
      await expect(packs.locator('span[aria-live="polite"]')).toHaveText("2 packs");
    }
  });

  test("nombre-personalizado: stepper Unidades junto al picker de letras; ?copies=N al Estudio", async ({
    page,
  }) => {
    test.skip(!active.get("nombre-personalizado"), "nombre-personalizado no activo en la DB");
    await page.goto("/producto/nombre-personalizado", { waitUntil: "domcontentloaded" });
    await dismissCookies(page);

    const unidades = page.getByRole("group", { name: "Unidades" });
    await expect(unidades).toBeVisible({ timeout: 15_000 });
    // El picker de letras convive (precio por ficha — no es cantidad de compra).
    await expect(page.getByText(/por ficha/).first()).toBeVisible();

    const cta = page.getByRole("link", { name: /Personalizar producto/i });
    await expect(cta).toBeVisible();
    const hrefInicial = await cta.getAttribute("href");
    expect(hrefInicial).toContain("/estudio/nombre-personalizado?");
    expect(hrefInicial).toContain("letters=");
    expect(hrefInicial).not.toContain("copies=");

    await unidades.getByLabel("Aumentar unidades").click();
    await expect(cta).toHaveAttribute("href", /copies=2/);
  });

  test("calendario: ¿Con imán? preseleccionado en Con imán (default) y Unidades → ?copies=N", async ({
    page,
  }) => {
    test.skip(!active.get("calendario-mes-a-mes-fotos"), "calendario no activo en la DB");
    await page.goto("/producto/calendario-mes-a-mes-fotos", { waitUntil: "domcontentloaded" });
    await dismissCookies(page);

    // Par Con/Sin imán del seed local: las variantes solo difieren en `magnet`
    // → la PDP preselecciona Con imán y el CTA queda habilitado sin clicks.
    const iman = page.getByRole("group", { name: "¿Con imán?" });
    await expect(iman).toBeVisible({ timeout: 15_000 });
    await expect(iman.getByRole("button", { name: /Con imán/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(iman.getByRole("button", { name: /Sin imán/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    const cta = page.getByRole("link", { name: /Personalizar producto/i });
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute("href");
    expect(href).toContain("/estudio/calendario-mes-a-mes-fotos?variant=");
    expect(href).not.toContain("copies=");

    // Unidades = copias del calendario (set fijo de 12 tarjetas).
    const unidades = page.getByRole("group", { name: "Unidades" });
    await unidades.getByLabel("Aumentar unidades").click();
    await expect(cta).toHaveAttribute("href", /copies=2/);
  });

  test("polaroid: Packs = tamaño del pack (stepper del catálogo), precio exacto, sin ?copies=", async ({
    page,
  }) => {
    test.skip(!active.get("set-fotoimanes-polaroid"), "polaroid no activa en la DB");
    await page.goto("/producto/set-fotoimanes-polaroid", { waitUntil: "domcontentloaded" });
    await dismissCookies(page);

    const packs = page.getByRole("group", { name: "Packs" });
    await expect(packs).toBeVisible({ timeout: 15_000 });
    await expect(packs.getByLabel("Aumentar packs")).toBeVisible();
    await expect(packs.getByLabel("Disminuir packs")).toBeVisible();
    await expect(packs.getByRole("button")).toHaveCount(2);
    await expect(packs.getByText("1 pack", { exact: true })).toBeVisible();
    await expect(packs.getByLabel("Disminuir packs")).toBeDisabled();

    await expect(page.getByText("Desde", { exact: true })).toHaveCount(0);

    const cta = page.getByRole("link", { name: /Personalizar producto/i });
    await expect(cta).toBeVisible();
    const href1 = (await cta.getAttribute("href")) ?? "";
    expect(href1).toContain("/estudio/set-fotoimanes-polaroid?variant=");
    expect(href1).not.toContain("copies=");

    const next = (packSteps.get("set-fotoimanes-polaroid") ?? []).find((n) => n > 1);
    test.skip(next === undefined, "el catálogo del ambiente tiene un solo tamaño de pack");
    await packs.getByLabel("Aumentar packs").click();
    await expect(packs.getByText(`${next} packs`, { exact: true })).toBeVisible();
    const href2 = (await cta.getAttribute("href")) ?? "";
    expect(href2).toContain("/estudio/set-fotoimanes-polaroid?variant=");
    expect(href2).not.toBe(href1);
    expect(href2).not.toContain("copies=");
  });

  test("cuadrados: Packs = tamaño del pack con stepper −/+", async ({ page }) => {
    test.skip(!active.get("set-fotoimanes-cuadrados"), "cuadrados no activo en la DB");
    test.skip(
      (packRangeAll.get("set-fotoimanes-cuadrados") ?? []).length < 2,
      "el catálogo del ambiente tiene un solo tamaño de pack para cuadrados (sin rango que stepear)",
    );
    await page.goto("/producto/set-fotoimanes-cuadrados", { waitUntil: "domcontentloaded" });
    await dismissCookies(page);

    const packs = page.getByRole("group", { name: "Packs" });
    await expect(packs).toBeVisible({ timeout: 15_000 });
    await expect(packs.getByLabel("Aumentar packs")).toBeVisible();
    await expect(packs.getByLabel("Disminuir packs")).toBeVisible();
    await expect(packs.getByRole("button")).toHaveCount(2);
    await expect(page.getByRole("group", { name: "Fotos", exact: true })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Cantidad" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Tamaño" })).toBeVisible();
  });

  test("polaroid: «¿Con imán?» con Con imán preseleccionado; Sin imán cambia la variante del CTA", async ({
    page,
  }) => {
    test.skip(!active.get("set-fotoimanes-polaroid"), "polaroid no activa en la DB");
    test.skip(
      !hasSinIman.get("set-fotoimanes-polaroid"),
      "El ambiente no tiene una variante Polaroid Sin imán activa y seleccionable.",
    );
    await page.goto("/producto/set-fotoimanes-polaroid", { waitUntil: "domcontentloaded" });
    await dismissCookies(page);

    const iman = page.getByRole("group", { name: "¿Con imán?" });
    await expect(iman).toBeVisible({ timeout: 15_000 });
    const conIman = iman.getByRole("button", { name: /Con imán/ });
    const sinIman = iman.getByRole("button", { name: /Sin imán/ });
    await expect(iman.getByRole("button").first()).toHaveText(/Con imán/);
    await expect(conIman).toHaveAttribute("aria-pressed", "true");
    await expect(sinIman).toHaveAttribute("aria-pressed", "false");

    // Elegir Sin imán → otra variante en el deep-link del CTA (el Estudio la
    // mergea sobre el schema y persiste magnet:false en el canvasData).
    const cta = page.getByRole("link", { name: /Personalizar producto/i });
    const hrefCon = (await cta.getAttribute("href")) ?? "";
    expect(hrefCon).toContain("/estudio/set-fotoimanes-polaroid?variant=");
    await sinIman.click();
    await expect(sinIman).toHaveAttribute("aria-pressed", "true");
    await expect(conIman).toHaveAttribute("aria-pressed", "false");
    const hrefSin = (await cta.getAttribute("href")) ?? "";
    expect(hrefSin).toContain("/estudio/set-fotoimanes-polaroid?variant=");
    expect(hrefSin).not.toBe(hrefCon);
  });

  test("separadores: «¿Con imán?» visible junto a «Unidades» (pack size; Con imán primero)", async ({
    page,
  }) => {
    test.skip(!active.get("separadores-magneticos"), "separadores-magneticos no activo en la DB");
    await page.goto("/producto/separadores-magneticos", { waitUntil: "domcontentloaded" });
    await dismissCookies(page);

    const unidades = page.getByRole("group", { name: "Unidades" });
    await expect(unidades).toBeVisible({ timeout: 15_000 });
    const iman = page.getByRole("group", { name: "¿Con imán?" });
    await expect(iman).toBeVisible();
    await expect(iman.getByRole("button").first()).toHaveText(/Con imán/);
  });

  test("tiras (híbrido 2026-09-09): «Fotos por tira» (composición) + «Unidades» (copias) + «¿Con imán?»", async ({
    page,
  }) => {
    test.skip(!active.get("tiras-magneticas-fotos"), "tiras-magneticas-fotos no activo en la DB");
    await page.goto("/producto/tiras-magneticas-fotos", { waitUntil: "domcontentloaded" });
    await dismissCookies(page);

    // Dos conceptos, dos labels: la composición YA NO se llama "Unidades".
    const fotosPorTira = page.getByRole("group", { name: "Fotos por tira" });
    await expect(fotosPorTira).toBeVisible({ timeout: 15_000 });
    await expect(fotosPorTira.getByText("3 fotos")).toBeVisible();
    await expect(fotosPorTira.getByText("4 fotos")).toBeVisible();

    // "Unidades" = stepper de copias (1..99) → viaja como ?copies=N al Estudio.
    const unidades = page.getByRole("group", { name: "Unidades" });
    await expect(unidades).toHaveCount(1);
    await expect(unidades.getByLabel("Aumentar unidades")).toBeVisible();

    const iman = page.getByRole("group", { name: "¿Con imán?" });
    await expect(iman).toBeVisible();
    await expect(iman.getByRole("button").first()).toHaveText(/Con imán/);

    // Con la composición elegida, el CTA emite variant + copies juntos.
    await fotosPorTira.getByRole("button", { name: "3 fotos" }).click();
    const cta = page.getByRole("link", { name: /Personalizar producto/i });
    await expect(cta).toBeVisible();
    expect((await cta.getAttribute("href")) ?? "").not.toContain("copies=");
    await unidades.getByLabel("Aumentar unidades").click();
    await expect(cta).toHaveAttribute("href", /copies=2/);
  });
});
