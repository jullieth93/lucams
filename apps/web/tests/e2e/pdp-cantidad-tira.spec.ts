import { expect, test, type Locator, type Page } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

/*
 * E2E — Regla 2026-09-08b (Lucy, unificación "Unidades") + excepción HÍBRIDA de
 * tiras (2026-09-09, owner) + modelo MULTI-UNIDAD (owner 2026-09-09, regla
 * general: N unidades, CADA UNA diseñable por separado en el Estudio — las
 * "copias idénticas" desaparecen de las superficies personalizables). Los packs
 * de la familia separadores muestran UN concepto de cantidad — "Unidades" (pack
 * size) — y el N elegido ABRE el Estudio con ese N (una sola fuente de verdad:
 * ?variant= → merge de attributes sobre el schema → photoSlots inicial). Tiras
 * muestra DOS selectores: "Fotos por tira" (composición, photoSlots) +
 * "Unidades" (N tiras A DISEÑAR → ?copies=N, nombre del parámetro conservado).
 *
 *   1. PDP separadores-alargados: grupo "Unidades" (stepper 1..6) + "Tamaño";
 *      NUNCA un grupo "Fotos"/"Cantidad" ni un segundo stepper de copias.
 *      Elegir tamaño 4×12 + Unidades=3 → CTA "Personalizar" lleva ?variant= de
 *      la variante qty=3 y el Estudio abre con 3 unidades (slots 3A/3B).
 *   2. PDP tiras-magneticas-fotos (híbrido): "Fotos por tira" (chips "3 fotos"/
 *      "4 fotos", photoSlots relabelado) + stepper "Unidades" (tiras a diseñar)
 *      + "Tamaño". Elegir 4 fotos + 2 unidades → CTA con ?variant= Y ?copies=2 →
 *      el Estudio abre con DOS TIRAS de 4 fotos (2 × 4 = 8 slots, secciones
 *      "Tira 1 de 2" / "Tira 2 de 2").
 *   3. Estudio de tiras: CANALETA visible entre fotos (media canaleta del
 *      color del marco DENTRO de cada celda, stripPhotoRect — WYSIWYG con el
 *      render de producción, que consume la misma matemática). Oráculo de
 *      píxel: la franja inferior del canvas de contenido de la PRIMERA celda
 *      es el color de la tarjeta (blanco), no la foto (regresión: antes las
 *      fotos se tocaban, gap 0 real). Y el flujo multi-unidad COMPLETO: 2
 *      unidades → auto-fill llena la tira 1 → "Aplicar este diseño a todas"
 *      completa la tira 2 → Vista previa muestra las 2 unidades ("2 unidades —
 *      cada una con su propio diseño", sin stepper "Copias") → confirmar deja
 *      UNA línea en el carrito con qty=1 y unitPrice = variante × 2 (oracle UI
 *      "Subtotal (1 ítem)" + "2 tiras de 3 fotos" + oracle DB por la cookie
 *      cart_session — respuesta del modelo multi-unidad al reporte del owner
 *      2026-09-09: "si agrego 2 unidades NO aparecen 2 Tiras Magnéticas").
 *      El carrito de la corrida se limpia en afterAll.
 *
 * Productos reales leídos de la DB del ambiente (nada hardcodeado). Crea un
 * asset de prueba (tiras) → LOCAL/STG solamente (prohibido en PRD, como la
 * matriz de uploads). Limpieza en afterAll (designs + assets de la corrida).
 */

const prisma = new PrismaClient();
const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");

const PHOTO_PATH = path.resolve(__dirname, "../../../../tmp/pdp-cantidad-tira-photo.jpg");
const AUTOSAVE_WAIT = 4_500;

/** Retry para flakes del pooler (mismo criterio que studio-gestures.spec.ts). */
async function withDbRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2_000 * (i + 1)));
    }
  }
  throw lastErr;
}

type Ctx = {
  runStartedAt: Date;
  sepSlug: string;
  sepProductId: string;
  tirasSlug: string;
  tirasProductId: string;
  tirasVariantId: string;
  tirasVariantPrice: number;
  tirasName: string;
  /** Sesión de carrito de la corrida (cookie cart_session) — para el oracle
   *  DB del qty/precio y la limpieza del carrito creado al confirmar la modal. */
  cartSessionId: string;
};

const ctx: Ctx = {
  runStartedAt: new Date(),
  sepSlug: "",
  sepProductId: "",
  tirasSlug: "",
  tirasProductId: "",
  tirasVariantId: "",
  tirasVariantPrice: 0,
  tirasName: "",
  cartSessionId: "",
};

test.setTimeout(300_000);
test.skip(
  (process.env.E2E_ENV ?? "local") === "prd",
  "Crea assets/objetos de storage: prohibido en PRD.",
);

test.beforeAll(async () => {
  ctx.runStartedAt = new Date();

  // Foto de prueba 3:4 (mitad turquesa, mitad púrpura — inconfundible y NUNCA blanca).
  fs.mkdirSync(path.dirname(PHOTO_PATH), { recursive: true });
  await sharp({
    create: { width: 900, height: 1200, channels: 3, background: { r: 45, g: 212, b: 191 } },
  })
    .composite([
      {
        input: {
          create: { width: 900, height: 600, channels: 3, background: { r: 124, g: 106, b: 173 } },
        },
        left: 0,
        top: 600,
      },
    ])
    .jpeg({ quality: 90 })
    .toFile(PHOTO_PATH);

  // Separadores Alargados (el producto del reporte de Lucy).
  const sep = await withDbRetry(() =>
    prisma.product.findFirst({
      where: { slug: "separadores-alargados", isActive: true, deletedAt: null },
      select: { id: true, slug: true },
    }),
  );
  if (sep) {
    ctx.sepSlug = sep.slug;
    ctx.sepProductId = sep.id;
  }

  // Tiras Magnéticas + su variante de 3 fotos (tira clásica 6.5×20).
  const tiras = await withDbRetry(() =>
    prisma.product.findFirst({
      where: { slug: "tiras-magneticas-fotos", isActive: true, deletedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        variants: {
          where: { isActive: true, deletedAt: null },
          select: { id: true, attributes: true, price: true },
        },
      },
    }),
  );
  if (tiras) {
    ctx.tirasSlug = tiras.slug;
    ctx.tirasProductId = tiras.id;
    ctx.tirasName = tiras.name;
    const v3 = tiras.variants.find(
      (v) => (v.attributes as { photoSlots?: number } | null)?.photoSlots === 3,
    );
    const variant = v3 ?? tiras.variants[0];
    ctx.tirasVariantId = variant?.id ?? "";
    ctx.tirasVariantPrice = variant?.price ?? 0;
  }
});

test.afterAll(async () => {
  // Limpieza de la ventana de la corrida (como studio-gestures / studio-ux).
  // El carrito de la corrida (si la prueba llegó a confirmar la modal) se borra
  // por su sessionId exacto — nunca se tocan carritos ajenos.
  if (ctx.cartSessionId) {
    await prisma.cartItem
      .deleteMany({ where: { cart: { sessionId: ctx.cartSessionId } } })
      .catch(() => {});
    await prisma.cart.deleteMany({ where: { sessionId: ctx.cartSessionId } }).catch(() => {});
  }
  const productIds = [ctx.sepProductId, ctx.tirasProductId].filter(Boolean);
  if (productIds.length > 0) {
    await prisma.design
      .deleteMany({
        where: { productId: { in: productIds }, createdAt: { gte: ctx.runStartedAt } },
      })
      .catch(() => {});
  }
  const assets = await prisma.designAsset.findMany({
    where: { createdAt: { gte: ctx.runStartedAt } },
    select: { id: true, storageUrl: true },
  });
  if (assets.length > 0) {
    await prisma.designAsset
      .deleteMany({ where: { id: { in: assets.map((a) => a.id) } } })
      .catch(() => {});
    const service = createClient(
      strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
      strip(process.env.SUPABASE_SECRET_KEY)!,
      { auth: { persistSession: false } },
    );
    await service.storage
      .from("customer-uploads")
      .remove(assets.map((a) => a.storageUrl))
      .catch(() => {});
  }
  await prisma.$disconnect();
  fs.rmSync(PHOTO_PATH, { force: true });
});

/** Cierra lo que tape el lienzo: cookies, onboarding, tip de gestos. */
async function dismissOverlays(page: Page) {
  const accept = page.getByRole("button", { name: /Aceptar todas/i });
  if (await accept.count())
    await accept
      .first()
      .click()
      .catch(() => {});
  const onboarding = page.locator('div[role="dialog"][aria-labelledby="onboarding-title"]');
  if (await onboarding.count()) {
    await page
      .getByRole("button", { name: /Saltar/i })
      .first()
      .click()
      .catch(() => {});
    await onboarding.waitFor({ state: "detached", timeout: 4_000 }).catch(() => {});
  }
  const hint = page.locator('[role="status"] button[aria-label]');
  if (await hint.count())
    await hint
      .first()
      .click()
      .catch(() => {});
}

/** Sidebar desktop o Sheet mobile: misma área de herramientas. */
async function resolvePanel(page: Page): Promise<Locator> {
  let panel = page.locator('aside[aria-label="Herramientas del Estudio"]');
  if (!(await panel.isVisible().catch(() => false))) {
    await page
      .getByRole("button", { name: /abre las herramientas de plantillas y fotos/i })
      .click();
    panel = page.locator('[role="dialog"]');
    await expect(panel).toBeVisible({ timeout: 10_000 });
  }
  return panel;
}

test.describe("regla 2026-09-08b — PDP muestra 'Unidades' (pack size) y el Estudio abre con ese N", () => {
  test("PDP separadores-alargados: stepper Unidades 1..6 + Tamaño, sin grupo 'Fotos'/'Cantidad'", async ({
    page,
  }) => {
    test.skip(!ctx.sepSlug, "separadores-alargados no está activo en la DB");
    await page.goto(`/producto/${ctx.sepSlug}`, { waitUntil: "domcontentloaded" });
    const unidades = page.getByRole("group", { name: "Unidades" });
    await expect(unidades).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("group", { name: "Tamaño" })).toBeVisible();
    // NUNCA el grupo "Fotos" (photoSlots oculto) ni el label viejo "Cantidad";
    // y UN SOLO grupo "Unidades" (no hay stepper de copias en los packs).
    await expect(page.getByRole("group", { name: "Fotos" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Cantidad" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Unidades" })).toHaveCount(1);
    await expect(unidades.getByLabel("Aumentar unidades")).toBeVisible();
    await expect(unidades.getByLabel("Disminuir unidades")).toBeVisible();
  });

  test("PDP Unidades=3 + Tamaño 4×12 → el Estudio abre con 3 unidades (slots 3A/3B)", async ({
    page,
  }) => {
    test.skip(!ctx.sepSlug, "separadores-alargados no está activo en la DB");
    test.slow(); // cold-compile de la ruta Konva en `next dev`
    await page.goto(`/producto/${ctx.sepSlug}`, { waitUntil: "domcontentloaded" });
    await dismissOverlays(page);

    // Selección guiada: primero el tamaño, luego el stepper de Unidades hasta 3.
    const tamano = page.getByRole("group", { name: "Tamaño" });
    await expect(tamano).toBeVisible({ timeout: 15_000 });
    await tamano.getByRole("button", { name: "4×12 cm" }).click();

    const unidades = page.getByRole("group", { name: "Unidades" });
    const plus = unidades.getByLabel("Aumentar unidades");
    await expect(unidades.getByText("1 unidad")).toBeVisible();
    await plus.click();
    await expect(unidades.getByText("2 unidades")).toBeVisible();
    await plus.click();
    await expect(unidades.getByText("3 unidades")).toBeVisible();

    // El CTA lleva la variante qty=3 del tamaño elegido (deep-link ?variant=).
    const cta = page.getByRole("link", { name: /Personalizar producto/i });
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute("href");
    expect(href).toContain(`/estudio/${ctx.sepSlug}?variant=`);
    await cta.click();

    // El Estudio abre con N=3: existen las caras de la tercera unidad y el
    // control de N fotos arranca en 3 (una sola fuente de verdad).
    await expect(page).toHaveURL(new RegExp(`/estudio/${ctx.sepSlug}\\?variant=`));
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_500); // el onboarding monta tarde (race histórica)
    await dismissOverlays(page);
    await expect(page.getByText("3A", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("3B", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("4A", { exact: true })).toHaveCount(0);
    await expect(page.getByText("3 fotos", { exact: true })).toBeVisible();
  });

  test("PDP tiras (híbrido 2026-09-09): 'Fotos por tira' (chips 3/4) + stepper 'Unidades' de copias + Tamaño", async ({
    page,
  }) => {
    test.skip(!ctx.tirasSlug, "tiras-magneticas-fotos no está activo en la DB");
    await page.goto(`/producto/${ctx.tirasSlug}`, { waitUntil: "domcontentloaded" });

    // Composición: la dimensión photoSlots se relabeló a "Fotos por tira".
    const fotosPorTira = page.getByRole("group", { name: "Fotos por tira" });
    await expect(fotosPorTira).toBeVisible({ timeout: 15_000 });
    await expect(fotosPorTira.getByText("3 fotos")).toBeVisible();
    await expect(fotosPorTira.getByText("4 fotos")).toBeVisible();
    await expect(page.getByRole("group", { name: "Tamaño" })).toBeVisible();

    // Copias: UN SOLO grupo "Unidades" — el stepper de copias (1..99), con
    // −/+ y arranque en 1. NUNCA los labels viejos "Fotos" (exacto: "Fotos por
    // tira" lo contiene como subcadena)/"Cantidad".
    const unidades = page.getByRole("group", { name: "Unidades" });
    await expect(unidades).toHaveCount(1);
    await expect(unidades.getByLabel("Aumentar unidades")).toBeVisible();
    await expect(unidades.getByLabel("Disminuir unidades")).toBeVisible();
    await expect(unidades.getByText("1", { exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "Fotos", exact: true })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Cantidad" })).toHaveCount(0);
  });

  test("PDP tiras: 4 fotos + 2 unidades → el Estudio abre con 2 TIRAS de 4 fotos (multi-unidad)", async ({
    page,
  }) => {
    test.skip(!ctx.tirasSlug, "tiras-magneticas-fotos no está activo en la DB");
    test.slow(); // cold-compile de la ruta Konva en `next dev`
    await page.goto(`/producto/${ctx.tirasSlug}`, { waitUntil: "domcontentloaded" });
    await dismissOverlays(page);

    // Selección guiada: composición (4 fotos) — el re-anchor resuelve tamaño e
    // imán solos (1:1 con photoSlots; prefiere Con imán) → CTA habilitado.
    const fotosPorTira = page.getByRole("group", { name: "Fotos por tira" });
    await expect(fotosPorTira).toBeVisible({ timeout: 15_000 });
    await fotosPorTira.getByRole("button", { name: "4 fotos" }).click();

    // Unidades: stepper "Unidades" hasta 2 → DOS tiras A DISEÑAR (multi-unidad
    // 2026-09-09: ya no son "copias idénticas").
    const unidades = page.getByRole("group", { name: "Unidades" });
    await unidades.getByLabel("Aumentar unidades").click();
    await expect(unidades.getByText("2", { exact: true })).toBeVisible();

    // El CTA lleva AMBOS: ?variant= (composición) y ?copies=2 (unidades a diseñar).
    const cta = page.getByRole("link", { name: /Personalizar producto/i });
    await expect(cta).toBeVisible();
    const href = (await cta.getAttribute("href")) ?? "";
    expect(href).toContain(`/estudio/${ctx.tirasSlug}?variant=`);
    expect(href).toContain("copies=2");
    await cta.click();

    // El Estudio abre con 2 UNIDADES de 4 fotos (2 × 4 = 8 slots): pager/headers
    // "Tira 1 de 2" / "Tira 2 de 2". Ola 28 (owner 2026-09-11): el banner YA NO
    // repite la composición ("¿Cuántas fotos lleva tu imán?" sobraba — las fotos
    // por tira se eligieron en la PDP); en su lugar va el stepper "Unidades"
    // con el N vivo (2 tiras a diseñar).
    await expect(page).toHaveURL(new RegExp(`/estudio/${ctx.tirasSlug}\\?variant=.*copies=2`));
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_500); // el onboarding monta tarde (race histórica)
    await dismissOverlays(page);
    const unidadesStudio = page.getByRole("group", { name: "Unidades a diseñar" });
    await expect(unidadesStudio).toBeVisible({ timeout: 20_000 });
    await expect(unidadesStudio.getByText("2 unidades")).toBeVisible();
    await expect(page.getByRole("group", { name: "Cantidad de fotos por imán" })).toHaveCount(0);
    // El pager de unidades (pill con title="Tira 1 de 2") y el header de sección
    // (h2) llevan el MISMO texto → el assert se acota al heading (strict mode).
    await expect(page.getByRole("heading", { name: "Tira 1 de 2", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tira 2 de 2", exact: true })).toBeVisible();

    // Regresión 2026-09-09 (reporte del owner en STG): la plantilla de la tira de
    // 4 fotos (photo-strip-4-fotos) nació en un script one-off y NO estaba en el
    // seed → el barrido de legacy del seed la archivaba en cada corrida, el filtro
    // de aspect dejaba la lista de plantillas VACÍA para la variante 3:4 y el boot
    // caía al template cuadrado genérico 1080×1080 (grilla 2×2). El canvas asociado
    // a la variante es la TIRA: 4 celdas en UNA columna, cada una más alta que
    // ancha (celda 390×530), no una grilla de cuadrados. Multi-unidad: CADA sección
    // (unidad) es su propia tira de 4 celdas en 1 columna.
    // Lazy-mount (ADR-063 T5: >6 slots → IntersectionObserver): al abrir solo la
    // unidad cercana al viewport tiene sus slots montados; la 2ª monta al llevar
    // el scroll a su sección (el pipeline de snapshots fuerza el montaje total).
    await expect(page.locator("[data-slot-index]")).toHaveCount(4);
    for (const unitId of ["studio-unit-0", "studio-unit-1"]) {
      await page.locator(`#${unitId}`).scrollIntoViewIfNeeded();
      const cells = page.locator(`#${unitId} [data-slot-index]`);
      await expect(cells).toHaveCount(4);
      const boxes = await cells.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, w: r.width, h: r.height };
        }),
      );
      for (const b of boxes) {
        // Celda vertical de tira (390×530 → h > w); el fallback roto era cuadrado.
        expect(b.h).toBeGreaterThan(b.w);
        // UNA sola columna (tira continua); el fallback roto armaba 2 columnas.
        expect(Math.abs(b.x - boxes[0].x)).toBeLessThan(2);
      }
    }
    // Tras visitar ambas secciones quedan montadas las 8 celdas (2 tiras × 4 fotos).
    await expect(page.locator("[data-slot-index]")).toHaveCount(8);
  });
});

test.describe("regla 2026-09-08 — tira: canaleta visible entre fotos (WYSIWYG con producción)", () => {
  test("la franja inferior de la celda es el color de la tarjeta, no la foto", async ({ page }) => {
    test.skip(!ctx.tirasSlug, "tiras-magneticas-fotos no está activo en la DB");
    test.slow(); // cold-compile + upload real

    // Híbrido 2026-09-09: el Estudio de tiras también recibe las copias de la
    // PDP (?copies=2) — al final se blinda que la modal de confirmación
    // ("Vista previa" → "Así se verá tu pedido") las muestra tal cual.
    const copiesParam = "&copies=2";
    await page.goto(
      `/estudio/${ctx.tirasSlug}${ctx.tirasVariantId ? `?variant=${ctx.tirasVariantId}${copiesParam}` : ""}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_500);
    await dismissOverlays(page);

    const panel = await resolvePanel(page);
    const consent = page.getByRole("checkbox", { name: /Tengo derecho a usar esta foto/i });
    if (await consent.count()) await consent.first().check();
    // Multi-unidad (2026-09-09): el Estudio abrió con 2 TIRAS de 3 fotos (2 × 3 =
    // 6 slots). El auto-fill reparte las 3 fotos en los primeros 3 slots (tira 1);
    // la tira 2 queda vacía hasta aplicar "Aplicar este diseño a todas".
    await panel
      .locator('input[type="file"]')
      .first()
      .setInputFiles([PHOTO_PATH, PHOTO_PATH, PHOTO_PATH]);

    // Oracle DB: las 3 filas DesignAsset aparecen cuando el server validó y guardó.
    await expect
      .poll(
        async () => {
          const count = await withDbRetry(() =>
            prisma.designAsset.count({
              where: { createdAt: { gte: ctx.runStartedAt } },
            }),
          );
          return count;
        },
        { timeout: 300_000, intervals: [3000, 5000, 8000, 10000] },
      )
      .toBeGreaterThanOrEqual(3);

    // Reparte las fotos en los slots de la PRIMERA tira (celda 0 y siguientes).
    const wand = page.getByRole("button").filter({ hasText: /Llenar slots con mis fotos/i });
    await expect(wand.first()).toBeVisible({ timeout: 60_000 });
    await wand.first().click();
    await page.waitForTimeout(AUTOSAVE_WAIT);
    // Mobile: el Sheet de herramientas queda abierto tras repartir y deja el lienzo
    // (y el atajo del header de la tira) bajo aria-hidden → se cierra ANTES de aplicar.
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);

    // "Aplicar este diseño a todas" (atajo multi-unidad del header de la tira 1):
    // copia los 3 slots llenos a la tira 2 → las 2 unidades quedan completas.
    const aplicarATodas = page
      .getByRole("button")
      .filter({ hasText: "Aplicar este diseño a todas" })
      .first();
    await expect(aplicarATodas).toBeVisible({ timeout: 30_000 });
    await aplicarATodas.click();
    await expect
      .poll(
        async () => {
          const design = await withDbRetry(() =>
            prisma.design.findFirst({
              where: { productId: ctx.tirasProductId, createdAt: { gte: ctx.runStartedAt } },
              orderBy: { createdAt: "desc" },
              select: { canvasData: true },
            }),
          );
          const cd = design?.canvasData as {
            slotCount?: number;
            unitCount?: number;
            unitSlots?: number;
            slots?: Array<{ assetUrl?: string | null }>;
          } | null;
          // Modelo multi-unidad persistido: 2 tiras × 3 fotos, las 6 celdas llenas.
          return (
            cd?.slotCount === 6 &&
            cd?.unitCount === 2 &&
            cd?.unitSlots === 3 &&
            Boolean(cd?.slots?.length) &&
            cd!.slots!.every((s) => Boolean(s.assetUrl))
          );
        },
        { timeout: 60_000, intervals: [2000, 3000, 4000, 5000] },
      )
      .toBe(true);
    // Mobile: el Sheet de herramientas queda abierto tras repartir y tapa el lienzo.
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);

    // Oráculo de píxel sobre el CANVAS de contenido de la celda 0 (modo tira:
    // sin capa de sombra → el primer <canvas> del Stage es la capa de contenido
    // con frame-card + foto). La franja inferior = media canaleta (8px de stage)
    // del color de la tarjeta (blanco default) — la foto termina ANTES.
    const slot0 = page.locator('[data-slot-index="0"]');
    await expect(slot0.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
    const probe = await slot0
      .locator("canvas")
      .first()
      .evaluate((el) => {
        const canvas = el as HTMLCanvasElement;
        const ctx2d = canvas.getContext("2d");
        if (!ctx2d) return null;
        const x = Math.floor(canvas.width / 2);
        const read = (y: number) => Array.from(ctx2d.getImageData(x, y, 1, 1).data.slice(0, 3));
        return {
          bottom: read(canvas.height - 2), // media canaleta (regla 2026-09-08)
          center: read(Math.floor(canvas.height / 2)), // foto (nunca blanca)
        };
      });
    expect(probe).not.toBeNull();
    const nearWhite = (rgb: number[]) => rgb.every((c) => c >= 235);
    // La canaleta es blanca (color de tarjeta default)…
    expect(nearWhite(probe!.bottom)).toBe(true);
    // …y el centro de la celda SÍ es la foto (turquesa/púrpura, nunca blanco):
    // la foto no desapareció, solo deja la canaleta visible.
    expect(nearWhite(probe!.center)).toBe(false);

    // Multi-unidad 2026-09-09 — la Vista previa muestra TODAS las unidades y la
    // modal las describe como dato ("2 unidades — cada una con su propio diseño";
    // el concepto "copias idénticas" desapareció). El gatillo es el botón "Vista
    // previa" (renombrado; antes «¡Listo!»). Su NOMBRE ACCESIBLE es un aria-label
    // CMS (estudio.lienzo.finalize-aria — en LOCAL sobreescrito a "Listo, generar
    // diseño final"), así que el locator acepta ambas variantes y filtra al visible
    // (inline en desktop / FAB en mobile).
    const vistaPrevia = page
      .getByRole("button", { name: /Vista previa|Listo/i })
      .and(page.locator(":visible"))
      .first();
    await expect(vistaPrevia).toBeVisible({ timeout: 30_000 });
    await expect(vistaPrevia).toBeEnabled({ timeout: 30_000 });
    await vistaPrevia.click();
    const previewDialog = page.getByRole("dialog", { name: /Así se verá/i });
    await expect(previewDialog).toBeVisible({ timeout: 30_000 });
    await expect(
      previewDialog.getByText("2 unidades — cada una con su propio diseño"),
    ).toBeVisible();
    await expect(previewDialog.getByText(/copias idénticas/)).toHaveCount(0);
    await expect(previewDialog.getByRole("group", { name: "Copias" })).toHaveCount(0);
    await previewDialog.getByRole("button", { name: /Volver a editar/i }).click();
    await expect(previewDialog).toBeHidden({ timeout: 10_000 });

    // Reporte del owner (2026-09-09): "si agrego 2 unidades NO aparecen 2 Tiras
    // Magnéticas". Se blinda el camino COMPLETO hasta el carrito en el modelo
    // multi-unidad: confirmar la modal agrega UNA línea con el diseño de las 2
    // tiras (qty=1) y el precio = variante × 2 derivado en el servidor —
    // visible en la UI y verificado contra la DB.
    await expect(vistaPrevia).toBeEnabled({ timeout: 30_000 });
    await vistaPrevia.click();
    await expect(previewDialog).toBeVisible({ timeout: 30_000 });
    await expect(
      previewDialog.getByText("2 unidades — cada una con su propio diseño"),
    ).toBeVisible();
    await previewDialog.getByRole("button", { name: /agregar al carrito/i }).click();

    // Redirect a /carrito?personalized=1 (el finalize + subida de imprenta tarda).
    await expect(page).toHaveURL(/\/carrito/, { timeout: 180_000 });
    // La única línea del carrito es el diseño de 2 tiras con qty=1 → el subtotal
    // cuenta 1 ítem (la línea contiene TODAS las unidades) y la línea describe
    // las 2 tiras en el resumen de pieza.
    await expect(page.getByText("Subtotal (1 ítem)")).toBeVisible({ timeout: 30_000 });
    const cartLine = page.locator("li", {
      has: page.getByRole("link", { name: ctx.tirasName }),
    });
    await expect(cartLine.getByText(/2 tiras de 3 fotos/)).toBeVisible();

    // Oracle DB: el CartItem de ESTA sesión (cookie cart_session) tiene qty=1,
    // la variante de 3 fotos que abrió el Estudio y unitPrice = 2 × precio de la
    // variante (las 2 tiras, derivado server-side del canvasData).
    const cookies = await page.context().cookies();
    const sessionId = cookies.find((c) => c.name === "cart_session")?.value ?? "";
    expect(sessionId).not.toBe("");
    ctx.cartSessionId = sessionId;
    const cart = await withDbRetry(() =>
      prisma.cart.findUnique({
        where: { sessionId },
        select: { items: { select: { variantId: true, qty: true, unitPrice: true } } },
      }),
    );
    const cartItem = cart?.items.find((i) => i.variantId === ctx.tirasVariantId);
    expect(cartItem?.qty).toBe(1);
    expect(cartItem?.unitPrice).toBe(ctx.tirasVariantPrice * 2);
  });
});
