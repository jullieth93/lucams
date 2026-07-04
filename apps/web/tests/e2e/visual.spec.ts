/*
 * Regresión visual (Bloque E) — Playwright toHaveScreenshot nativo (sin deps).
 *
 * Solo páginas ESTÁTICAS (sin datos de DB) → baselines estables y deterministas.
 * Detecta alteraciones NO intencionales del look kawaii (paleta, tipografía,
 * layout) — clave tras el cambio de contraste AA. Overlays dinámicos (banner de
 * cookies, toasts) se enmascaran; las animaciones se desactivan.
 *
 * Baselines: `tests/e2e/visual.spec.ts-snapshots/*-linux.png` (versionadas).
 * Regenerar tras un cambio visual intencional: `playwright test visual --update-snapshots`.
 */

import { test, expect, type Page } from "@playwright/test";

const PAGES: Array<[string, string]> = [
  ["404", "/ruta-inexistente-para-el-404-xyz"],
  ["ayuda", "/ayuda"],
  ["legal-privacidad", "/legal/privacidad"],
  ["legal-terminos", "/legal/terminos"],
];

function dynamicMasks(page: Page) {
  return [
    page.locator('[aria-labelledby="cookies-banner-title"]'), // banner cookies (fixed bottom)
    page.locator('[aria-label*="Notifications" i]'), // toaster sonner
  ];
}

test.describe("regresión visual — páginas estáticas", () => {
  for (const [name, path] of PAGES) {
    test(name, async ({ page }) => {
      // next dev compila la ruta on-demand al primer hit; damos margen.
      test.slow();
      // "load" (NO "networkidle"): el reporter de Web Vitals mantiene conexiones
      // abiertas → networkidle nunca resuelve y el goto expira. toHaveScreenshot
      // reintenta hasta 2 capturas idénticas, así que la estabilidad la cubre él.
      await page.goto(path, { waitUntil: "load" });
      await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage: true,
        animations: "disabled",
        mask: dynamicMasks(page),
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});
