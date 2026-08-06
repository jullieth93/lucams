/*
 * POM — Home pública (/).
 * Selectores verificados en smoke.spec.ts y release-check-a1.spec.ts.
 */
import { expect, type Page } from "@playwright/test";

export class HomePage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/", { waitUntil: "domcontentloaded" });
  }

  /** El CTA de la sección de categorías (campo CMS home.categories.cta-all). */
  categoriesCta(text: string | RegExp) {
    return this.page.getByRole("link", { name: text }).first();
  }

  /** Texto visible en el body (fallback para copy CMS sin rol dedicado). */
  async expectBodyText(text: string, timeout = 30_000) {
    await expect(this.page.locator("body")).toContainText(text, { timeout });
  }

  async expectLoaded() {
    await expect(this.page).toHaveTitle(/./);
    await expect(this.page.getByRole("link", { name: /catálogo/i }).first()).toBeVisible();
  }
}
