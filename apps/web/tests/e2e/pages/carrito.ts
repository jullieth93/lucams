/*
 * POM — Carrito (/carrito).
 * Selectores del flujo transaccional.
 */
import { expect, type Page } from "@playwright/test";

export class CarritoPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/carrito", { waitUntil: "domcontentloaded" });
  }

  async expectItem(name: string) {
    // toPass: tolera el read-after-write del pooler.
    await expect(async () => {
      await this.page.goto("/carrito");
      await expect(this.page.getByText(name).first()).toBeVisible();
    }).toPass({ timeout: 30_000 });
  }

  checkoutCta() {
    return this.page.getByRole("link", { name: /ir a pagar/i });
  }
}
