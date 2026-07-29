/*
 * Certificación visual del deploy preview de catalogo-whatsapp.
 * Corre contra PLAYWRIGHT_BASE_URL (Vercel preview). Si la variable
 * VERCEL_BYPASS_TOKEN está presente, la inyecta como header de protección.
 *
 * Uso:
 *   PLAYWRIGHT_BASE_URL=https://... VERCEL_BYPASS_TOKEN=xxx pnpm exec playwright test tests/e2e/preview-cert.spec.ts
 */
import { test, expect } from "@playwright/test";

const BYPASS = process.env.VERCEL_BYPASS_TOKEN;

if (BYPASS) {
  test.use({
    extraHTTPHeaders: {
      "x-vercel-protection-bypass": BYPASS,
    },
  });
}

test.describe("catalogo-whatsapp preview certification", () => {
  test("home muestra solo las 4 categorías reales", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /Calendarios Magnéticos/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Fotoimanes/i }).first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Separadores de Libros \(Marcapáginas\)/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Juegos y Aprendizaje/i }).first(),
    ).toBeVisible();
    await page.screenshot({ path: "/tmp/cert-home-desktop.png", fullPage: true });
  });

  test("mobile home limpia", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /Calendarios Magnéticos/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "/tmp/cert-home-mobile.png", fullPage: true });
  });

  test("estudio Polaroid carga sin 500", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("lucams_studio_onboarded", "v1");
      } catch {}
    });
    await page.goto("/estudio/set-fotoimanes-polaroid", { waitUntil: "domcontentloaded" });
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: "/tmp/cert-studio-polaroid.png", fullPage: false });
  });

  test("estudio Separadores carga sin 500", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("lucams_studio_onboarded", "v1");
      } catch {}
    });
    await page.goto("/estudio/separadores-magneticos", { waitUntil: "domcontentloaded" });
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: "/tmp/cert-studio-separadores.png", fullPage: false });
  });

  test("PDP de Polaroid carga", async ({ page }) => {
    await page.goto("/producto/set-fotoimanes-polaroid", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "/tmp/cert-pdp-polaroid.png", fullPage: true });
  });
});
