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
 *   4. Tamaño VARIABLE — polaroid: "Unidades" = pack size (stepper 1..10),
 *      preseleccionado en N=1 (única elección real), precio EXACTO (sin
 *      "Desde") y CTA con ?variant= de la variante N elegida; NUNCA ?copies=
 *      (los packs no eligen copias en la PDP — se ajustan en el carrito).
 *   5. "¿Con imán?" en los PACKS DE FOTO (2026-09-08, pares sembrados por
 *      seed-magnet-variants.mjs): el grupo aparece también en polaroid, tiras
 *      y separadores (Con imán primero); en polaroid queda preseleccionado
 *      (la variante default N=1 es la Con imán) y elegir Sin imán cambia la
 *      variante del CTA — la elección viaja ?variant= → Estudio → canvasData.
 */

const prisma = new PrismaClient();

const SLUGS = [
  "abecedario-completo",
  "nombre-personalizado",
  "calendario-mes-a-mes-fotos",
  "set-fotoimanes-polaroid",
  "tiras-magneticas-fotos",
  "separadores-magneticos",
] as const;

const active = new Map<string, boolean>();

test.beforeAll(async () => {
  const products = await prisma.product.findMany({
    where: { slug: { in: [...SLUGS] }, isActive: true, deletedAt: null },
    select: { slug: true },
  });
  for (const p of products) active.set(p.slug, true);
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

  test("polaroid: Unidades = pack size (stepper 1..10, N=1 preseleccionado), precio exacto, sin ?copies=", async ({
    page,
  }) => {
    test.skip(!active.get("set-fotoimanes-polaroid"), "polaroid no activa en la DB");
    await page.goto("/producto/set-fotoimanes-polaroid", { waitUntil: "domcontentloaded" });
    await dismissCookies(page);

    const unidades = page.getByRole("group", { name: "Unidades" });
    await expect(unidades).toBeVisible({ timeout: 15_000 });
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

    // Subir a 2 unidades → el deep-link cambia a la variante N=2.
    await unidades.getByLabel("Aumentar unidades").click();
    await expect(unidades.getByText("2 fotos")).toBeVisible();
    const href2 = (await cta.getAttribute("href")) ?? "";
    expect(href2).toContain("/estudio/set-fotoimanes-polaroid?variant=");
    expect(href2).not.toBe(href1);
    expect(href2).not.toContain("copies=");
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

  test("tiras y separadores: «¿Con imán?» visible junto a «Unidades» (Con imán primero)", async ({
    page,
  }) => {
    test.skip(
      !active.get("tiras-magneticas-fotos") || !active.get("separadores-magneticos"),
      "tiras o separadores no activos en la DB",
    );
    for (const slug of ["tiras-magneticas-fotos", "separadores-magneticos"] as const) {
      await page.goto(`/producto/${slug}`, { waitUntil: "domcontentloaded" });
      await dismissCookies(page);

      const unidades = page.getByRole("group", { name: "Unidades" });
      await expect(unidades, `${slug}: falta el grupo Unidades`).toBeVisible({ timeout: 15_000 });
      const iman = page.getByRole("group", { name: "¿Con imán?" });
      await expect(iman, `${slug}: falta el grupo ¿Con imán?`).toBeVisible();
      await expect(iman.getByRole("button").first()).toHaveText(/Con imán/);
    }
  });
});
