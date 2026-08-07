/*
 * POM — /checkout/pago en modo FULL: selector Wompi/COD, campo de cupón y
 * captura del redirect al hosted checkout de Wompi (sin navegar fuera — la
 * navegación a checkout.wompi.co se intercepta y se fulfill con HTML mock;
 * la URL capturada lleva reference/amount/firma de integridad para aserción).
 * Selectores verificados en pago/pay-button.tsx y pago/coupon-field.tsx.
 */
import { expect, type Page } from "@playwright/test";

export class CheckoutPagoPage {
  constructor(private readonly page: Page) {}

  async expectLoaded() {
    // 30s en la URL: dev server fresco compila la ruta en la primera visita.
    await expect(this.page).toHaveURL(/\/checkout\/pago/, { timeout: 30_000 });
    await expect(this.page.getByRole("button", { name: /pagar con wompi/i })).toBeVisible({
      timeout: 30_000,
    });
  }

  /** Espera el token de Turnstile (llaves de prueba fuera de PRD). */
  private async waitTurnstile() {
    await expect(async () => {
      const token = await this.page
        .locator('input[name="cf-turnstile-response"]')
        .last()
        .inputValue();
      expect(token.length).toBeGreaterThan(0);
    }).toPass({ timeout: 20_000 });
  }

  /**
   * Click en "Pagar con Wompi" SIN salir a internet: la navegación al hosted
   * checkout se intercepta y se responde con HTML mock. Devuelve la URL de
   * checkout.wompi.co que la app generó (con signature:integrity).
   */
  async payWithWompiCapture(): Promise<string> {
    await this.page.route("**/checkout.wompi.co/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><h1>Wompi hosted checkout (mock E2E)</h1></body></html>",
      });
    });
    await this.waitTurnstile();
    await this.page.getByRole("button", { name: /pagar con wompi/i }).click();
    await this.page.waitForURL(/checkout\.wompi\.co/, { timeout: 45_000 });
    const url = this.page.url();
    await this.page.unroute("**/checkout.wompi.co/**");
    return url;
  }

  /** Selecciona contraentrega y confirma → redirect a /pedido/<token>. */
  async payCodAndConfirm(): Promise<void> {
    await this.page.getByRole("radio", { name: /pago contraentrega/i }).click();
    await this.waitTurnstile();
    await this.page.getByRole("button", { name: /confirmar pedido \(pago al recibir\)/i }).click();
    await expect(this.page).toHaveURL(/\/pedido\/[a-f0-9]{32}\?nueva=1/, { timeout: 60_000 });
  }

  /** Aplica un cupón y devuelve el texto del feedback (role=alert o caja verde). */
  async applyCoupon(code: string): Promise<void> {
    await this.page.locator("#coupon-code").fill(code);
    await this.page.getByRole("button", { name: /^aplicar$/i }).click();
  }

  /** Error inmediato del campo cupón (estado 3 del CouponField). */
  couponError() {
    return this.page.locator("#coupon-error");
  }

  /** Caja verde de cupón aplicado (estado 1). */
  appliedCouponBox(code: string) {
    return this.page.getByText(new RegExp(code, "i"));
  }
}
