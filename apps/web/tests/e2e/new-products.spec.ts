import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { Prisma } from "@lucams/db";
import type { Locator, Page } from "@playwright/test";
import { db, disconnectDb } from "./fixtures/db";
import { dismissCookieBanner, E2E_ENV, expect, test } from "./fixtures/auth";

const ORNAMENT_SLUG = "bola-navidena-personalizada";
const MINI_BOOK_SLUG = "mini-libros-magneticos";
const TEST_NOTE = "E2E new products";
const runStartedAt = new Date();
const cartSessions = new Set<string>();
let miniBookId = "";
let miniBookVariantId = "";

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

async function prepareOrnamentStudio(page: Page) {
  await page.addInitScript(() => {
    for (const surface of ["default", "cards", "bookmarks", "strips", "calendar", "polaroid-ig"]) {
      window.localStorage.setItem(`lucams_studio_onboarded_${surface}`, "v1");
    }
  });
  await page.goto(`/estudio/${ORNAMENT_SLUG}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
  await dismissCookieBanner(page);
  const panel = await resolvePanel(page);
  await panel.getByRole("radio", { name: /Foto circular/ }).click();
  return panel;
}

async function uploadOrnamentFace(
  panel: Locator,
  file: { name: string; mimeType: string; buffer: Buffer },
  expectedAssets: number,
) {
  const consent = panel.getByRole("checkbox", { name: /Tengo derecho a usar esta foto/i });
  if (await consent.count()) await consent.first().check();
  await panel.locator('input[type="file"]').first().setInputFiles(file);
  await expect
    .poll(() => db().designAsset.count({ where: { createdAt: { gte: runStartedAt } } }), {
      timeout: 60_000,
    })
    .toBe(expectedAssets);
  await panel.getByRole("button", { name: /Llenar 1 slots?/i }).click({ timeout: 10_000 });
  await expect
    .poll(
      async () => {
        const design = await db().design.findFirst({
          where: { product: { slug: ORNAMENT_SLUG }, createdAt: { gte: runStartedAt } },
          orderBy: { createdAt: "desc" },
          select: { canvasData: true },
        });
        const canvas = design?.canvasData as { slots?: Array<{ assetId?: string | null }> } | null;
        return Boolean(canvas?.slots?.[expectedAssets - 1]?.assetId);
      },
      { timeout: 60_000 },
    )
    .toBe(true);
}

async function centerColor(buffer: Buffer) {
  const metadata = await sharp(buffer).metadata();
  const left = Math.floor(metadata.width! * 0.4);
  const top = Math.floor(metadata.height! * 0.4);
  const stats = await sharp(buffer)
    .extract({
      left,
      top,
      width: Math.ceil(metadata.width! * 0.2),
      height: Math.ceil(metadata.height! * 0.2),
    })
    .stats();
  return stats.channels.slice(0, 3).map((channel) => channel.mean);
}

async function dragOrnamentScene(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
) {
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const endX = startX + Math.min(140, box.width * 0.2);
  const touch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (!touch) {
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, startY, { steps: 10 });
    await page.mouse.up();
    return;
  }

  const client = await page.context().newCDPSession(page);
  try {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: startX, y: startY }],
    });
    for (let step = 1; step <= 10; step += 1) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: startX + ((endX - startX) * step) / 10, y: startY }],
      });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await client.detach();
  }
}

test.skip(
  E2E_ENV === "prd",
  "La validación activa productos solo en LOCAL/STG y los restaura después.",
);
test.setTimeout(240_000);

test.beforeAll(async () => {
  const products = await db().product.findMany({
    where: { slug: { in: [ORNAMENT_SLUG, MINI_BOOK_SLUG] }, deletedAt: null },
    select: { id: true, slug: true },
  });
  expect(products).toHaveLength(2);
  miniBookId = products.find((product) => product.slug === MINI_BOOK_SLUG)!.id;

  await db().product.updateMany({
    where: { id: { in: products.map((product) => product.id) } },
    data: {
      isActive: true,
      basePrice: 1_500_000,
      physicalSpecs: {
        weightGrams: 100,
        widthCm: 16,
        heightCm: 12,
        depthCm: 9,
        material: "PAPER",
        thicknessMm: 5,
        countryOfOrigin: "CO",
      },
    },
  });
  const miniVariant = await db().productVariant.findFirstOrThrow({
    where: {
      productId: miniBookId,
      isActive: true,
      deletedAt: null,
      attributes: { path: ["sizeCm"], equals: "7.1×5" },
      OR: [{ attributes: { path: ["magnet"], equals: true } }],
    },
    select: { id: true },
  });
  miniBookVariantId = miniVariant.id;
  await db().productVariant.updateMany({
    where: { productId: { in: products.map((product) => product.id) } },
    data: { price: 1_500_000, stock: 100 },
  });
  await db().wholesaleTier.create({
    data: {
      productId: miniBookId,
      minQty: 3,
      unitPrice: 1_200_000,
      note: TEST_NOTE,
      isActive: true,
      createdBy: TEST_NOTE,
      updatedBy: TEST_NOTE,
    },
  });
});

test.afterAll(async () => {
  try {
    const designs = await db().design.findMany({
      where: {
        createdAt: { gte: runStartedAt },
        product: { slug: { in: [ORNAMENT_SLUG, MINI_BOOK_SLUG] } },
      },
      select: { id: true },
    });
    const designIds = designs.map((design) => design.id);
    const assets = designIds.length
      ? await db().designAsset.findMany({
          where: { designId: { in: designIds } },
          select: { storageUrl: true, canvasPath: true },
        })
      : [];
    if (designIds.length) await db().design.deleteMany({ where: { id: { in: designIds } } });

    const paths = assets.flatMap((asset) =>
      [asset.storageUrl, asset.canvasPath].filter((path): path is string => Boolean(path)),
    );
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (paths.length && supabaseUrl && secret) {
      const supabase = createClient(supabaseUrl, secret, { auth: { persistSession: false } });
      await supabase.storage.from("customer-uploads").remove(paths);
    }

    for (const sessionId of cartSessions) {
      await db().cartItem.deleteMany({ where: { cart: { sessionId } } });
      await db().cart.deleteMany({ where: { sessionId } });
    }
    await db().wholesaleTier.deleteMany({ where: { note: TEST_NOTE } });
    await db().productVariant.updateMany({
      where: { product: { slug: { in: [ORNAMENT_SLUG, MINI_BOOK_SLUG] } } },
      data: { price: 0, stock: 100_000 },
    });
    await db().product.updateMany({
      where: { slug: { in: [ORNAMENT_SLUG, MINI_BOOK_SLUG] } },
      data: { isActive: false, basePrice: 0, physicalSpecs: Prisma.DbNull },
    });
  } finally {
    await disconnectDb();
  }
});

test("bola navideña: la escena 3D permite frente, canto, reverso y giro completo", async ({
  anonPage,
}, testInfo) => {
  test.slow();
  await anonPage.addInitScript(() => {
    for (const surface of ["default", "cards", "bookmarks", "strips", "calendar", "polaroid-ig"]) {
      window.localStorage.setItem(`lucams_studio_onboarded_${surface}`, "v1");
    }
  });
  await anonPage.goto(`/estudio/${ORNAMENT_SLUG}`, { waitUntil: "domcontentloaded" });
  await expect(anonPage.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
  await dismissCookieBanner(anonPage);
  const panel = await resolvePanel(anonPage);
  await panel.getByRole("radio", { name: /Nieve y estrellas/ }).click();
  await anonPage.keyboard.press("Escape");
  await anonPage.getByRole("button", { name: /Ver en tu espacio/i }).click();

  const dialog = anonPage.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  const sceneCanvas = dialog.locator("canvas").first();
  await expect(sceneCanvas).toBeVisible({ timeout: 30_000 });
  await anonPage.waitForTimeout(3000);
  const frontCapture = testInfo.outputPath("bola-navidena-frente.png");
  await dialog.screenshot({ path: frontCapture });
  await testInfo.attach("bola-navidena-frente", {
    path: frontCapture,
    contentType: "image/png",
  });
  const canvasBox = await sceneCanvas.boundingBox();
  if (!canvasBox) throw new Error("El lienzo 3D no tiene dimensiones.");
  const modelClip = {
    x: canvasBox.x + canvasBox.width * 0.22,
    y: canvasBox.y + canvasBox.height * 0.18,
    width: canvasBox.width * 0.56,
    height: canvasBox.height * 0.58,
  };
  const captureModel = () => anonPage.screenshot({ clip: modelClip });
  const frontModel = await captureModel();
  await dialog.getByRole("button", { name: "De perfil" }).click();
  await expect(dialog.getByRole("button", { name: "De perfil" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(async () => (await captureModel()).equals(frontModel), { timeout: 15_000 })
    .toBe(false);
  await anonPage.waitForTimeout(750);
  const edgeCapture = testInfo.outputPath("bola-navidena-canto.png");
  await dialog.screenshot({ path: edgeCapture });
  await testInfo.attach("bola-navidena-canto", {
    path: edgeCapture,
    contentType: "image/png",
  });
  const edgeModel = await captureModel();
  expect(edgeModel.equals(frontModel)).toBe(false);
  await dialog.getByRole("button", { name: "Reverso" }).click();
  await expect
    .poll(async () => (await captureModel()).equals(edgeModel), { timeout: 15_000 })
    .toBe(false);
  await dialog.getByRole("button", { name: "Dar una vuelta completa" }).click();

  const overflow = await anonPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await anonPage.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0, { timeout: 15_000 });
});

test("bola dúplex: A/B en una esfera, cara B obligatoria y arrastre táctil o mouse", async ({
  anonPage,
}) => {
  test.slow();
  const panel = await prepareOrnamentStudio(anonPage);
  const red = await sharp({
    create: { width: 1200, height: 1200, channels: 3, background: { r: 220, g: 20, b: 60 } },
  })
    .png()
    .toBuffer();
  const blue = await sharp({
    create: { width: 1200, height: 1200, channels: 3, background: { r: 30, g: 80, b: 220 } },
  })
    .png()
    .toBuffer();

  await uploadOrnamentFace(panel, { name: "cara-a.png", mimeType: "image/png", buffer: red }, 1);
  const preview = anonPage
    .getByRole("button", {
      name: /Ver diseño de tu pedido|Vista previa|Listo, generar diseño final/i,
    })
    .and(anonPage.locator(":visible"))
    .last();
  await expect(preview).toBeDisabled({ timeout: 20_000 });

  await uploadOrnamentFace(panel, { name: "cara-b.png", mimeType: "image/png", buffer: blue }, 2);
  await expect(preview).toBeEnabled({ timeout: 90_000 });
  await anonPage.keyboard.press("Escape");
  await anonPage.getByRole("button", { name: /Ver en tu espacio/i }).click();

  const dialog = anonPage.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByText("1 bola · foto plana de 8 cm")).toBeVisible();
  await expect(dialog.getByText("1 / 1", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Cara B pendiente")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "De perfil" })).toBeVisible();
  const sceneCanvas = dialog.locator("canvas").first();
  await expect(sceneCanvas).toBeVisible({ timeout: 30_000 });
  const canvasBox = await sceneCanvas.boundingBox();
  if (!canvasBox) throw new Error("El lienzo dúplex no tiene dimensiones.");
  const modelClip = {
    x: canvasBox.x + canvasBox.width * 0.22,
    y: canvasBox.y + canvasBox.height * 0.18,
    width: canvasBox.width * 0.56,
    height: canvasBox.height * 0.58,
  };
  const captureModel = () => anonPage.screenshot({ clip: modelClip });

  await expect
    .poll(
      async () => {
        const [r, g, b] = await centerColor(await captureModel());
        return r > g && r > b;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await dialog.getByRole("button", { name: "Reverso" }).click();
  await expect
    .poll(
      async () => {
        const [r, , b] = await centerColor(await captureModel());
        return b > r;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await dialog.getByRole("button", { name: "Frente" }).click();
  await expect
    .poll(
      async () => {
        const [r, g, b] = await centerColor(await captureModel());
        return r > g && r > b;
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  const beforeDrag = await captureModel();
  await dragOrnamentScene(anonPage, canvasBox);
  expect((await captureModel()).equals(beforeDrag)).toBe(false);
  await anonPage.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0, { timeout: 15_000 });

  await preview.click();
  const previewDialog = anonPage.getByRole("dialog");
  await expect(previewDialog).toBeVisible({ timeout: 60_000 });
  const qualityAck = previewDialog.getByRole("checkbox", {
    name: /Entiendo que estas fotos pueden imprimirse con menor calidad/i,
  });
  if (await qualityAck.count()) await qualityAck.check();
  await previewDialog
    .getByRole("button", { name: /agregar al carrito/i })
    .click({ timeout: 20_000 });
  await expect(anonPage).toHaveURL(/\/carrito/, { timeout: 180_000 });
  const sessionId = (await anonPage.context().cookies()).find(
    (cookie) => cookie.name === "cart_session",
  )?.value;
  expect(sessionId).toBeTruthy();
  cartSessions.add(sessionId!);

  const item = await db().cartItem.findFirstOrThrow({
    where: { cart: { sessionId }, variant: { product: { slug: ORNAMENT_SLUG } } },
    select: {
      qty: true,
      design: { select: { productionUrls: true, metadata: true, canvasData: true } },
    },
  });
  expect(item.qty).toBe(1);
  expect(item.design?.productionUrls).toHaveLength(2);
  expect(item.design?.metadata).not.toHaveProperty("faceStrips");
  const canvas = item.design?.canvasData as {
    unitCount: number;
    unitSlots: number;
    slots: Array<{ assetId?: string | null }>;
  };
  expect(canvas.unitCount).toBe(1);
  expect(canvas.unitSlots).toBe(2);
  expect(canvas.slots).toHaveLength(2);
  expect(canvas.slots.every((slot) => Boolean(slot.assetId))).toBe(true);
});

test("mini libros: 3 unidades, asistido, prediseñado, réplica y promoción por cantidad", async ({
  anonPage,
}) => {
  test.slow();
  await anonPage.addInitScript(() => {
    for (const surface of ["default", "cards", "bookmarks", "strips", "calendar", "polaroid-ig"]) {
      window.localStorage.setItem(`lucams_studio_onboarded_${surface}`, "v1");
    }
  });
  await anonPage.goto(`/estudio/${MINI_BOOK_SLUG}?variant=${miniBookVariantId}&copies=3`, {
    waitUntil: "domcontentloaded",
  });
  await expect(anonPage.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
  await dismissCookieBanner(anonPage);
  const panel = await resolvePanel(anonPage);
  await panel.getByRole("radio", { name: /Tu foto · Clásico · Grande/ }).click();

  await expect(panel.getByLabel("Título")).toBeVisible({ timeout: 20_000 });
  await panel.getByLabel("Título").fill("Nuestra historia");
  await panel.getByLabel("Autor o dedicatoria corta").fill("Con amor, Lucía");
  await panel.getByLabel("Mensaje para la contraportada").fill("Gracias por tantas páginas juntos");

  const galleryToggle = panel.locator('button[aria-controls="sidebar-predisenados-panel"]');
  if (await galleryToggle.count()) await galleryToggle.click();
  await panel.getByRole("searchbox", { name: "Buscar diseños prediseñados" }).fill("bosque");
  const design = panel.locator('button[aria-label*="Bosque Encantado"]').first();
  await expect(design).toBeVisible({ timeout: 30_000 });
  await design.click();

  await expect
    .poll(
      async () => {
        const draft = await db().design.findFirst({
          where: { productId: miniBookId, createdAt: { gte: runStartedAt } },
          select: { canvasData: true },
        });
        const canvas = draft?.canvasData as { slots?: Array<{ assetId?: string | null }> } | null;
        return Boolean(canvas?.slots?.[0]?.assetId);
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  await anonPage.keyboard.press("Escape");
  const replicate = anonPage
    .getByRole("button", {
      name: /Aplicar el diseño de esta unidad a todas las unidades|Aplicar este diseño a todas/i,
    })
    .first();
  await expect(replicate).toBeVisible({ timeout: 60_000 });
  await replicate.click();

  const preview = anonPage
    .getByRole("button", {
      name: /Ver diseño de tu pedido|Vista previa|Listo, generar diseño final/i,
    })
    .and(anonPage.locator(":visible"))
    .first();
  await expect(preview).toBeEnabled({ timeout: 90_000 });
  await preview.click();
  const dialog = anonPage.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await dialog.getByRole("button", { name: /agregar al carrito/i }).click();

  await expect(anonPage).toHaveURL(/\/carrito/, { timeout: 180_000 });
  const sessionId = (await anonPage.context().cookies()).find(
    (cookie) => cookie.name === "cart_session",
  )?.value;
  expect(sessionId).toBeTruthy();
  cartSessions.add(sessionId!);
  const cartItem = await db().cartItem.findFirstOrThrow({
    where: { cart: { sessionId }, variantId: miniBookVariantId },
    select: { qty: true, unitPrice: true, design: { select: { canvasData: true } } },
  });
  expect(cartItem.qty).toBe(1);
  expect(cartItem.unitPrice).toBe(3 * 1_200_000);
  const canvas = cartItem.design!.canvasData as {
    unitCount: number;
    unitSlots: number;
    slots: Array<{ textOverrides?: Record<string, { text?: string }> }>;
  };
  expect(canvas.unitCount).toBe(3);
  expect(canvas.unitSlots).toBe(1);
  for (const slot of canvas.slots) {
    expect(slot.textOverrides?.title?.text).toBe("Nuestra historia");
    expect(slot.textOverrides?.spine_title?.text).toBe("Nuestra historia");
  }
});

test("solicitud de diseño: contacto llega prellenado con producto y búsqueda", async ({
  anonPage,
}) => {
  await anonPage.goto(
    "/contacto?asunto=PERSONALIZACION&producto=mini-libros-magneticos&busqueda=Harry+Potter",
    { waitUntil: "domcontentloaded" },
  );
  await expect(anonPage.getByLabel("Asunto *")).toHaveValue("PERSONALIZACION");
  const message = anonPage.getByLabel("Mensaje *");
  await expect(message).toHaveValue(/mini-libros-magneticos/);
  await expect(message).toHaveValue(/Harry Potter/);
});
