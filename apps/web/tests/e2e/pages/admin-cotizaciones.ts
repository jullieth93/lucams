/*
 * POM — Cotizaciones admin (/admin/cotizaciones).
 * Selectores verificados en catalog-mode.spec.ts.
 */
import { expect, type Page } from "@playwright/test";

export class AdminCotizacionesPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/admin/cotizaciones", { waitUntil: "domcontentloaded" });
  }

  async expectLoaded() {
    await expect(this.page.getByRole("heading", { name: "Cotizaciones" })).toBeVisible();
    await expect(this.page.locator('input[name="q"]')).toBeVisible();
    await expect(this.page.locator('select[name="status"]')).toBeVisible();
  }
}
