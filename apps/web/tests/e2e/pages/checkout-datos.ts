/*
 * POM — /checkout/datos en modo FULL (Etapa 2): formulario de contacto +
 * dirección estructurada. Selectores verificados en datos-form.tsx y en el
 * flujo live de wompi-sandbox.spec.ts. En modo catálogo esta página renderiza
 * el QuoteForm — este POM solo aplica a full (ver pages/cotizacion.ts para
 * catálogo).
 */
import { expect, type Page } from "@playwright/test";

export type DatosFormData = {
  /** Solo letras (ContactSchema rechaza dígitos). */
  fullName: string;
  email: string;
  /** Móvil CO de 10 dígitos empezando en 3 (sin espacios). */
  phone: string;
};

export class CheckoutDatosPage {
  constructor(private readonly page: Page) {}

  async expectLoaded() {
    // 30s: la primera visita a /checkout/datos en un dev server fresco compila
    // la ruta (flake reproducido 2026-08-07: 5s no bastaban y el test moría
    // parado en /carrito).
    await expect(this.page).toHaveURL(/\/checkout\/datos/, { timeout: 30_000 });
    await expect(this.page.locator("#fullName")).toBeVisible({ timeout: 20_000 });
  }

  /**
   * Llena contacto + dirección urbana (primera opción real del catálogo DANE)
   * + consentimiento Ley 1581 y continúa a /checkout/envio. Inputs controlados:
   * el toPass exige los EFECTOS React (hidden phone/department/city con valor)
   * — un fill que cae antes de la hidratación se revierte en silencio (misma
   * carrera documentada en pages/cotizacion.ts, 2026-08-06).
   */
  async fillAndContinue(data: DatosFormData) {
    const dept = this.page.locator("#deptCode");
    const city = this.page.locator("#cityCode");
    await expect(async () => {
      await this.page.locator("#fullName").fill(data.fullName);
      await this.page.locator("#email").fill(data.email);
      await this.page.locator("#phone-display").fill(data.phone);
      await dept.selectOption({ index: 1 });
      // Las ciudades cargan tras elegir departamento (select dependiente).
      await expect(city.locator("option").nth(1)).toBeAttached({ timeout: 5_000 });
      await city.selectOption({ index: 1 });
      // Tipo de dirección (requerido): Urbana — habilita los campos de vía.
      await this.page.getByText("Urbana", { exact: false }).first().click();
      await this.page.locator('input[name="viaNumber"]').fill("10");
      await this.page.locator('input[name="cruceNumber"]').fill("15-20");
      const zip = this.page.locator("#zip");
      if (await zip.isVisible().catch(() => false)) await zip.fill("050001");
      await this.page.locator('input[name="dataConsent"]').check();
      // Efectos React que prueban que los onChange ya corrieron (los campos de
      // vía también: un retry puede remontarlos al elegir "Urbana" y vaciarlos
      // — flake reproducido 2026-08-07 en desktop).
      await expect(this.page.locator('input[name="phone"]')).toHaveValue(data.phone, {
        timeout: 1_500,
      });
      await expect(this.page.locator('input[name="department"]')).not.toHaveValue("", {
        timeout: 1_500,
      });
      await expect(this.page.locator('input[name="city"]')).not.toHaveValue("", { timeout: 1_500 });
      await expect(this.page.locator('input[name="viaNumber"]')).toHaveValue("10", {
        timeout: 1_500,
      });
      await expect(this.page.locator('input[name="cruceNumber"]')).toHaveValue("15-20", {
        timeout: 1_500,
      });
      await expect(this.page.locator('input[name="dataConsent"]')).toBeChecked({ timeout: 1_500 });
    }).toPass({ timeout: 30_000 });
    await this.page.getByRole("button", { name: /continuar al envío/i }).click();
  }
}
