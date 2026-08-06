/*
 * POM — Catálogo público (/productos).
 * Selectores verificados en smoke.spec.ts y catalog-mode.spec.ts.
 */
import { expect, type Page } from "@playwright/test";

export class CatalogoPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/productos", { waitUntil: "domcontentloaded" });
  }

  async expectLoaded() {
    await expect(this.page.locator("h1").first()).toBeVisible();
    await expect(
      this.page.getByText(/productos? encontrados?|sin productos|no encontramos/i),
    ).toBeVisible();
  }
}
