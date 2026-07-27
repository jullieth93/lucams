import { test, expect } from "@playwright/test";

test.describe("Ola 19 — Separadores de Libros", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const accept = page.getByRole("button", { name: /Aceptar todas/i });
    if (await accept.count()) await accept.first().click();
  });

  test("PDP Separadores Magnéticos: tamaño + stepper cantidad", async ({ page }) => {
    await page.goto("/producto/separadores-magneticos", { waitUntil: "domcontentloaded" });
    await page.getByText("2×6 cm", { exact: false }).first().waitFor({ timeout: 15_000 });
    await page.getByText("4×4.2 cm", { exact: false }).first().waitFor({ timeout: 5_000 });
    await page.getByText("4.000", { exact: false }).first().waitFor({ timeout: 5_000 });
    // No debe aparecer el grupo "Fotos" (photoSlots oculto).
    await expect(page.locator("text=/\\d+ fotos/i").first()).not.toBeVisible();
    await page.screenshot({ path: "/tmp/ola19-pdp-magneticos.png", fullPage: true });
  });

  test("PDP Separadores Alargados: tamaño + stepper cantidad", async ({ page }) => {
    await page.goto("/producto/separadores-alargados", { waitUntil: "domcontentloaded" });
    await page.getByText("4×12 cm", { exact: false }).first().waitFor({ timeout: 15_000 });
    await page.getByText("4×15 cm", { exact: false }).first().waitFor({ timeout: 5_000 });
    await page.getByText("4.000", { exact: false }).first().waitFor({ timeout: 5_000 });
    await page.screenshot({ path: "/tmp/ola19-pdp-alargados.png", fullPage: true });
  });

  test("Estudio Separadores Magnéticos carga con slots 1A / 1B", async ({ page }) => {
    await page.goto("/estudio/separadores-magneticos", { waitUntil: "domcontentloaded" });
    await page.locator("canvas").first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(3000);
    await page.getByText("1A", { exact: false }).first().waitFor({ timeout: 10_000 });
    await page.getByText("1B", { exact: false }).first().waitFor({ timeout: 10_000 });
    await page.screenshot({ path: "/tmp/ola19-estudio-magneticos.png", fullPage: true });
  });

  test("Estudio Separadores Alargados carga con slots 1A / 1B", async ({ page }) => {
    await page.goto("/estudio/separadores-alargados", { waitUntil: "domcontentloaded" });
    await page.locator("canvas").first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(3000);
    await page.getByText("1A", { exact: false }).first().waitFor({ timeout: 10_000 });
    await page.getByText("1B", { exact: false }).first().waitFor({ timeout: 10_000 });
    await page.screenshot({ path: "/tmp/ola19-estudio-alargados.png", fullPage: true });
  });
});
