/*
 * POM — Dashboard admin (/admin/dashboard).
 * Selectores verificados en catalog-mode.spec.ts y release-check-a1.spec.ts.
 */
import { expect, type Page } from "@playwright/test";

export class AdminDashboardPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/admin/dashboard", { waitUntil: "domcontentloaded" });
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/admin\/dashboard/);
    await expect(this.page.getByRole("link", { name: "Cotizaciones" }).first()).toBeVisible();
  }

  /** Sin overflow horizontal en el viewport actual (regresión fix E2). */
  async expectNoHorizontalOverflow() {
    const metrics = await this.page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  }
}
