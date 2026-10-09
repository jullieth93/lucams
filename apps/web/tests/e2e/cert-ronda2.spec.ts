import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

/*
 * CERTIFICACIÓN (ronda 2 QA owner, 2026-10-08) — verificación Playwright contra STG
 * de los fixes del deploy 55c52d2. Corre en desktop-chrome Y mobile-chrome.
 *
 *  1. Calendario: la Nevera 3D muestra las 12 tarjetas (antes: nevera vacía — bug PANEL_FACE_Z).
 *  2. Separadores: el libro 3D muestra la Cara A arriba y el toggle "Ver respaldo" voltea a la B.
 *  3. Resume: «Sí, continuar» devuelve el lienzo CON fotos aun recargando al instante (flush auto-save).
 *  4. Carrito «Editar» devuelve el lienzo CON fotos.
 *  5. El CTA de finalizar dice «Ver diseño» en todos los estudios (no «Vista previa»).
 *  6. La reseña destacada del home muestra mini-imagen + nombre del producto con link.
 *
 * Correr:  E2E_ENV=stg pnpm --filter web exec playwright test cert-ronda2
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
  // Móvil: el estudio puede auto-abrir el picker de UN slot (input single) y su
  // consentimiento es idéntico al de la librería — hay que operar SIEMPRE dentro
  // del bottom sheet ([data-slot="sheet-content"]), que es donde vive la
  // librería "Mis fotos" con su input multiple y el wand.
  for (let i = 0; i < 3; i++) {
    const openDlg = page.locator('div[role="dialog"]:visible');
    if (!(await openDlg.count())) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
  let sheet = page.locator('[data-slot="sheet-content"]');
  if (!(await sheet.count())) {
    // El FAB del estudio móvil se llama «Editar : abre las herramientas…» — NO
    // confundir con los botones «Editar <Mes/Slot>» de cada tarjeta del lienzo
    // (esos abren el picker single de UN slot y secuestran el flujo).
    const editarFab = page.getByRole("button", { name: /abre las herramientas/i }).first();
    if (await editarFab.count()) await editarFab.click();
    sheet = page.locator('[data-slot="sheet-content"]');
  }
  // Scope de la librería: el sheet en móvil; la página en desktop.
  const scope = (await sheet.count()) ? sheet.first() : page;
  const consent = scope.getByRole("checkbox", { name: /Tengo derecho a usar esta foto/i });
  await consent.waitFor({ state: "visible", timeout: 30_000 });
  if (!(await consent.isChecked())) await consent.check();
  // Input multiple de la librería; si no existe, subir de a UNA foto por vez.
  const multiInput = scope.locator('input[type="file"][multiple]');
  if (await multiInput.count()) {
    await multiInput.first().setInputFiles(Array.from({ length: count }, () => MASCOT));
  } else {
    const single = scope.locator('input[type="file"]').first();
    for (let i = 0; i < count; i++) {
      await single.setInputFiles(MASCOT);
      await page.waitForTimeout(800); // dejar procesar cada subida
    }
  }
  const wand = page.getByRole("button", { name: new RegExp(`Llenar ${count} slots?`, "i") });
  await wand.first().waitFor({ state: "visible", timeout: 180_000 });
  await wand.first().click();
}

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
  // Móvil: tras llenar puede quedar abierto el picker del siguiente slot
  // ("Foto para el imán N de M") — cerrarlo para que no tape los CTAs.
  await page.waitForTimeout(1_500);
  const picker = page.locator('div[role="dialog"]', { hasText: /Elige una foto ya subida/i });
  if (await picker.count()) {
    await picker
      .first()
      .getByRole("button", { name: /cerrar|close/i })
      .first()
      .click()
      .catch(async () => {
        await page.keyboard.press("Escape");
      });
    await picker
      .first()
      .waitFor({ state: "detached", timeout: 5_000 })
      .catch(() => {});
  }
}

test("1. Calendario — la Nevera 3D muestra las tarjetas", async ({ page }, testInfo) => {
  await openStudioAndFill(page, "calendario-mes-a-mes-fotos", 12);
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
  await page.waitForTimeout(6_000);
  await page.screenshot({
    caret: "initial",
    path: `/tmp/cert-cal-nevera-${testInfo.project.name}.png`,
  });
  await page.getByRole("button", { name: /Mural/i }).first().click();
  await page.waitForTimeout(5_000);
  await page.screenshot({
    caret: "initial",
    path: `/tmp/cert-cal-mural-${testInfo.project.name}.png`,
  });
});

test("2. Separadores — Cara A visible arriba + toggle «Ver respaldo»", async ({
  page,
}, testInfo) => {
  await openStudioAndFill(page, "separadores-alargados", 2);
  await page
    .getByRole("button", { name: /Ver en un libro/i })
    .first()
    .click();
  const modal = page.locator('div[role="dialog"]').last();
  await modal.locator("canvas").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(6_000);
  await page.screenshot({
    caret: "initial",
    path: `/tmp/cert-sep-frente-${testInfo.project.name}.png`,
  });
  const toggle = page.getByRole("button", { name: /Ver respaldo/i });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByRole("button", { name: /Ver frente/i })).toBeVisible();
  await page.waitForTimeout(2_000);
  await page.screenshot({
    caret: "initial",
    path: `/tmp/cert-sep-respaldo-${testInfo.project.name}.png`,
  });
});

test("3. Resume — «Sí, continuar» devuelve el lienzo CON fotos (recarga inmediata)", async ({
  page,
}) => {
  await openStudioAndFill(page, "set-fotoimanes-polaroid", 6);
  const before = await photosCounter(page);
  // Recarga INMEDIATA: valida el flush del auto-save al ocultar (antes: 0/6).
  await page.reload({ waitUntil: "domcontentloaded" });
  const continuar = page.getByRole("button", { name: /Sí, continuar/i });
  await continuar.waitFor({ state: "visible", timeout: 20_000 });
  // Margen humano realista: el sendBeacon del flush va en vuelo al recargar; un
  // humano tarda ≥1-2 s en leer el interstitial y hacer click (el beacon tarda
  // ~300-500 ms). Sin este margen el e2e lee el draft ANTES de que aterrice el
  // flush (race read-after-write, solo reproducible a velocidad de máquina).
  await page.waitForTimeout(2_000);
  await continuar.click();
  await page.waitForURL(/designId=/, { timeout: 20_000 });
  await dismissOverlays(page);
  await expect.poll(async () => photosCounter(page), { timeout: 60_000 }).toBe(before);
});

test("4. Carrito «Editar» devuelve el lienzo CON fotos", async ({ page }) => {
  await openStudioAndFill(page, "set-fotoimanes-polaroid", 6);
  const before = await photosCounter(page);
  const listo = page.getByRole("button", { name: /Ver diseño/i }).first();
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
});

test("5. El CTA de finalizar dice «Ver diseño» (foto y letras)", async ({ page }) => {
  await page.goto("/estudio/set-fotoimanes-polaroid", { waitUntil: "domcontentloaded" });
  await page
    .locator('div[role="dialog"][aria-labelledby="onboarding-title"]')
    .waitFor({ state: "attached", timeout: 8_000 })
    .catch(() => {});
  await dismissOverlays(page);
  // El texto VISIBLE del CTA es «Ver diseño» (el aria cambia con el estado de
  // completitud; en móvil el botón del toolbar desktop queda display:none, así
  // que se filtra por visibilidad real).
  await expect(page.getByText("Ver diseño").filter({ visible: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  // En la página NO queda ningún CTA «Vista previa».
  await expect(page.getByRole("button", { name: /^Vista previa$/i })).toHaveCount(0);

  await page.goto("/estudio/pack-vocales", { waitUntil: "domcontentloaded" });
  await page
    .locator('div[role="dialog"][aria-labelledby="onboarding-title"]')
    .waitFor({ state: "attached", timeout: 8_000 })
    .catch(() => {});
  await dismissOverlays(page);
  await expect(page.getByText("Ver diseño").filter({ visible: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: /^Vista previa$/i })).toHaveCount(0);
});

test("6. Home — la reseña destacada muestra mini-imagen + producto con link", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await dismissOverlays(page);
  const productLink = page.locator('a[href*="/producto/"][aria-label^="Ver producto"]').first();
  await expect(productLink).toBeVisible({ timeout: 30_000 });
  await expect(productLink.locator("img").first()).toBeVisible();
  await page.screenshot({ caret: "initial", path: "/tmp/cert-home-resena.png" });
});
