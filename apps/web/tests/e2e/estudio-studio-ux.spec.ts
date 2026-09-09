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
 *   3. ZOOM DE LIENZO (desktop) — control flotante −/+%/reset solo cuando hay
 *      margen real para acercar (tope = ancho del contenedor); acercar sube el
 *      % y reset vuelve a 100%. Display-only (no toca el diseño).
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
  test("control −/+%/reset: acercar sube el % y reset vuelve a 100% (display-only)", async ({
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

    // El control SOLO aparece cuando el ancho del grid a zoom 1 no llena el
    // contenedor (tope = ancho disponible). En desktop 1280 el stage IG de 1
    // slot queda capado por alto → hay margen real para acercar.
    const zoomGroup = page.getByRole("group", { name: /Zoom del lienzo \d+%/ });
    await expect(zoomGroup).toBeVisible({ timeout: 15_000 });
    await expect(zoomGroup).toContainText("100%");

    const canvasBefore = (await page.locator("canvas").first().boundingBox())!;
    await zoomGroup.getByRole("button", { name: "Acercar el lienzo" }).click();
    await expect(zoomGroup).toContainText(/1(0[5-9]|1\d|2\d|25)%/);
    // El slot CRECIÓ en pantalla (display-size mayor)…
    const canvasAfter = (await page.locator("canvas").first().boundingBox())!;
    expect(canvasAfter.width).toBeGreaterThan(canvasBefore.width);
    // …y el reset devuelve al 100%.
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
