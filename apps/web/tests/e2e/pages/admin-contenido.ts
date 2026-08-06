/*
 * POM — Contenido CMS admin (/admin/contenido).
 * Selectores verificados en release-check-a1.spec.ts y cms-editing-flow.spec.ts
 * (editor inline por página: fila <li> con el key, input[name="body"],
 * botones Guardar/Publicar, redirect ?published=1).
 */
import { expect, type Page } from "@playwright/test";

export class AdminContenidoPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/admin/contenido", { waitUntil: "domcontentloaded" });
  }

  /** Botón post-deploy: invalida el tag "cms" (scripts que escriben directo). */
  async refreshContentCache() {
    await this.page.getByRole("button", { name: /Actualizar caché de contenido/i }).click();
    await this.page.waitForURL(/cache=refreshed/, { timeout: 30_000 });
  }

  async gotoPageEditor(pageSlug: string) {
    await this.page.goto(`/admin/contenido/paginas/${pageSlug}`, {
      waitUntil: "domcontentloaded",
    });
    // Reload DURO tras la navegación SPA: si la sesión ya montó este editor
    // antes, React 19 reusa la instancia del FieldRow (useActionState) y un
    // fill() posterior puede no disparar onChange (Guardar queda disabled para
    // siempre — carrera reproducida 2026-08-06, diag3/diag5). Con carga
    // completa el árbol React nace limpio y el fill funciona siempre. Un admin
    // humano no la padece: el tipeo real sí despierta el estado (verificado).
    await this.page.reload({ waitUntil: "domcontentloaded" });
  }

  fieldRow(fieldKey: string) {
    return this.page.locator("li", { hasText: fieldKey }).first();
  }

  /**
   * Edita inline un campo del editor de página y publica el borrador
   * (flujo BLOCK: Guardar → "Borrador guardado" → Publicar → ?published=1).
   *
   * El input es controlado por React (field-row.tsx: Guardar se habilita solo
   * con isDirty). `fill()` es INTERMITENTE acá: tras navegación SPA/reload su
   * evento input sintético a veces no llega al onChange de React 19 y el botón
   * queda disabled para siempre (carrera reproducida 2026-08-06, diag3/4/5).
   * Las teclas reales (focus → select-all → borrar → pressSequentially) SIEMPRE
   * disparan onChange — verificado empíricamente en el estado roto. El toPass
   * cubre cualquier residual exigiendo el botón habilitado antes de clicar.
   */
  async editFieldAndPublish(pageSlug: string, fieldKey: string, newValue: string) {
    await this.gotoPageEditor(pageSlug);
    const row = this.fieldRow(fieldKey);
    await expect(row).toBeVisible({ timeout: 20_000 });
    const input = row.locator('input[name="body"]');
    const saveButton = row.getByRole("button", { name: /Guardar/i });
    await expect(async () => {
      await input.click({ timeout: 3_000 });
      await input.press("ControlOrMeta+a");
      await input.press("Backspace");
      await input.pressSequentially(newValue, { delay: 5 });
      await expect(input).toHaveValue(newValue, { timeout: 2_000 });
      await expect(saveButton).toBeEnabled({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    await saveButton.click();
    await expect(row.getByText(/Borrador guardado|ya se ve en el sitio/i)).toBeVisible({
      timeout: 30_000,
    });
    const publishButton = row.getByRole("button", { name: /Publicar/i });
    await expect(publishButton).toBeVisible({ timeout: 10_000 });
    await publishButton.click();
    await this.page.waitForURL(/published=1/, { timeout: 30_000 });
  }
}
