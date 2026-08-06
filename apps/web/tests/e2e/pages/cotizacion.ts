/*
 * POM — Formulario de cotización (/checkout/datos en modo catálogo).
 * Selectores verificados en catalog-mode.spec.ts (nombres reales del form que
 * espera createQuoteAction).
 */
import { expect, type Page } from "@playwright/test";

export class CotizacionPage {
  constructor(private readonly page: Page) {}

  async expectLoaded() {
    await expect(async () => {
      await expect(this.page).toHaveURL(/\/checkout\/datos/);
      await expect(this.page.getByText(/pide tu cotización/i)).toBeVisible();
    }).toPass({ timeout: 30_000 });
    await expect(this.page.locator('input[name="customerName"]')).toBeVisible();
    await expect(this.page.locator("#whatsapp-display")).toBeVisible();
    await expect(this.page.locator('input[name="customerEmail"]')).toBeVisible();
    await expect(this.page.locator("#deptCode")).toBeVisible();
    await expect(this.page.locator('textarea[name="notes"]')).toBeVisible();
  }

  submitButton() {
    return this.page.getByRole("button", { name: /pedir cotización/i });
  }
}
