/*
 * POM — /checkout/envio en modo FULL: lista de cotizaciones Aveonline (live,
 * sandbox/test) selladas HMAC por el servidor. Selectores verificados en
 * envio/quote-list.tsx y envio/page.tsx.
 */
import { expect, type Page } from "@playwright/test";

export class CheckoutEnvioPage {
  constructor(private readonly page: Page) {}

  /**
   * La cotización es server-side contra Aveonline en vivo (puede tardar
   * >20 s; la página ofrece "Reintentar" si la API falla). Espera la lista
   * y devuelve el número de transportadoras ofertadas.
   */
  async expectQuotes(): Promise<number> {
    await expect(this.page).toHaveURL(/\/checkout\/envio/, { timeout: 30_000 });
    const firstRadio = this.page.locator('input[name="quoteId-radio"]').first();
    for (let attempt = 1; attempt <= 2; attempt++) {
      const visible = await firstRadio
        .waitFor({ state: "attached", timeout: 60_000 })
        .then(() => true)
        .catch(() => false);
      if (visible) break;
      const retry = this.page.getByRole("button", { name: /reintentar/i }).first();
      if (attempt < 2 && (await retry.isVisible().catch(() => false))) {
        await retry.click();
        continue;
      }
      throw new Error("La cotización de envío no produjo transportadoras (Aveonline).");
    }
    return this.page.locator('input[name="quoteId-radio"]').count();
  }

  /** Selecciona la primera oferta y continúa al paso de pago. */
  async selectFirstAndContinue() {
    await this.page.locator('input[name="quoteId-radio"]').first().check({ force: true });
    await this.page.getByRole("button", { name: /continuar al pago/i }).click();
    await expect(this.page).toHaveURL(/\/checkout\/pago/, { timeout: 30_000 });
  }

  /**
   * Adultera el hidden `fleteCop` (eco visual del seleccionado) antes de
   * enviar: el server action valida la selección contra el set sellado HMAC
   * → debe rebotar a /checkout/envio?error=… (nunca confiar en el cliente).
   */
  async tamperFleteCopAndSubmit() {
    await this.page.locator('input[name="fleteCop"]').evaluate((el) => {
      (el as HTMLInputElement).value = "1";
    });
    await this.page.getByRole("button", { name: /continuar al pago/i }).click();
    await expect(this.page).toHaveURL(/\/checkout\/envio\?.*error=/, { timeout: 30_000 });
  }
}
