/*
 * HOMOLOGACIÓN E2E — vistas 3D "Ver en tu espacio" (docs/TESTING.md): el modal 3D abre por producto elegible, escenas correctas por tipo
 * (fotoimanes: nevera/mural/repisa/regalo — separadores: libro), foco atrapado
 * dentro del dialog (WCAG APG) y cierre con Escape, sin desborde móvil.
 * Solo lectura — corre en LOCAL y STG × desktop/mobile.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { dismissCookieBanner, E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "La corrida de homologación es LOCAL/STG (PRD solo smoke read-only).");
test.setTimeout(240_000);

const run = newRunId("3d");

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };

test.afterAll(async () => {
  await disconnectDb();
});

async function openStudio(page: Page, slug: string) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("lucams_studio_onboarded", "v1");
    } catch {
      /* noop */
    }
  });
  await page.goto(`/estudio/${slug}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
  await dismissCookieBanner(page);
}

/** El foco queda ATRAPADO en el dialog: N Tabs y el activeElement siempre dentro. */
async function expectFocusTrapped(page: Page, tabs = 10) {
  for (let i = 0; i < tabs; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog ? dialog.contains(document.activeElement) : false;
    });
    expect(inside, `Tab ${i + 1}: el foco debe quedar dentro del dialog (APG)`).toBe(true);
  }
}

test("vistas 3D: modal abre por tipo de producto + escenas + foco atrapado + Esc cierra", async ({
  anonPage,
}, testInfo) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const shotsDir = resolve(EVIDENCE_DIR, "shots");
  mkdirSync(shotsDir, { recursive: true });
  const resultsPath = resolve(
    EVIDENCE_DIR,
    `results-${E2E_ENV}-${testInfo.project.name}-${run}.json`,
  );
  const steps: Step[] = [];
  const record = (step: string, ok: boolean, detail?: string, screenshot?: string) =>
    steps.push({ step, ok, detail, screenshot, at: new Date().toISOString() });
  const shot = async (page: Page, name: string) => {
    const path = resolve(shotsDir, `${E2E_ENV}-${testInfo.project.name}-${run}-${name}.png`);
    await page.screenshot({ path, fullPage: false });
    return path;
  };

  // Productos reales del ambiente: un foto-imán (escenas del hogar) y separadores (libro).
  const photoProduct = await db().product.findFirst({
    where: {
      personalizationKind: "PHOTO_PACK",
      isActive: true,
      deletedAt: null,
      slug: { not: "separadores-magneticos" },
    },
    select: { slug: true },
    orderBy: { createdAt: "asc" },
  });
  expect(photoProduct, "foto-imán activo del ambiente").not.toBeNull();

  try {
    // 1. Foto-imán → "Ver en tu espacio" → dialog con las 4 escenas del hogar.
    await openStudio(anonPage, photoProduct!.slug);
    await anonPage.getByRole("button", { name: /ver en tu espacio/i }).click();
    const dialog = anonPage.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    for (const scene of ["Nevera", "Mural", "Repisa", "Regalo"]) {
      await expect(
        dialog.getByRole("button", { name: new RegExp(scene, "i") }),
        `escena ${scene} disponible`,
      ).toBeVisible({ timeout: 15_000 });
    }
    record(
      "3d-gallery-scenes",
      true,
      "dialog con Nevera/Mural/Repisa/Regalo",
      await shot(anonPage, "1-3d-gallery"),
    );

    // Cambio de escena: Mural queda aria-pressed.
    await dialog.getByRole("button", { name: /mural/i }).click();
    await expect(dialog.getByRole("button", { name: /mural/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Foco atrapado dentro del dialog (APG) + cierre con Escape.
    await expectFocusTrapped(anonPage);
    await anonPage.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0, { timeout: 15_000 });
    record("3d-focus-trap-escape", true, "10 Tabs dentro del dialog + Esc cierra");

    // 2. Separadores → vista correcta por tipo: libro 3D directo (dialog con
    // el lienzo 3D, sin chips de escena — BookView3D).
    await openStudio(anonPage, "separadores-magneticos");
    await anonPage.getByRole("button", { name: /ver en un libro/i }).click();
    const bookDialog = anonPage.locator('[role="dialog"][aria-modal="true"]');
    await expect(bookDialog).toBeVisible({ timeout: 60_000 });
    await expect(bookDialog.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
    // Sin desborde móvil: el dialog cabe en el viewport actual.
    const overflow = await anonPage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth, "sin desborde horizontal").toBeLessThanOrEqual(
      overflow.clientWidth + 1,
    );
    await anonPage.keyboard.press("Escape");
    await expect(bookDialog).toHaveCount(0, { timeout: 15_000 });
    record(
      "3d-book-scene",
      true,
      "separadores → libro 3D con canvas + sin desborde + Esc cierra",
      await shot(anonPage, "2-3d-book"),
    );

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-3d",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          status: "pass",
          steps,
        },
        null,
        2,
      ),
    );
    console.log(`✓ evidencia 3D: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-3d",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          status: "fail",
          error: String(err),
          steps,
        },
        null,
        2,
      ),
    );
    throw err;
  }
});
