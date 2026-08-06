/*
 * POM — Estudio de personalización (/estudio/[slug]).
 * Selectores verificados en preview-cert.spec.ts.
 */
import { expect, type Page } from "@playwright/test";

export class EstudioPage {
  constructor(
    private readonly page: Page,
    private readonly slug: string,
  ) {}

  async goto() {
    // Evita el modal de onboarding del estudio (precedente: preview-cert.spec).
    await this.page.addInitScript(() => {
      try {
        window.localStorage.setItem("lucams_studio_onboarded", "v1");
      } catch {
        /* noop */
      }
    });
    await this.page.goto(`/estudio/${this.slug}`, { waitUntil: "domcontentloaded" });
  }

  async expectCanvas(timeout = 30_000) {
    await expect(this.page.locator("canvas").first()).toBeVisible({ timeout });
  }
}
