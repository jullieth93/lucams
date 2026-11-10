import type { Locator, Page } from "@playwright/test";
import { db, disconnectDb } from "./fixtures/db";
import { dismissCookieBanner, E2E_ENV, expect, test } from "./fixtures/auth";
import { captureNewProductState, restoreNewProductState } from "./fixtures/product-state";

const ORNAMENT_SLUG = "bola-navidena-personalizada";
const MINI_BOOK_SLUG = "mini-libros-magneticos";
const runStartedAt = new Date();
let originalProductState: Awaited<ReturnType<typeof captureNewProductState>> = [];

test.skip(E2E_ENV !== "local", "La auditoría de nuevos productos activa datos solo en LOCAL.");
test.setTimeout(120_000);

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

async function prepareEditor(page: Page) {
  await page.addInitScript(() => {
    for (const surface of ["default", "cards", "bookmarks", "strips", "calendar", "polaroid-ig"]) {
      window.localStorage.setItem(`lucams_studio_onboarded_${surface}`, "v1");
    }
  });
  await dismissCookieBanner(page);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function captureModelCenter(page: Page, dialog: Locator) {
  const box = await dialog.locator("canvas").first().boundingBox();
  if (!box) throw new Error("El lienzo 3D no tiene dimensiones.");
  return page.screenshot({
    clip: {
      x: box.x + box.width * 0.22,
      y: box.y + box.height * 0.18,
      width: box.width * 0.56,
      height: box.height * 0.58,
    },
  });
}

test.beforeAll(async () => {
  originalProductState = await captureNewProductState();
  expect(originalProductState).toHaveLength(2);
  await db().product.updateMany({
    where: { slug: { in: [ORNAMENT_SLUG, MINI_BOOK_SLUG] }, deletedAt: null },
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
  await db().productVariant.updateMany({
    where: { product: { slug: { in: [ORNAMENT_SLUG, MINI_BOOK_SLUG] } } },
    data: { price: 1_500_000, stock: 100 },
  });
});

test.afterAll(async () => {
  try {
    await db().design.deleteMany({
      where: {
        createdAt: { gte: runStartedAt },
        product: { slug: { in: [ORNAMENT_SLUG, MINI_BOOK_SLUG] } },
      },
    });
    await restoreNewProductState(originalProductState);
  } finally {
    await disconnectDb();
  }
});

test("responsive bola navideña: PDP, Estudio y giro 3D", async ({ anonPage }) => {
  test.slow();
  await prepareEditor(anonPage);
  await anonPage.goto(`/producto/${ORNAMENT_SLUG}`, { waitUntil: "domcontentloaded" });
  await expect(anonPage.getByRole("heading", { name: /Bola Navideña Personalizada/i })).toBeVisible(
    {
      timeout: 30_000,
    },
  );
  await expectNoHorizontalOverflow(anonPage);

  await anonPage.goto(`/estudio/${ORNAMENT_SLUG}`, { waitUntil: "domcontentloaded" });
  await expect(anonPage.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
  await dismissCookieBanner(anonPage);
  const panel = await resolvePanel(anonPage);
  await panel.getByRole("radio", { name: /Foto circular/ }).click();
  await anonPage.keyboard.press("Escape");
  await anonPage.getByRole("button", { name: /Ver en tu espacio/i }).click();
  const dialog = anonPage.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await expect(dialog.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await dismissCookieBanner(anonPage);
  await dialog.getByRole("button", { name: "De perfil" }).click();
  await dialog.getByRole("button", { name: "Reverso" }).click();
  await expectNoHorizontalOverflow(anonPage);
  await anonPage.keyboard.press("Escape");
});

test("responsive mini libros: PDP, Estudio, carátula extendida y nevera", async ({ anonPage }) => {
  test.slow();
  await prepareEditor(anonPage);
  await anonPage.goto(`/producto/${MINI_BOOK_SLUG}`, { waitUntil: "domcontentloaded" });
  await expect(anonPage.getByRole("heading", { name: /Mini Libros Magnéticos/i })).toBeVisible({
    timeout: 30_000,
  });
  await expectNoHorizontalOverflow(anonPage);

  await anonPage.goto(`/estudio/${MINI_BOOK_SLUG}`, { waitUntil: "domcontentloaded" });
  await expect(anonPage.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
  await dismissCookieBanner(anonPage);
  const panel = await resolvePanel(anonPage);
  await panel.getByRole("radio", { name: /Tu foto · Clásico · Grande/ }).click();
  await anonPage.keyboard.press("Escape");
  await anonPage.getByRole("button", { name: /Ver en tu espacio/i }).click();
  const dialog = anonPage.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await expect(dialog.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await dismissCookieBanner(anonPage);
  await dialog.getByRole("button", { name: "Carátula extendida" }).click();
  await dialog.getByRole("button", { name: "Mini libro", exact: true }).click();
  await anonPage.waitForTimeout(1500);
  const frontModel = await captureModelCenter(anonPage, dialog);
  await dialog.getByRole("button", { name: "Ver reverso" }).click();
  await expect
    .poll(async () => (await captureModelCenter(anonPage, dialog)).equals(frontModel), {
      timeout: 15_000,
    })
    .toBe(false);
  await dialog.getByRole("button", { name: "Ver frente" }).click();
  await dialog.getByRole("button", { name: "En la nevera" }).click();
  await expectNoHorizontalOverflow(anonPage);
  await anonPage.keyboard.press("Escape");
});
