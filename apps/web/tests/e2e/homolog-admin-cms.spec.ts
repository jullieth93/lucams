/*
 * HOMOLOGACIÓN E2E — integración admin→cliente (CMS), spec de certificación
 * de la suite de homologación (docs/TESTING.md):
 *
 *   el admin edita `home.categories.cta-all` por la UI de /admin/contenido →
 *   el cliente lo ve en la home → revertir → el original vuelve a ser visible.
 *
 * Corre en LOCAL y STG (E2E_ENV) × desktop-chrome (1280×800) y mobile-chrome
 * (390×844). En PRD está PROHIBIDO (mutación) — el skip de abajo lo garantiza
 * aunque alguien lo invoque a mano.
 *
 * CERO hardcoding: el texto original se LEE de la DB del ambiente (la versión
 * publicada viva), no de una constante. La variante lleva el RUN de la corrida
 * → la red de seguridad del global.teardown la reconoce y revierte si el spec
 * muere a mitad.
 *
 * Auth: storageState del global.setup (E2E_AUTH=1). El cliente de las
 * verificaciones es ANÓNIMO (anonPage: contexto fresco sin cookies de admin).
 *
 * Evidencia: JSON por corrida + screenshots en apps/web/tmp/e2e-homologacion/
 * (gitignored), con los valores de DB y las URLs verificadas en cada paso.
 *
 * Concurrencia: la homologación corre con workers=1 (default local del config)
 * porque desktop y mobile editan el MISMO campo CMS. No meter este spec en un
 * gate con workers>1 sin antes serializar por ambiente.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { authStatePath, baseUrlFor, extraHeadersFor } from "./_setup/env";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb, getCmsFieldState } from "./fixtures/db";
import { newRunId } from "./fixtures/run";
import { AdminContenidoPage } from "./pages/admin-contenido";
import { HomePage } from "./pages/home";

const FIELD_KEY = "home.categories.cta-all";
const PAGE_SLUG = "inicio";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(
  E2E_ENV === "prd",
  "La homologación con mutación CMS está prohibida en PRD (solo lectura).",
);

test.setTimeout(180_000);

const run = newRunId("cms");
const guardPath = resolve(EVIDENCE_DIR, `cms-guard-${E2E_ENV}-${run}.json`);

type CmsGuard = {
  original: { body: string; publishedVersionId: string | null; isPublished: boolean };
};

type Step = {
  step: string;
  ok: boolean;
  detail?: string;
  screenshot?: string;
  at: string;
};
const steps: Step[] = [];
function record(step: string, ok: boolean, detail?: string, screenshot?: string) {
  steps.push({ step, ok, detail, screenshot, at: new Date().toISOString() });
}

test.afterAll(async ({ browser }) => {
  // Reversión garantizada si el test murió con la variante publicada
  // (precedente: afterAll de release-check-a1.spec.ts). Acá la restauración es
  // por DB (el guard file tiene el estado publicado original) + invalidación
  // de la caché del storefront por el botón del admin (el update directo por
  // DB no dispara revalidateTag). El global.teardown repite la misma red por
  // si este proceso ni siquiera llegó al afterAll.
  try {
    if (existsSync(guardPath)) {
      const state = await getCmsFieldState(FIELD_KEY);
      if (state?.publishedBody?.includes(run)) {
        const guard = JSON.parse(readFileSync(guardPath, "utf8")) as CmsGuard;
        await db().cmsField.update({
          where: { key: FIELD_KEY },
          data: {
            body: guard.original.body,
            isPublished: guard.original.isPublished,
            publishedVersionId: guard.original.publishedVersionId,
            updatedBy: "e2e-afterAll",
          },
        });
        console.warn(
          `[homolog-cms] ⚠️ el test murió con la variante publicada; ` +
            `${FIELD_KEY} restaurado por DB al estado original.`,
        );
        const adminState = authStatePath(E2E_ENV, "admin");
        if (existsSync(adminState)) {
          const context = await browser.newContext({
            baseURL: baseUrlFor(E2E_ENV),
            extraHTTPHeaders: extraHeadersFor(E2E_ENV),
            storageState: adminState,
            ignoreHTTPSErrors: true,
          });
          const page = await context.newPage();
          const contenido = new AdminContenidoPage(page);
          await contenido.goto();
          await contenido.refreshContentCache();
          await context.close();
        }
      }
    }
  } catch (err) {
    console.error("[homolog-cms] error en la reversión garantizada:", err);
  } finally {
    await disconnectDb();
  }
});

test("admin edita home.categories.cta-all → cliente lo ve → revertir → original visible", async ({
  adminPage,
  anonPage,
}, testInfo) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const shotsDir = resolve(EVIDENCE_DIR, "shots");
  mkdirSync(shotsDir, { recursive: true });
  const resultsPath = resolve(
    EVIDENCE_DIR,
    `results-${E2E_ENV}-${testInfo.project.name}-${run}.json`,
  );
  const shot = async (page: Page, name: string, scrollToText?: string) => {
    // El CTA de categorías queda bajo el fold: scroll para que el screenshot
    // muestre la evidencia visual del texto, no solo el hero.
    if (scrollToText) {
      await page
        .getByText(scrollToText)
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {});
    }
    const path = resolve(shotsDir, `${E2E_ENV}-${testInfo.project.name}-${run}-${name}.png`);
    await page.screenshot({ path, fullPage: false });
    return path;
  };

  const home = new HomePage(anonPage);
  const contenido = new AdminContenidoPage(adminPage);

  try {
    // 0. Original DESDE LA DB del ambiente (nada de constantes quemadas).
    const before = await getCmsFieldState(FIELD_KEY);
    expect(before, `el campo ${FIELD_KEY} debe existir en la DB de ${E2E_ENV}`).not.toBeNull();
    expect(before!.isPublished, `${FIELD_KEY} debe estar publicado`).toBe(true);
    const original = before!.publishedBody!;
    expect(original.length).toBeGreaterThan(0);
    const variant = `Ver todo el catálogo → [${run}]`;
    expect(original, "el original no puede contener el RUN de esta corrida").not.toContain(run);
    record("db-read-original", true, `original="${original}" (versión viva en ${E2E_ENV})`);

    // Guard file para la red de seguridad (teardown) — existe hasta la reversa.
    writeFileSync(
      guardPath,
      JSON.stringify(
        {
          fieldKey: FIELD_KEY,
          run,
          original: {
            body: before!.draftBody,
            publishedVersionId: before!.publishedVersionId,
            isPublished: before!.isPublished,
          },
        } satisfies CmsGuard & { fieldKey: string; run: string },
        null,
        2,
      ),
    );

    // 0.5. Invalidación de caché CMS ANTES de la baseline (patrón obligado del
    // repo — release-check-a1: la caché unstable_cache del servidor puede traer
    // una versión vieja de una corrida anterior; el publish por UI sí invalida,
    // pero la baseline lee ANTES de cualquier publish de ESTA corrida).
    await contenido.goto();
    await contenido.refreshContentCache();
    record("admin-cache-refresh", true, "caché CMS invalidada antes de la baseline");

    // 1. Baseline: el cliente anónimo ve el texto ORIGINAL antes de tocar nada.
    await home.goto();
    await home.expectBodyText(original);
    record(
      "client-baseline-original",
      true,
      "la home muestra el original",
      await shot(anonPage, "1-baseline", original),
    );

    // 2. Admin (storageState) edita el campo por la UI y publica la variante.
    await contenido.editFieldAndPublish(PAGE_SLUG, FIELD_KEY, variant);
    record("admin-publish-variant", true, `variant="${variant}"`);

    // 3. Verificación en DB: la versión viva ES la variante.
    const mid = await getCmsFieldState(FIELD_KEY);
    expect(mid!.publishedBody).toBe(variant);
    record("db-check-variant", true, `publishedBody="${mid!.publishedBody}"`);

    // 4. El cliente anónimo lo ve en la home (misma navegación que un real).
    await home.goto();
    await home.expectBodyText(variant);
    record("client-sees-variant", true, undefined, await shot(anonPage, "2-variant", variant));

    // 5. Revertir por la misma UI.
    await contenido.editFieldAndPublish(PAGE_SLUG, FIELD_KEY, original);
    record("admin-publish-original", true);

    // 6. Verificación en DB + cliente: el original vuelve.
    const after = await getCmsFieldState(FIELD_KEY);
    expect(after!.publishedBody).toBe(original);
    record("db-check-original", true, `publishedBody="${after!.publishedBody}"`);
    await home.goto();
    await home.expectBodyText(original);
    record("client-sees-original", true, undefined, await shot(anonPage, "3-original", original));

    // Reversa confirmada → el guard file se retira (la red ya no hace falta).
    rmSync(guardPath, { force: true });

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-admin-cms",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          fieldKey: FIELD_KEY,
          status: "pass",
          steps,
        },
        null,
        2,
      ),
    );
    console.log(`✓ evidencia homologación: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-admin-cms",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          fieldKey: FIELD_KEY,
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
