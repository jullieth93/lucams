/*
 * POM — Centro de notificaciones admin (/admin/notificaciones).
 * Selectores verificados en app/admin/(panel)/notificaciones/page.tsx.
 */
import { expect, type Page } from "@playwright/test";

export class AdminNotificacionesPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/admin/notificaciones", { waitUntil: "domcontentloaded" });
  }

  async expectLoaded() {
    await expect(this.page.getByRole("link", { name: /No leídas|Todas/i }).first()).toBeVisible();
  }

  markAllReadButton() {
    return this.page.getByRole("button", { name: /Marcar todas como leídas/i });
  }
}
