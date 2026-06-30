/*
 * Smoke E2E — recorrido del happy path básico del storefront público.
 *
 * Valida que las páginas críticas cargan sin errores 500 y renderean
 * los elementos clave esperados. NO testea funcionalidad profunda;
 * cada feature complex tiene su propio spec.
 *
 * En CI se ejecuta con `PLAYWRIGHT_BASE_URL` apuntando a Vercel preview.
 * Localmente, playwright.config levanta `next dev` automáticamente.
 */

import { test, expect } from "@playwright/test";

test.describe("storefront smoke", () => {
  test("home loads with logo + hero CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Lucams_shop/);
    await expect(page.getByRole("link", { name: /catálogo/i }).first()).toBeVisible();
  });

  test("/productos lists at least one product OR empty state", async ({ page }) => {
    await page.goto("/productos");
    // Espera "X productos encontrados" o el empty state
    await expect(
      page.getByText(/productos? encontrados?|sin productos|no encontramos/i),
    ).toBeVisible();
  });

  test("/ayuda renders FAQ accordion", async ({ page }) => {
    await page.goto("/ayuda");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Al menos una pregunta debe existir
    await expect(page.locator("details").first()).toBeVisible();
  });

  test("/contacto renders the form", async ({ page }) => {
    await page.goto("/contacto");
    await expect(page.getByLabel(/tu nombre/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /enviar/i })).toBeVisible();
  });

  test("/legal/privacidad renders content", async ({ page }) => {
    await page.goto("/legal/privacidad");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // .first(): la página cita "Ley 1581" varias veces (strict mode si no).
    await expect(page.getByText(/Ley 1581/i).first()).toBeVisible();
  });

  test("/status reports services", async ({ page }) => {
    await page.goto("/status");
    await expect(page.getByText(/operativos|problemas|verificando/i)).toBeVisible();
  });

  test("/api/health returns ok JSON", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.ok()).toBeTruthy();
  });

  test("sitemap.xml contains products and legal pages", async ({ request }) => {
    const r = await request.get("/sitemap.xml");
    expect(r.ok()).toBeTruthy();
    const body = await r.text();
    expect(body).toContain("/legal/privacidad");
    expect(body).toContain("/productos");
  });

  test("robots.txt blocks /admin", async ({ request }) => {
    const r = await request.get("/robots.txt");
    expect(r.ok()).toBeTruthy();
    const body = await r.text();
    expect(body.toLowerCase()).toContain("disallow: /admin");
  });
});
