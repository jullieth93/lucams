import { expect, test, type Locator, type Page } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

/*
 * E2E — Ola 22 (Lucy 2026-09-08): UX del Estudio que NO se puede certificar en
 * vitest (Konva + layout real + persistencia):
 *
 *   1. IDENTIFICADOR FUERA DEL TEMPLATE — el número/mes del slot vive como chip
 *      en la barra de acciones (debajo del slot), NUNCA flotando sobre la
 *      plantilla (antes tapaba el avatar del chrome de la Polaroid Instagram).
 *      Assert geométrico: el chip queda por DEBAJO del <canvas> del slot.
 *   2. AVATAR TAPPEABLE (Polaroid Instagram) — tocar el círculo del header del
 *      post (34,34 r=16 en coords de stage 450×600) abre directo el picker de
 *      foto de perfil ("Elige tu foto de perfil").
 *   3. ZOOM DE LIENZO (desktop) — control −/+%/reset INLINE en la fila de pills
 *      superior del editor (junto a «Ideas» / «Ver en tu espacio», 2026-09-09:
 *      antes flotaba sobre la esquina del lienzo e "invadía el canvas"): acerca
 *      hasta el tope por ancho y ALEJA hasta el 50%; reset vuelve a 100% desde
 *      cualquier lado. Display-only (no toca el diseño). Assert geométrico: el
 *      control NUNCA se superpone al <canvas>.
 *   4. FUENTE DEL CALENDARIO EN "AJUSTAR FOTO" — el modal de edición del slot
 *      (pestaña Foto) trae #cal-font-select; cambiarlo persiste en
 *      canvasData.calendarFont (oráculo: DB tras el auto-save) y el selector
 *      del banner del editor refleja el mismo valor.
 *   5. "¿CON IMÁN?" DEL PACK (2026-09-08) — la elección Sin imán de la PDP
 *      (?variant= de la gemela magnet:false) se MUESTRA read-only junto al
 *      stepper de fotos y se PERSISTE en canvasData.magnet (oráculo: DB tras
 *      el auto-save) — de ahí la lee el carrito para resolver la variante.
 *
 * Productos reales leídos de la DB del ambiente (nada hardcodeado): el
 * PHOTO_PACK cuya plantilla es `photo-pack-polaroid-instagram` y el primer
 * CALENDAR_PHOTO_MONTH activo. LOCAL/STG (crea assets → PROHIBIDO en PRD, como
 * la matriz de uploads). Limpieza en afterAll (designs + assets fila/storage
 * de la ventana de la corrida).
 */

const prisma = new PrismaClient();
const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");

// Geometría congelada del avatar (features/personalization/instagram-template-spec.ts):
// el chrome SVG `ig_post_3x4.svg` hornea el círculo en cx=34 cy=34 r=16 de un
// stage lógico 450×600. El click se hace EN PROPORCIÓN del box del <canvas>
// (Konva estira el stage al box CSS del slot), así vale con cualquier zoom.
const IG_STAGE_W = 450;
const IG_STAGE_H = 600;
const IG_AVATAR = { x: 34, y: 34 };

const PHOTO_PATH = path.resolve(__dirname, "../../../../tmp/studio-ux-e2e-photo.jpg");
const AUTOSAVE_WAIT = 4_500;

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

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
  igProductId: string;
  igSlug: string;
  igVariantId: string;
  /** Variante gemela SIN imán del producto IG (magnet:false; "" si el seed no corrió). */
  igSinImanVariantId: string;
  calProductId: string;
  calSlug: string;
  calVariantId: string;
  /** Primer aria-label del chip del slot 1: "Enero" si el schema trae monthLabels. */
  calChipAria: string;
};

const ctx: Ctx = {
  runStartedAt: new Date(),
  igProductId: "",
  igSlug: "",
  igVariantId: "",
  igSinImanVariantId: "",
  calProductId: "",
  calSlug: "",
  calVariantId: "",
  calChipAria: "",
};

test.setTimeout(300_000);
test.skip(
  (process.env.E2E_ENV ?? "local") === "prd",
  "Crea assets/objetos de storage: prohibido en PRD.",
);

test.beforeAll(async () => {
  ctx.runStartedAt = new Date();

  // Foto de prueba 3:4 (mitad turquesa, mitad púrpura — inconfundible).
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

  // Polaroid Instagram: el producto activo cuya plantilla EDITABLE es la IG.
  const igProduct = await withDbRetry(() =>
    prisma.product.findFirst({
      where: {
        isActive: true,
        deletedAt: null,
        templates: { some: { slug: "photo-pack-polaroid-instagram", isActive: true } },
      },
      select: {
        id: true,
        slug: true,
        variants: {
          where: { isActive: true, deletedAt: null },
          select: { id: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    }),
  );
  if (igProduct) {
    ctx.igProductId = igProduct.id;
    ctx.igSlug = igProduct.slug;
    ctx.igVariantId = igProduct.variants[0]?.id ?? "";
    // Gemela "Sin imán" del par Con/Sin (seed-magnet-variants.mjs, 2026-09-08).
    const sinIman = await withDbRetry(() =>
      prisma.productVariant.findFirst({
        where: {
          productId: igProduct.id,
          isActive: true,
          deletedAt: null,
          attributes: { path: ["magnet"], equals: false },
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      }),
    );
    ctx.igSinImanVariantId = sinIman?.id ?? "";
  }

  // Calendario: primer CALENDAR_PHOTO_MONTH activo (slotLabels "Enero"… si el
  // schema lleva monthLabels; si no, el chip cae al identificador genérico #1).
  const calProduct = await withDbRetry(() =>
    prisma.product.findFirst({
      where: { isActive: true, deletedAt: null, personalizationKind: "CALENDAR_PHOTO_MONTH" },
      select: {
        id: true,
        slug: true,
        personalizationSchema: true,
        variants: {
          where: { isActive: true, deletedAt: null },
          select: { id: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  );
  if (calProduct) {
    ctx.calProductId = calProduct.id;
    ctx.calSlug = calProduct.slug;
    ctx.calVariantId = calProduct.variants[0]?.id ?? "";
    const schema = calProduct.personalizationSchema as { monthLabels?: boolean } | null;
    ctx.calChipAria = schema?.monthLabels ? MESES[0]! : "";
  }
});

test.afterAll(async () => {
  // Limpieza de la ventana de la corrida: diseños del borrador invitado +
  // assets subidos (fila + objeto de storage), como studio-gestures.
  const productIds = [ctx.igProductId, ctx.calProductId].filter(Boolean);
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

/** Sube la foto de prueba y reparte el slot 1 vía "Llenar slots…". Oráculo: DB. */
async function uploadAndFillSlot1(page: Page, panel: Locator, productId: string) {
  const consent = page.getByRole("checkbox", { name: /Tengo derecho a usar esta foto/i });
  if (await consent.count()) await consent.first().check();
  await panel.locator('input[type="file"]').first().setInputFiles([PHOTO_PATH]);

  // Oracle DB: la fila DesignAsset aparece cuando el server validó (sharp) y guardó.
  await expect
    .poll(
      async () => {
        const asset = await withDbRetry(() =>
          prisma.designAsset.findFirst({
            where: { createdAt: { gte: ctx.runStartedAt } },
            select: { id: true },
          }),
        );
        return Boolean(asset);
      },
      { timeout: 300_000, intervals: [3000, 5000, 8000, 10000] },
    )
    .toBe(true);

  // El botón lleva aria-label "Llenar {n} slots vacíos con mis fotos" ≠ su texto
  // visible — por eso el filtro va por hasText (precedente studio-gestures).
  const wand = page.getByRole("button").filter({ hasText: /Llenar slots con mis fotos/i });
  await expect(wand.first()).toBeVisible({ timeout: 60_000 });
  await wand.first().click();

  await expect
    .poll(
      async () => {
        const design = await withDbRetry(() =>
          prisma.design.findFirst({
            where: { productId, createdAt: { gte: ctx.runStartedAt } },
            orderBy: { createdAt: "desc" },
            select: { canvasData: true },
          }),
        );
        const slots = (design?.canvasData as { slots?: Array<{ assetUrl?: string | null }> } | null)
          ?.slots;
        return Boolean(slots?.[0]?.assetUrl);
      },
      { timeout: 60_000, intervals: [2000, 3000, 4000, 5000] },
    )
    .toBe(true);
  await page.waitForTimeout(AUTOSAVE_WAIT);

  // Mobile: el Sheet de herramientas sigue abierto tras repartir y TAPA el
  // lienzo (boundingBox/click quedan esperando "visible" para siempre). Radix
  // Sheet cierra con Escape; en desktop es un no-op.
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);
}

test.describe("estudio Ola 22 — identificador fuera del template + avatar tappeable (Polaroid Instagram)", () => {
  test("el chip #1 va en la barra de acciones (debajo del lienzo) y el avatar abre el picker de perfil", async ({
    page,
  }) => {
    test.skip(!ctx.igSlug, "no hay producto con plantilla photo-pack-polaroid-instagram en la DB");
    test.slow(); // cold-compile de la ruta Konva en `next dev`

    await page.goto(
      `/estudio/${ctx.igSlug}${ctx.igVariantId ? `?variant=${ctx.igVariantId}` : ""}`,
      {
        waitUntil: "domcontentloaded",
      },
    );
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_500); // el onboarding monta tarde (race histórica)
    await dismissOverlays(page);

    const panel = await resolvePanel(page);

    // Plantilla por defecto = la primera del producto (Clásica) → cambiar a la IG.
    const igRadio = page.getByRole("radio", { name: /Plantilla Polaroid Instagram/ });
    await expect(igRadio).toBeVisible({ timeout: 15_000 });
    await igRadio.click();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });

    await uploadAndFillSlot1(page, panel, ctx.igProductId);
    await dismissOverlays(page);

    // ── 1. El identificador del slot 1 vive FUERA del template ──
    // El slot (role=button) envuelve el <canvas>; el chip va en la action bar,
    // su HERMANA de abajo (nunca dentro del data-slot-index) → se busca global.
    const slotRoot = page.getByRole("button", { name: /con foto cargada/i }).first();
    const chip = page.locator('span[aria-label$="#1"]');
    await expect(chip).toBeVisible({ timeout: 15_000 });
    // Geometría: el chip queda por DEBAJO del <canvas> del slot (barra de
    // acciones), no flotando sobre la zona imprimible (el badge viejo era
    // top-left ADENTRO del slot y tapaba el avatar).
    const chipBox = (await chip.boundingBox())!;
    const canvasBox = (await slotRoot.locator("canvas").first().boundingBox())!;
    expect(
      chipBox.y,
      "el chip del identificador está bajo el lienzo, no sobre el template",
    ).toBeGreaterThanOrEqual(canvasBox.y + canvasBox.height - 2);

    // ── 2. Tocar el avatar del header abre el picker de foto de perfil ──
    await page
      .locator("canvas")
      .first()
      .click({
        position: {
          x: (IG_AVATAR.x / IG_STAGE_W) * canvasBox.width,
          y: (IG_AVATAR.y / IG_STAGE_H) * canvasBox.height,
        },
      });
    const picker = page.getByRole("dialog", { name: /Elige tu foto de perfil/i });
    await expect(picker).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("estudio Ola 22 — zoom de lienzo", () => {
  test("control −/+%/reset inline en la fila de pills: acercar Y alejar, reset vuelve a 100% (display-only)", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chrome", "el zoom de lienzo es desktop-first");
    test.skip(!ctx.igSlug, "no hay producto con plantilla photo-pack-polaroid-instagram en la DB");
    test.slow();

    await page.goto(
      `/estudio/${ctx.igSlug}${ctx.igVariantId ? `?variant=${ctx.igVariantId}` : ""}`,
      {
        waitUntil: "domcontentloaded",
      },
    );
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_500);
    await dismissOverlays(page);

    // Cambiar a la plantilla IG: 1 slot con stage grande → hay margen para acercar.
    const igRadio = page.getByRole("radio", { name: /Plantilla Polaroid Instagram/ });
    await expect(igRadio).toBeVisible({ timeout: 15_000 });
    await igRadio.click();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });

    // Lucy 2026-09-09 — el control vive INLINE en la fila de pills superior
    // (junto a «Ideas» / «Ver en tu espacio»), nunca flotando sobre el lienzo:
    // además de acercar (tope = ancho disponible), ALEJA hasta el 50% para ver
    // la plantilla entera de un vistazo.
    const zoomGroup = page.getByRole("group", { name: /Zoom del lienzo \d+%/ });
    await expect(zoomGroup).toBeVisible({ timeout: 15_000 });
    await expect(zoomGroup).toContainText("100%");

    const canvasBefore = (await page.locator("canvas").first().boundingBox())!;
    // Assert de posición: el control queda EN LA FILA DE PILLS, ENTERO POR ENCIMA
    // del canvas — su borde INFERIOR no puede tocar el borde superior del lienzo
    // (antes era un overlay absolute top-right que sí lo pisaba).
    const zoomBox = (await zoomGroup.boundingBox())!;
    expect(zoomBox.y + zoomBox.height).toBeLessThanOrEqual(canvasBefore.y + 1);

    await zoomGroup.getByRole("button", { name: "Acercar el lienzo" }).click();
    await expect(zoomGroup).toContainText(/1(0[5-9]|1\d|2\d|25)%/);
    // El slot CRECIÓ en pantalla (display-size mayor)…
    const canvasAfter = (await page.locator("canvas").first().boundingBox())!;
    expect(canvasAfter.width).toBeGreaterThan(canvasBefore.width);

    // Zoom OUT (2026-09-09): se puede bajar del 100% y el slot se encoge.
    await zoomGroup.getByRole("button", { name: "Alejar el lienzo" }).click(); // 125% → 100%
    await zoomGroup.getByRole("button", { name: "Alejar el lienzo" }).click(); // 100% → 75%
    await expect(zoomGroup).toContainText("75%");
    const canvasOut = (await page.locator("canvas").first().boundingBox())!;
    expect(canvasOut.width).toBeLessThan(canvasBefore.width);

    // …y el reset devuelve al 100% también desde el zoom-out.
    await zoomGroup.getByRole("button", { name: "Volver al tamaño original del lienzo" }).click();
    await expect(zoomGroup).toContainText("100%");
    const canvasReset = (await page.locator("canvas").first().boundingBox())!;
    expect(Math.abs(canvasReset.width - canvasBefore.width)).toBeLessThanOrEqual(2);
  });
});

test.describe("estudio Ola 22 — fuente del calendario en Ajustar Foto", () => {
  test("#cal-font-select en la pestaña Foto persiste en canvasData.calendarFont y el banner refleja el cambio", async ({
    page,
  }) => {
    test.skip(!ctx.calSlug, "no hay producto CALENDAR_PHOTO_MONTH activo en la DB");
    test.slow();

    await page.goto(
      `/estudio/${ctx.calSlug}${ctx.calVariantId ? `?variant=${ctx.calVariantId}` : ""}`,
      {
        waitUntil: "domcontentloaded",
      },
    );
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_500);
    await dismissOverlays(page);

    const panel = await resolvePanel(page);
    await uploadAndFillSlot1(page, panel, ctx.calProductId);
    await dismissOverlays(page);

    // El identificador del mes también vive en la barra de acciones (chip "Enero"
    // si el schema trae monthLabels; si no, el identificador genérico #1).
    const slotRoot = page.getByRole("button", { name: /con foto cargada/i }).first();
    const chip = ctx.calChipAria
      ? page.locator(`span[aria-label="${ctx.calChipAria}"]`)
      : page.locator('span[aria-label$="#1"]');
    await expect(chip).toBeVisible({ timeout: 15_000 });

    // Abrir "Ajustar Foto" (control lápiz de la action bar del slot lleno).
    await slotRoot.hover();
    await page.locator('[aria-label^="Editar "]').first().click();
    const dialog = page.locator('[role="dialog"]').last();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const fotoTab = dialog.getByRole("tab", { name: /^Foto$/i }).first();
    if (await fotoTab.count()) await fotoTab.click();

    // El selector de fuente del calendario vive AHORA también dentro del modal.
    const modalSelect = dialog.locator("#cal-font-select");
    await expect(modalSelect).toBeVisible({ timeout: 30_000 });
    await expect(modalSelect.locator("option")).toHaveText([/Redondeada/, /Moderna/, /Manuscrita/]);
    await modalSelect.selectOption("caveat");

    // El selector del BANNER del editor (el que ya existía) comparte el mismo
    // estado del store → refleja "caveat" al instante.
    const bannerSelect = page.getByLabel("Tipo de letra del título del calendario");
    await expect(bannerSelect).toHaveValue("caveat");

    // Persistencia real: el auto-save (debounce ~2s) escribe canvasData.calendarFont.
    await expect
      .poll(
        async () => {
          const design = await withDbRetry(() =>
            prisma.design.findFirst({
              where: { productId: ctx.calProductId, createdAt: { gte: ctx.runStartedAt } },
              orderBy: { createdAt: "desc" },
              select: { canvasData: true },
            }),
          );
          return (design?.canvasData as { calendarFont?: string } | null)?.calendarFont ?? null;
        },
        { timeout: 30_000, intervals: [1500, 2000, 3000, 4000] },
      )
      .toBe("caveat");
  });
});

test.describe("estudio — «¿Con imán?» del pack (PDP elige, Estudio muestra y persiste)", () => {
  test("la variante Sin imán de la PDP se ve read-only y persiste en canvasData.magnet", async ({
    page,
  }) => {
    test.skip(
      !ctx.igSinImanVariantId,
      "el producto IG no tiene gemela magnet:false (seed-magnet-variants no corrió en este ambiente)",
    );
    test.slow();

    await page.goto(`/estudio/${ctx.igSlug}?variant=${ctx.igSinImanVariantId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_500);
    await dismissOverlays(page);

    // Badge read-only junto al stepper "¿Cuántas fotos lleva tu imán?": la
    // elección la fijó la PDP; en el Estudio NO es un control (no hay botón).
    await expect(page.getByText(/Sin imán/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/se elige en la página del producto/)).toBeVisible();

    // Forzar un cambio (N de fotos) para que el auto-save escriba el canvasData:
    // el magnet elegido en la PDP viaja con él → oráculo DB.
    await page.getByLabel("Agregar una foto").click();
    await expect
      .poll(
        async () => {
          const design = await withDbRetry(() =>
            prisma.design.findFirst({
              where: { productId: ctx.igProductId, createdAt: { gte: ctx.runStartedAt } },
              orderBy: { createdAt: "desc" },
              select: { canvasData: true },
            }),
          );
          const cd = design?.canvasData as { magnet?: boolean; photoSlots?: number } | null;
          return cd?.magnet === false && cd.photoSlots === 2;
        },
        { timeout: 30_000, intervals: [1500, 2000, 3000, 4000] },
      )
      .toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Ola 25/28 (owner 2026-09-09 y 2026-09-11) — reglas del dueño:
//   A. TEXTOS POR DEFECTO VISIBLES EN INSTAGRAM (Ola 28 — revierte la
//      invisibilidad de Ola 25 SOLO para la plantilla IG): la tarjeta muestra
//      "@tu_usuario", "Bogotá, Colombia", "362 me gusta", "Tu título acá" y
//      los hashtags con el COLOR POR CAPA (oscuros sobre tarjeta blanca,
//      claros sobre negra; hashtags SIEMPRE azul link IG). Sin riesgo de
//      imprimir placeholders: los 4 textos requeridos bloquean «Vista previa»
//      hasta tener override (Ola 26) y "362 me gusta" es decorativo. Las demás
//      plantillas siguen naciendo vacías (Ola 25 intacto fuera de IG).
//      Probe: conteo de píxeles de tinta en las zonas de texto del slot real
//      (Konva compone varios <canvas> por stage) — oscura, CLARA y azul.
//   B. MARCO INSTAGRAM CONSTANTE: con «Negro» elegido, la ventana de foto NO
//      se inunda del color del borde al alejar la foto (zoom rueda → 50%):
//      el hueco queda blanco (respaldo neutro) en la grilla Y en el preview
//      del modal de edición (WYSIWYG).
//   C. TIRA SIN BORDE CONTINUA: el toggle «Sin borde» deja las fotos PEGADAS
//      — sin canaletas/líneas entre celdas (probe del borde inferior de la
//      celda 1 y superior de la 2: foto, nunca blanco).
// ────────────────────────────────────────────────────────────────────────────

/** Píxeles RGBA del slot en coords del STAGE, componiendo todos sus <canvas>. */
async function probeSlotPixels(
  page: Page,
  slotIndex: number,
  stageW: number,
  stageH: number,
  points: Array<[number, number]>,
): Promise<Array<number[]>> {
  return page.evaluate(
    ({ slotIndex: idx, stageW: w0, stageH: h0, points: pts }) => {
      const slotEl = document.querySelector(`[data-slot-index='${idx}']`);
      if (!slotEl) return [];
      const canvases = [...slotEl.querySelectorAll("canvas")];
      if (!canvases.length) return [];
      const w = canvases[0]!.width;
      const h = canvases[0]!.height;
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d")!;
      for (const c of canvases) octx.drawImage(c, 0, 0, w, h);
      const sx = w / w0;
      const sy = h / h0;
      return pts.map(([x, y]) =>
        Array.from(octx.getImageData(Math.round(x * sx), Math.round(y * sy), 1, 1).data),
      );
    },
    { slotIndex, stageW, stageH, points },
  );
}

const nearWhite = (px: number[]) => px[0]! > 235 && px[1]! > 235 && px[2]! > 235;

/**
 * Conteo de píxeles de "tinta" en una zona del slot, con matcher parametrizable
 * (Ola 28). "dark"/"light" exigen |r−g|,|g−b| pequeños (gris/negro/blanco de la
 * tipografía) → NO cuentan el turquesa de las zonas de edición punteadas
 * (g−r ≈ 124) ni la foto a color; "blue" captura el azul link de los hashtags
 * IG, que el matcher de grises no cuenta.
 */
async function countInkInZone(
  page: Page,
  slotIndex: number,
  stageW: number,
  stageH: number,
  zone: { x: number; y: number; w: number; h: number },
  match: "dark" | "light" | "blue",
): Promise<number> {
  return page.evaluate(
    ({ slotIndex: idx, stageW: w0, stageH: h0, zone: z, match: m }) => {
      const slotEl = document.querySelector(`[data-slot-index='${idx}']`);
      if (!slotEl) return -1;
      const canvases = [...slotEl.querySelectorAll("canvas")];
      if (!canvases.length) return -1;
      const w = canvases[0]!.width;
      const h = canvases[0]!.height;
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d")!;
      for (const c of canvases) octx.drawImage(c, 0, 0, w, h);
      const sx = w / w0;
      const sy = h / h0;
      const img = octx.getImageData(
        Math.round(z.x * sx),
        Math.round(z.y * sy),
        Math.round(z.w * sx),
        Math.round(z.h * sy),
      ).data;
      let ink = 0;
      for (let i = 0; i < img.length; i += 4) {
        const r = img[i]!;
        const g = img[i + 1]!;
        const b = img[i + 2]!;
        const a = img[i + 3]!;
        if (a <= 200) continue;
        if (m === "dark" && Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && r < 225) ink++;
        if (m === "light" && Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && r > 225) ink++;
        // Azul link IG (#00376B clara / #0095F6 oscura): b domina a r y g.
        // El turquesa de las zonas de edición tiene g ≈ b → no entra.
        if (m === "blue" && b > 90 && b - Math.max(r, g) > 25) ink++;
      }
      return ink;
    },
    { slotIndex, stageW, stageH, zone, match },
  );
}

test.describe("estudio Ola 25+28 — textos IG visibles con color por capa + marco IG constante (Polaroid Instagram)", () => {
  test("la tarjeta muestra sus textos por defecto (oscuros en blanca / claros en negra, hashtags azules) y el marco Negro no inunda la ventana al 50% (grilla + modal)", async ({
    page,
  }, testInfo) => {
    test.skip(!ctx.igSlug, "no hay producto con plantilla photo-pack-polaroid-instagram en la DB");
    test.skip(testInfo.project.name === "mobile-chrome", "zoom por rueda = desktop");
    test.slow();

    await page.goto(`/estudio/${ctx.igSlug}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_500);
    await dismissOverlays(page);
    const panel = await resolvePanel(page);
    const igRadio = panel.getByRole("radio", { name: /Instagram/ });
    await igRadio.click();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
    await uploadAndFillSlot1(page, panel, ctx.igProductId);

    // A) Los textos por defecto SE VEN (Ola 28, owner 2026-09-11: "no se ve texto
    // preview, se ve vacío"): header (usuario/ubicación) y footer (likes/título)
    // con tinta OSCURA sobre la tarjeta BLANCA por defecto; los hashtags, AZULES.
    // (Ola 25 los dejaba invisibles — el owner lo revirtió pidiendo el preview.)
    const headerInk = await countInkInZone(
      page,
      0,
      450,
      600,
      { x: 60, y: 16, w: 240, h: 38 },
      "dark",
    );
    const footerInk = await countInkInZone(
      page,
      0,
      450,
      600,
      { x: 15, y: 498, w: 425, h: 60 },
      "dark",
    );
    const hashtagsBlue = await countInkInZone(
      page,
      0,
      450,
      600,
      { x: 15, y: 536, w: 220, h: 16 },
      "blue",
    );
    expect(headerInk).toBeGreaterThan(0);
    expect(footerInk).toBeGreaterThan(0);
    expect(hashtagsBlue).toBeGreaterThan(0);

    // B) Marco Negro + zoom rueda → 50%: el hueco de la ventana queda BLANCO
    // (respaldo neutro), NUNCA del color del borde (inundación reportada en STG).
    await page.getByRole("radio", { name: "Negro" }).first().click();
    await page.waitForTimeout(800);
    const slot = page.locator("[data-slot-index='0']");
    await slot.scrollIntoViewIfNeeded();
    const box = (await slot.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 18; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(600);
    // Huecos laterales de la ventana (la foto al 50% cubre x≈127..323 del stage).
    const gridProbe = await probeSlotPixels(page, 0, 450, 600, [
      [40, 250],
      [410, 250],
      [15, 300], // tarjeta (fuera de la ventana) → negro
    ]);
    expect(gridProbe).toHaveLength(3);
    expect(nearWhite(gridProbe[0]!)).toBe(true);
    expect(nearWhite(gridProbe[1]!)).toBe(true);
    expect(gridProbe[2]![0]!).toBeLessThan(60); // tarjeta oscura intacta

    // A2) MISMA regla por capa con la tarjeta NEGRA: los defaults del header y
    // del footer salen CLAROS (blancos) y los hashtags SIGUEN azules (variante
    // oscura #0095F6). Las zonas de texto viven fuera de la ventana de foto,
    // así que el zoom al 50% no las afecta.
    const headerLight = await countInkInZone(
      page,
      0,
      450,
      600,
      { x: 60, y: 16, w: 240, h: 38 },
      "light",
    );
    const footerLight = await countInkInZone(
      page,
      0,
      450,
      600,
      { x: 15, y: 520, w: 300, h: 30 },
      "light",
    );
    const hashtagsBlueDark = await countInkInZone(
      page,
      0,
      450,
      600,
      { x: 15, y: 536, w: 220, h: 16 },
      "blue",
    );
    expect(headerLight).toBeGreaterThan(0);
    expect(footerLight).toBeGreaterThan(0);
    expect(hashtagsBlueDark).toBeGreaterThan(0);

    // B2) MISMA regla en el preview del modal de edición (WYSIWYG entre superficies).
    await page
      .getByRole("button", { name: /^Editar / })
      .first()
      .click();
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    const modalProbe = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (!dlg) return [];
      const canvases = [...dlg.querySelectorAll("canvas")];
      if (!canvases.length) return [];
      const w = canvases[0]!.width;
      const h = canvases[0]!.height;
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d")!;
      for (const c of canvases) octx.drawImage(c, 0, 0, w, h);
      const sx = w / 450;
      const sy = h / 600;
      const sample = (x: number, y: number) =>
        Array.from(octx.getImageData(Math.round(x * sx), Math.round(y * sy), 1, 1).data);
      return [sample(40, 250), sample(410, 250), sample(15, 300)];
    });
    expect(modalProbe).toHaveLength(3);
    expect(nearWhite(modalProbe[0]!)).toBe(true);
    expect(nearWhite(modalProbe[1]!)).toBe(true);
    expect(modalProbe[2]![0]!).toBeLessThan(60);
    await page.keyboard.press("Escape");
  });
});

test.describe("estudio Ola 25 — tira SIN borde continua (tiras-magneticas-fotos)", () => {
  let stripProductId = "";
  let stripSlug = "";

  test.beforeAll(async () => {
    const stripProduct = await withDbRetry(() =>
      prisma.product.findFirst({
        where: {
          isActive: true,
          deletedAt: null,
          templates: { some: { slug: "photo-strip-3-fotos", isActive: true } },
        },
        select: { id: true, slug: true },
      }),
    );
    stripProductId = stripProduct?.id ?? "";
    stripSlug = stripProduct?.slug ?? "";
  });

  test.afterAll(async () => {
    // Limpieza propia del producto tira (el afterAll global cubre IG/calendario).
    if (stripProductId) {
      await prisma.design
        .deleteMany({
          where: { productId: stripProductId, createdAt: { gte: ctx.runStartedAt } },
        })
        .catch(() => {});
    }
  });

  test("sin líneas entre fotos: el borde inferior de la celda 1 y el superior de la 2 son FOTO", async ({
    page,
  }) => {
    test.skip(!stripSlug, "no hay producto con plantilla photo-strip-3-fotos en la DB");
    test.slow();

    await page.goto(`/estudio/${stripSlug}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_500);
    await dismissOverlays(page);
    const panel = await resolvePanel(page);

    // Subir la foto ×2 para llenar los slots 1 y 2 (autoFill no repite assets).
    const consent = page.getByRole("checkbox", { name: /Tengo derecho a usar esta foto/i });
    if (await consent.count()) await consent.first().check();
    await panel.locator('input[type="file"]').first().setInputFiles([PHOTO_PATH, PHOTO_PATH]);
    await expect
      .poll(
        async () =>
          (await withDbRetry(() =>
            prisma.designAsset.count({ where: { createdAt: { gte: ctx.runStartedAt } } }),
          )) >= 2,
        { timeout: 300_000, intervals: [3000, 5000, 8000, 10000] },
      )
      .toBe(true);
    const wand = page.getByRole("button").filter({ hasText: /Llenar slots con mis fotos/i });
    await expect(wand.first()).toBeVisible({ timeout: 60_000 });
    await wand.first().click();
    await expect
      .poll(
        async () => {
          const design = await withDbRetry(() =>
            prisma.design.findFirst({
              where: { productId: stripProductId, createdAt: { gte: ctx.runStartedAt } },
              orderBy: { createdAt: "desc" },
              select: { canvasData: true },
            }),
          );
          const slots = (
            design?.canvasData as { slots?: Array<{ assetUrl?: string | null }> } | null
          )?.slots;
          return Boolean(slots?.[0]?.assetUrl && slots?.[1]?.assetUrl);
        },
        { timeout: 120_000, intervals: [2000, 3000, 4000, 5000] },
      )
      .toBe(true);
    await page.waitForTimeout(AUTOSAVE_WAIT);
    await page.keyboard.press("Escape").catch(() => {});

    // Toggle «Sin borde» (toolbar de estilo, sobre el lienzo).
    await page.getByRole("radio", { name: "Sin borde" }).first().click();
    await page.waitForTimeout(1_000);

    // Celda 390×400 (stage de la plantilla tira). Con borde había canaleta blanca
    // de 8px al pie de cada celda (Ola 23); Ola 25: la foto toca el borde.
    const [bottomCell1] = await probeSlotPixels(page, 0, 390, 400, [[195, 398]]);
    const [topCell2] = await probeSlotPixels(page, 1, 390, 400, [[195, 2]]);
    const [leftEdge] = await probeSlotPixels(page, 0, 390, 400, [[1, 200]]);
    expect(bottomCell1).toBeDefined();
    expect(topCell2).toBeDefined();
    expect(nearWhite(bottomCell1!)).toBe(false); // era la canaleta (blanca)
    expect(nearWhite(topCell2!)).toBe(false);
    expect(nearWhite(leftEdge!)).toBe(false); // lados también a sangre
  });
});
