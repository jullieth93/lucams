import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

/*
 * DIAGNÓSTICO VISUAL (ronda 2 QA owner, 2026-10-08) — evidencia Playwright contra STG
 * para los hallazgos reportados tras el deploy de maduración:
 *
 *  1. Calendario: 3D Nevera sale VACÍA (Mural sí carga) + tarjetas del Mural "muy gruesas".
 *  2. Separadores Largos: en el libro 3D no se puede ver la Cara B.
 *  3. "Continuar donde quedaste": en algunos productos el lienzo vuelve VACÍO (calendario OK).
 *  4. Carrito «Editar» en DESKTOP carga el lienzo vacío (en móvil sí carga).
 *
 * Cada test deja screenshots en /tmp/diag-*.png y aserciones de estado del lienzo.
 *
 * Correr:  E2E_ENV=stg pnpm --filter web exec playwright test diag-ronda2 --project=desktop-chrome
 */

const MASCOT = path.resolve(__dirname, "../../public/brand/lucams-mascot.png");

test.setTimeout(420_000);

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
}

async function fillAllSlots(page: Page, count: number) {
  const editarFab = page.getByRole("button", { name: /^Editar/i }).first();
  if (
    (await editarFab.count()) &&
    !(await page
      .getByRole("checkbox", { name: /Tengo derecho a usar esta foto/i })
      .isVisible()
      .catch(() => false))
  ) {
    await editarFab.click();
  }
  const consent = page.getByRole("checkbox", { name: /Tengo derecho a usar esta foto/i });
  await consent.waitFor({ state: "visible", timeout: 30_000 });
  if (!(await consent.isChecked())) await consent.check();
  const dialogInput = page.locator(
    'div[role="dialog"] input[type="file"], [data-slot="sheet-content"] input[type="file"]',
  );
  const input = (await dialogInput.count())
    ? dialogInput.first()
    : page.locator('input[type="file"]').first();
  await input.setInputFiles(Array.from({ length: count }, () => MASCOT));
  const wand = page.getByRole("button", { name: new RegExp(`Llenar ${count} slots?`, "i") });
  await wand.first().waitFor({ state: "visible", timeout: 180_000 });
  await wand.first().click();
}

/** Texto del contador "N/M fotos" visible en el header del estudio. */
async function photosCounter(page: Page): Promise<string> {
  const el = page
    .getByText(/\d+\/\d+ fotos/)
    .filter({ visible: true })
    .first();
  return (await el.textContent().catch(() => ""))?.trim() ?? "";
}

async function openStudioAndFill(page: Page, slug: string, count: number) {
  await page.goto(`/estudio/${slug}`, { waitUntil: "domcontentloaded" });
  await page
    .locator('div[role="dialog"][aria-labelledby="onboarding-title"]')
    .waitFor({ state: "attached", timeout: 8_000 })
    .catch(() => {});
  await dismissOverlays(page);
  await fillAllSlots(page, count);
  await expect(
    page.getByText(`${count}/${count} fotos`).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");
}

test("1. Calendario — 3D Nevera y Mural (nevera vacía? grosor?)", async ({ page }) => {
  await openStudioAndFill(page, "calendario-mes-a-mes-fotos", 12);
  // Para calendario la galería de escenas vive DENTRO del visor «Ver mi calendario».
  await page
    .getByRole("button", { name: /Ver mi calendario/i })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Míralo en tu espacio/i })
    .first()
    .click();
  const modal = page.locator('div[role="dialog"]').last();
  await page
    .getByRole("button", { name: /Nevera/i })
    .first()
    .click();
  await modal.locator("canvas").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(6_000); // settle WebGL + texturas
  await page.screenshot({ caret: "initial", path: "/tmp/diag-cal-nevera.png" });
  await page.getByRole("button", { name: /Mural/i }).first().click();
  await page.waitForTimeout(5_000);
  await page.screenshot({ caret: "initial", path: "/tmp/diag-cal-mural.png" });
});

test("2. Separadores Largos — libro 3D (¿se ve la Cara B?)", async ({ page }) => {
  // Boot por defecto: 1 separador × 2 caras = 2 slots.
  await openStudioAndFill(page, "separadores-alargados", 2);
  await page
    .getByRole("button", { name: /Ver en un libro/i })
    .first()
    .click();
  const modal = page.locator('div[role="dialog"]').last();
  await modal.locator("canvas").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(6_000);
  await page.screenshot({ caret: "initial", path: "/tmp/diag-sep-libro-1.png" });
  // Órbita con drag para intentar ver el respaldo.
  const canvas = modal.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.15, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(2_000);
  }
  await page.screenshot({ caret: "initial", path: "/tmp/diag-sep-libro-2.png" });
});

test("3. Resume — «Sí, continuar» debe devolver el lienzo CON fotos (polaroid)", async ({
  page,
}) => {
  await openStudioAndFill(page, "set-fotoimanes-polaroid", 6);
  const before = await photosCounter(page);
  // Recarga INMEDIATA (sin esperar el debounce de 2 s): valida el flush del
  // auto-save al ocultar la página (fix ronda 2 — antes volvía 0/6).
  await page.reload({ waitUntil: "domcontentloaded" });
  const continuar = page.getByRole("button", { name: /Sí, continuar/i });
  await continuar.waitFor({ state: "visible", timeout: 20_000 });
  await continuar.click();
  await page.waitForURL(/designId=/, { timeout: 20_000 });
  await dismissOverlays(page);
  // El lienzo debe hidratar con las fotos del draft (no vacío).
  await expect.poll(async () => photosCounter(page), { timeout: 60_000 }).toBe(before);
  await page.screenshot({ caret: "initial", path: "/tmp/diag-resume-polaroid.png" });
});

test("4. Carrito «Editar» en DESKTOP devuelve el lienzo CON fotos (polaroid)", async ({ page }) => {
  await openStudioAndFill(page, "set-fotoimanes-polaroid", 6);
  const before = await photosCounter(page);
  const listo = page.getByRole("button", { name: /Vista previa|Ver diseño|Listo/i }).first();
  await expect(listo).toBeEnabled({ timeout: 30_000 });
  await listo.click();
  const agregar = page.getByRole("button", { name: /agregar al carrito/i }).first();
  await agregar.waitFor({ state: "visible", timeout: 30_000 });
  await agregar.click();
  await page.waitForURL(/\/carrito/, { timeout: 90_000 });
  await page
    .getByRole("link", { name: /Editar/i })
    .first()
    .click();
  await page.waitForURL(/\/estudio\/set-fotoimanes-polaroid\?designId=/, { timeout: 30_000 });
  await dismissOverlays(page);
  await expect.poll(async () => photosCounter(page), { timeout: 60_000 }).toBe(before);
  await page.screenshot({ caret: "initial", path: "/tmp/diag-cart-edit-desktop.png" });
});
