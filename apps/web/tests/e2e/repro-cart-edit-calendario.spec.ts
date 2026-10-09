import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

/*
 * REGRESIÓN (F1.1, plan maduración 2026-10) — editar un diseño desde el carrito y agregar
 * unidades debe completar el flujo sin "No pudimos guardar tus últimos cambios".
 * Nació como repro del bug reportado por el owner en STG (1 set de calendario → carrito →
 * «Editar» → +1 set → Vista Previa → error de guardado). El flujo feliz quedó blindado acá;
 * el fix estructural (reabrir READY→DRAFT cuando el finalize ya corrió en la misma sesión)
 * vive en features/personalization/{service,actions}.ts + studio-editor.tsx handleConfirmFinalize.
 *
 * El listener de Server Actions captura respuestas con código de error visible en el body
 * (VALIDATION / mensajes customer-safe) para diagnóstico si vuelve a fallar.
 *
 * Correr:  E2E_ENV=stg pnpm --filter web exec playwright test repro-cart-edit-calendario --project=desktop-chrome
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

async function fillEmptySlotsWithUploads(page: Page, count: number) {
  // Abrir el panel de fotos en mobile si hace falta (bottom sheet tras FAB «Editar»).
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
  if (await consent.isVisible().catch(() => false)) {
    if (!(await consent.isChecked())) await consent.check();
  }
  const dialogInput = page.locator(
    'div[role="dialog"] input[type="file"], [data-slot="sheet-content"] input[type="file"]',
  );
  const input = (await dialogInput.count())
    ? dialogInput.first()
    : page.locator('input[type="file"]').first();
  await input.setInputFiles(Array.from({ length: count }, () => MASCOT));
  // El wand rellena min(fotos PROCESADAS, slots vacíos) y su aria-label es
  // dinámico ("Llenar N slots…"): clickearlo antes de que las N fotos terminen
  // de procesarse llena solo una parte. Esperar a que ofrezca llenar TODOS los
  // slots vacíos (N = count) antes de clickear.
  const wand = page.getByRole("button", { name: new RegExp(`Llenar ${count} slots?`, "i") });
  await wand.first().waitFor({ state: "visible", timeout: 180_000 });
  await wand.first().click();
}

test("repro STG — editar set de calendario desde el carrito y agregar sets", async ({ page }) => {
  // ── Captura de Server Actions fallidas ──
  const actionFailures: string[] = [];
  page.on("response", async (res) => {
    if (res.request().method() !== "POST") return;
    if (!res.request().headers()["next-action"]) return;
    try {
      const body = await res.text();
      // Solo fallos reales de la action (el base64 de las signed URLs produce falsos
      // positivos con cualquier regex de substrings).
      if (/"ok":false|Demasiados intentos|guardando muy rápido/i.test(body)) {
        actionFailures.push(
          `POST ${res.url().slice(0, 120)} → ${res.status()} · ${body.slice(0, 400)}`,
        );
      }
    } catch {
      /* body no legible */
    }
  });

  // ── Paso 1: diseñar 1 set de calendario (12 fotos) y agregarlo al carrito ──
  await page.goto("/estudio/calendario-mes-a-mes-fotos", { waitUntil: "domcontentloaded" });
  await page
    .locator('div[role="dialog"][aria-labelledby="onboarding-title"]')
    .waitFor({ state: "attached", timeout: 8_000 })
    .catch(() => {});
  await dismissOverlays(page);
  const consent0 = page.getByRole("checkbox", { name: /Tengo derecho a usar esta foto/i });
  await consent0.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1_500);
  await fillEmptySlotsWithUploads(page, 12);
  await expect(page.getByText("12/12 fotos").filter({ visible: true }).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.keyboard.press("Escape");

  const listo = page.getByRole("button", { name: /Vista previa|Listo/i }).first();
  await expect(listo).toBeEnabled({ timeout: 30_000 });
  await listo.click();
  const agregar = page.getByRole("button", { name: /agregar al carrito/i }).first();
  await agregar.waitFor({ state: "visible", timeout: 30_000 });
  await agregar.click();
  await page.waitForURL(/\/carrito/, { timeout: 90_000 });

  // ── Paso 2: «Editar» desde el carrito (clon READY→DRAFT) ──
  const editar = page.getByRole("link", { name: /Editar/i }).first();
  await editar.waitFor({ state: "visible", timeout: 30_000 });
  await editar.click();
  await page.waitForURL(/\/estudio\/calendario-mes-a-mes-fotos\?designId=/, { timeout: 30_000 });
  await dismissOverlays(page);

  // ── Paso 3: subir a 2 sets y llenar los 12 slots nuevos ──
  const plus = page.getByRole("button", { name: /Aumentar unidades/i });
  await plus.waitFor({ state: "visible", timeout: 30_000 });
  await plus.click();
  await page.waitForTimeout(1_000); // dejar correr un auto-save intermedio
  await fillEmptySlotsWithUploads(page, 12);
  await expect(page.getByText("24/24 fotos").filter({ visible: true }).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.keyboard.press("Escape");
  // Esperar a que el auto-save (debounce 2s) procese el estado final.
  await page.waitForTimeout(4_000);

  // ── Paso 4: Vista Previa → confirmar (acá el owner ve el error) ──
  const listo2 = page.getByRole("button", { name: /Vista previa|Listo/i }).first();
  await expect(listo2).toBeEnabled({ timeout: 30_000 });
  await listo2.click();
  const confirmar = page.getByRole("button", { name: /agregar al carrito|actualizar/i }).first();
  await confirmar.waitFor({ state: "visible", timeout: 30_000 });
  await confirmar.click();

  const errorGuardar = page.getByText(/No pudimos guardar tus últimos cambios/i);
  const outcome = await Promise.race([
    page.waitForURL(/\/carrito/, { timeout: 90_000 }).then(() => "OK_REDIRECT_CARRITO" as const),
    errorGuardar
      .waitFor({ state: "visible", timeout: 90_000 })
      .then(() => "ERROR_GUARDAR" as const),
  ]);

  console.log(`\n=== RESULTADO REPRO: ${outcome} ===`);
  console.log(`=== Server Actions con error capturadas: ${actionFailures.length} ===`);
  for (const f of actionFailures.slice(0, 10)) console.log(`  ACTION_FAIL: ${f}`);
  await page.screenshot({ caret: "initial", path: "/tmp/repro-cart-edit-calendario.png" });

  // El bug existe mientras esto falle; al arreglarlo este expect queda como regresión.
  expect(outcome).toBe("OK_REDIRECT_CARRITO");
});
