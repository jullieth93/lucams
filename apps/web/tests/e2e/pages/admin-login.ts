/*
 * POM — Login admin (/admin/login).
 * Selectores verificados en admin-mfa.spec.ts y catalog-mode.spec.ts.
 */
import { type Page } from "@playwright/test";

export class AdminLoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  }

  /** Login con admin SIN MFA → entra directo al dashboard. */
  async login(email: string, password: string) {
    await this.page.locator('input[name="email"]').fill(email);
    await this.page.locator('input[name="password"]').fill(password);
    await this.page.getByRole("button", { name: /iniciar sesión/i }).click();
    await this.page.waitForURL(/\/admin\/dashboard/, { timeout: 20_000 });
  }

  /** Login con admin CON MFA → redirige al reto TOTP. */
  async loginToMfa(email: string, password: string) {
    await this.page.locator('input[name="email"]').fill(email);
    await this.page.locator('input[name="password"]').fill(password);
    await this.page.getByRole("button", { name: /iniciar sesión/i }).click();
    await this.page.waitForURL(/\/admin\/login\/mfa/, { timeout: 20_000 });
  }
}
