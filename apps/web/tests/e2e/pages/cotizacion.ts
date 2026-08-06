/*
 * POM — Formulario de cotización (/checkout/datos en modo catálogo).
 * Selectores verificados en catalog-mode.spec.ts y quote-form.tsx.
 */
import { expect, type Page } from "@playwright/test";

export type QuoteFormData = {
  name: string;
  /** 10 dígitos sin espacios (el display los auto-formatea). */
  whatsapp: string;
  email: string;
  notes?: string;
};

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

  /**
   * Llena el form completo: datos + depto/ciudad (primeras opciones reales del
   * catálogo DANE) + consentimiento Ley 1581 + espera el token de Turnstile
   * (llaves de prueba fuera de PRD: el widget emite token siempre).
   *
   * El form es client component con inputs CONTROLADOS (whatsapp/department/
   * city viajan en hidden inputs alimentados por estado React). Un fill que
   * cae antes de la hidratación se revierte en silencio y el submit muere en
   * Zod ("Revisa los campos marcados") — carrera reproducida 2026-08-06. Por
   * eso el llenado va en un toPass que exige los EFECTOS React (hidden con
   * valor, checkbox marcado): si la hidratación se comió un fill, el retry
   * lo repone ya hidratado.
   */
  async fill(data: QuoteFormData) {
    const whatsappDisplay = this.page.locator("#whatsapp-display");
    const consent = this.page.locator('input[name="dataConsent"]');
    await expect(async () => {
      await this.page.locator('input[name="customerName"]').fill(data.name);
      await whatsappDisplay.fill(data.whatsapp);
      await this.page.locator('input[name="customerEmail"]').fill(data.email);
      await this.page.locator("#deptCode").selectOption({ index: 1 });
      await this.page.locator("#cityCode").selectOption({ index: 1 });
      if (data.notes) await this.page.locator('textarea[name="notes"]').fill(data.notes);
      await consent.check();
      // Efectos React que prueban que los onChange ya corrieron:
      await expect(this.page.locator('input[name="customerWhatsapp"]')).toHaveValue(data.whatsapp, {
        timeout: 1_500,
      });
      await expect(this.page.locator('input[name="department"]')).not.toHaveValue("", {
        timeout: 1_500,
      });
      await expect(this.page.locator('input[name="city"]')).not.toHaveValue("", {
        timeout: 1_500,
      });
      await expect(consent).toBeChecked({ timeout: 1_500 });
    }).toPass({ timeout: 30_000 });
    // Turnstile: el widget escribe el token en el hidden cuando lo emite.
    await expect(async () => {
      const token = await this.page.locator('input[name="cf-turnstile-response"]').inputValue();
      expect(token.length).toBeGreaterThan(0);
    }).toPass({ timeout: 20_000 });
  }

  /**
   * Submit y espera el redirect a la confirmación por token. Si la acción
   * devuelve error de validación/servidor, falla RUIDOSO con el mensaje real
   * (nunca un timeout opaco de waitForURL).
   */
  async submitAndWaitConfirmation(): Promise<string> {
    await this.submitButton().click();
    const errorLocator = this.page
      .getByText(
        /Revisa los campos marcados|autorizar el tratamiento|anti-bot|varias cotizaciones|No pudimos crear|carrito está vacío/i,
      )
      .first();
    const outcome = await Promise.race([
      this.page
        .waitForURL(/\/cotizacion\/[a-f0-9]{32}/, { timeout: 30_000 })
        .then(() => "ok" as const),
      errorLocator.waitFor({ state: "visible", timeout: 30_000 }).then(() => "error" as const),
    ]);
    if (outcome === "error") {
      const details = await this.page.locator(".text-rose-600, [role='alert']").allInnerTexts();
      throw new Error(
        `createQuoteAction devolvió error: ${(await errorLocator.innerText()).trim()} ` +
          `| campos: ${details.join(" | ") || "(sin detalle por campo)"}`,
      );
    }
    return this.page.url().split("/cotizacion/")[1]!;
  }

  submitButton() {
    return this.page.getByRole("button", { name: /pedir cotización/i });
  }
}
