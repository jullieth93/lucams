import { test } from "@playwright/test";

test.describe("Ola 17 — Alargados", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Banner de cookies: aceptar para que no tape clics.
    const accept = page.getByRole("button", { name: /Aceptar todas/i });
    if (await accept.count()) await accept.first().click();
  });

  test("PDP Alargados muestra variantes 4×15 y 4×12 cm a $4.000", async ({ page }) => {
    await page.goto("/producto/separadores-alargados", { waitUntil: "domcontentloaded" });
    // Convención de tallas: ancho×alto con "cm" al final (ej. "4×15 cm").
    await page.getByText("4×15", { exact: false }).first().waitFor({ timeout: 15_000 });
    await page.getByText("4×12", { exact: false }).first().waitFor({ timeout: 5_000 });
    await page.getByText("4.000", { exact: false }).first().waitFor({ timeout: 5_000 });
    await page.screenshot({ path: "/tmp/ola17-pdp-alargados.png", fullPage: true });
  });

  test("Estudio Alargados carga con plantilla Separador alargado", async ({ page }) => {
    await page.goto("/estudio/separadores-alargados", { waitUntil: "domcontentloaded" });
    await page.locator("canvas").first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "/tmp/ola17-estudio-alargados.png", fullPage: true });
  });

  test("Home muestra la categoría renombrada", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByText("Separadores de Libros (Marcapáginas)", { exact: false })
      .first()
      .waitFor({ timeout: 15_000 });
    await page.screenshot({ path: "/tmp/ola17-home.png", fullPage: true });
  });
});
