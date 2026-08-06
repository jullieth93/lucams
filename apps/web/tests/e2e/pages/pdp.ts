/*
 * POM — PDP (/producto/[slug]).
 * Selectores verificados en compra.spec.ts y catalog-mode.spec.ts.
 */
import { expect, type Page } from "@playwright/test";

export class PdpPage {
  constructor(
    private readonly page: Page,
    private readonly slug: string,
  ) {}

  async goto() {
    await this.page.goto(`/producto/${this.slug}`, { waitUntil: "domcontentloaded" });
    await expect(this.page).toHaveURL(new RegExp(`/producto/${this.slug}`));
    await expect(this.page.locator("h1").first()).toBeVisible();
  }

  /** CTA de producto NO personalizable. Redirect ?added=1 = insert confirmado. */
  async addToCart() {
    const btn = this.page.getByRole("button", { name: /añadir al carrito/i });
    await expect(btn).toBeVisible();
    await btn.click();
    await this.page.waitForURL(/[?&]added=1/, { timeout: 15_000 });
  }

  personalizeCta() {
    return this.page.getByRole("link", { name: /personalizar/i }).first();
  }
}
