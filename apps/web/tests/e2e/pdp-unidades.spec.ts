import { expect, test } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";

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
 *   4. Tamaño VARIABLE — polaroid y cuadrados: "Unidades" = pack size como
 *      stepper −/+ (2026-09-09, owner — UNIVERSAL en las familias de tamaño
 *      variable; NUNCA chips de elección única como el "1 fotos o 10 fotos"
 *      que se veía cuando el catálogo solo tenía esas 2 variantes). El rango
 *      es min..max de las variantes REALES y el ± salta entre los tamaños que
 *      existen con stock (local 1..10 → 2; STG {1,10} → 10 — el test lee los
 *      tamaños de la DB del ambiente, nada hardcodeado). Polaroid arranca
 *      preseleccionado en N=1 (única elección real) con precio EXACTO (sin
 *      "Desde") y CTA con ?variant= de la variante N elegida; NUNCA ?copies=
 *      (los packs no eligen copias en la PDP — se ajustan en el carrito).
 *   5. "¿Con imán?" en los PACKS DE FOTO (2026-09-08, pares sembrados por
 *      seed-magnet-variants.mjs): el grupo aparece también en polaroid, tiras
 *      y separadores (Con imán primero); en polaroid queda preseleccionado
 *      (la variante default N=1 es la Con imán) y elegir Sin imán cambia la
 *      variante del CTA — la elección viaja ?variant= → Estudio → canvasData.
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
/** Tamaños de pack EXISTENTES con stock (photoSlots distintos, ordenados) por
 *  slug — el stepper salta entre ellos (2026-09-09: no exige continuidad). */
const packSteps = new Map<string, number[]>();
/** Distintos photoSlots SIN filtrar stock: si la dimensión tiene rango (>1
 *  tamaño) aunque haya quiebres de stock, el pack size es stepper. */
const packRangeAll = new Map<string, number[]>();

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
      select: { attributes: true, stock: true },
    });
    const slotsOf = (vs: typeof variants) => [
      ...new Set(
        vs
          .map((v) => (v.attributes as { photoSlots?: number } | null)?.photoSlots)
          .filter((n): n is number => typeof n === "number"),
      ),
    ];
    packRangeAll.set(
      slug,
      slotsOf(variants).sort((a, b) => a - b),
    );
    packSteps.set(
      slug,
      slotsOf(variants.filter((v) => v.stock > 0)).sort((a, b) => a - b),
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

test.describe("regla 2026-09-08b — 'Unidades' en TODA PDP (un concepto, un label)", () => {
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

    // El stepper "Unidades" de copias vive en el buy-box de compra directa —
    // en LOCAL el abecedario está sin stock (buy-box → "Producto agotado"),
    // así que acá se verifica solo si el producto tiene stock en el ambiente.
    const agotado = await page.getByText(/Producto agotado/).count();
    if (agotado === 0) {
      const unidades = page.getByRole("group", { name: "Unidades" });
      await expect(unidades).toBeVisible();
      await unidades.getByLabel("Aumentar unidades").click();
      await expect(unidades.getByText("2", { exact: true })).toBeVisible();
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

  test("polaroid: Unidades = pack size (stepper min..max del catálogo, N=1 preseleccionado), precio exacto, sin ?copies=", async ({
    page,
  }) => {
    test.skip(!active.get("set-fotoimanes-polaroid"), "polaroid no activa en la DB");
    await page.goto("/producto/set-fotoimanes-polaroid", { waitUntil: "domcontentloaded" });
    await dismissCookies(page);

    const unidades = page.getByRole("group", { name: "Unidades" });
    await expect(unidades).toBeVisible({ timeout: 15_000 });
    // Stepper −/+ (NUNCA chips de elección única — reporte del owner: con el
    // catálogo {1,10} la PDP mostraba chips "1 fotos o 10 fotos"). El grupo
    // solo tiene los 2 botones del stepper.
    await expect(unidades.getByLabel("Aumentar unidades")).toBeVisible();
    await expect(unidades.getByLabel("Disminuir unidades")).toBeVisible();
    await expect(unidades.getByRole("button")).toHaveCount(2);
    // N=1 preseleccionado (única elección real del producto de 1 tamaño).
    await expect(unidades.getByText("1 foto")).toBeVisible();
    await expect(unidades.getByLabel("Disminuir unidades")).toBeDisabled();

    // Precio EXACTO desde el primer paint (la variante N=1 está elegida) — sin "Desde".
    await expect(page.getByText("Desde", { exact: true })).toHaveCount(0);

    const cta = page.getByRole("link", { name: /Personalizar producto/i });
    await expect(cta).toBeVisible();
    const href1 = (await cta.getAttribute("href")) ?? "";
    expect(href1).toContain("/estudio/set-fotoimanes-polaroid?variant=");
    // Los packs NO eligen copias en la PDP (se ajustan en el carrito).
    expect(href1).not.toContain("copies=");

    // "+" salta al siguiente tamaño que EXISTE con stock en el catálogo del
    // ambiente (local 1..10 → 2; STG {1,10} → 10) y el deep-link cambia a la
    // variante de ese N.
    const next = (packSteps.get("set-fotoimanes-polaroid") ?? []).find((n) => n > 1);
    test.skip(next === undefined, "el catálogo del ambiente tiene un solo tamaño de pack");
    await unidades.getByLabel("Aumentar unidades").click();
    await expect(unidades.getByText(`${next} fotos`)).toBeVisible();
    const href2 = (await cta.getAttribute("href")) ?? "";
    expect(href2).toContain("/estudio/set-fotoimanes-polaroid?variant=");
    expect(href2).not.toBe(href1);
    expect(href2).not.toContain("copies=");
  });

  test("cuadrados: Unidades = pack size con stepper −/+ (2026-09-09 — universal en familias variables)", async ({
    page,
  }) => {
    test.skip(!active.get("set-fotoimanes-cuadrados"), "cuadrados no activo en la DB");
    test.skip(
      (packRangeAll.get("set-fotoimanes-cuadrados") ?? []).length < 2,
      "el catálogo del ambiente tiene un solo tamaño de pack para cuadrados (sin rango que stepear)",
    );
    await page.goto("/producto/set-fotoimanes-cuadrados", { waitUntil: "domcontentloaded" });
    await dismissCookies(page);

    // El pack size es stepper −/+ (no chips "1 fotos / 2 fotos / …"): el grupo
    // "Unidades" solo tiene los 2 botones del stepper. NUNCA los labels viejos
    // "Fotos" (exacto: "Fotos por tira" lo contiene como subcadena)/"Cantidad".
    const unidades = page.getByRole("group", { name: "Unidades" });
    await expect(unidades).toBeVisible({ timeout: 15_000 });
    await expect(unidades.getByLabel("Aumentar unidades")).toBeVisible();
    await expect(unidades.getByLabel("Disminuir unidades")).toBeVisible();
    await expect(unidades.getByRole("button")).toHaveCount(2);
    await expect(page.getByRole("group", { name: "Fotos", exact: true })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Cantidad" })).toHaveCount(0);
    // La dimensión de tamaño sigue en chips (no es de cantidad).
    await expect(page.getByRole("group", { name: "Tamaño" })).toBeVisible();
  });

  test("polaroid: «¿Con imán?» con Con imán preseleccionado; Sin imán cambia la variante del CTA", async ({
    page,
  }) => {
    test.skip(!active.get("set-fotoimanes-polaroid"), "polaroid no activa en la DB");
    await page.goto("/producto/set-fotoimanes-polaroid", { waitUntil: "domcontentloaded" });
    await dismissCookies(page);

    // El par Con/Sin imán (seed 2026-09-08) suma la dimensión al selector de la PDP.
    const iman = page.getByRole("group", { name: "¿Con imán?" });
    await expect(iman).toBeVisible({ timeout: 15_000 });
    // Con imán listado primero y PRESELECCIONADO: la variante default del pack
    // (N=1, la única elección real de tamaño) es la Con imán (createdAt anterior
    // a la gemela — ver page.tsx: preselección de N mínimo).
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
