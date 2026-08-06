/*
 * POM — Carrito (/carrito).
 * Selectores verificados en catalog-mode.spec.ts.
 */
import { expect, type Page } from "@playwright/test";

export class CarritoPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/carrito", { waitUntil: "domcontentloaded" });
  }

  async expectItem(name: string) {
    // toPass: tolera el read-after-write del pooler (patrón compra/catalog-mode).
    await expect(async () => {
      await this.page.goto("/carrito");
      await expect(this.page.getByText(name).first()).toBeVisible();
    }).toPass({ timeout: 30_000 });
  }

  /** En modo catálogo el CTA es cotizar por WhatsApp (NO "Ir a pagar"). */
  quoteCta() {
    return this.page.getByRole("link", { name: /cotizar por whatsapp/i });
  }

  checkoutCta() {
    return this.page.getByRole("link", { name: /ir a pagar/i });
  }
}
