/*
 * HOMOLOGACIÓN E2E — landings de ocasión (docs/TESTING.md):
 *
 *   las landings top por ocasión sembrada renderizan con productos reales
 *   filtrados de la DB (links a PDPs existentes), breadcrumb sin link roto
 *   (Inicio → /), y JSON-LD con BreadcrumbList + CollectionPage coherentes.
 *   Solo lectura — corre en LOCAL y STG × desktop/mobile.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "La corrida de homologación es LOCAL/STG (PRD solo smoke read-only).");
test.setTimeout(180_000);

const run = newRunId("ocasion");

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };

test.afterAll(async () => {
  await disconnectDb();
});

test("ocasiones: 2 landings top con productos reales + breadcrumb + JSON-LD CollectionPage", async ({
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

  // Las 2 ocasiones top por productos activos (leídas de la DB del ambiente).
  const ocasiones = await db().ocasionTag.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      products: { some: { product: { isActive: true, deletedAt: null } } },
    },
    select: { slug: true, name: true, _count: { select: { products: true } } },
    orderBy: { products: { _count: "desc" } },
    take: 2,
  });
  expect(ocasiones.length, "debe haber ≥2 ocasiones con productos").toBeGreaterThanOrEqual(2);

  try {
    for (const [idx, ocasion] of ocasiones.entries()) {
      const res = await anonPage.goto(`/ocasion/${ocasion.slug}`, {
        waitUntil: "domcontentloaded",
      });
      expect(res!.status(), `/ocasion/${ocasion.slug} debe responder 200`).toBe(200);

      // Hero + nombre + conteo.
      await expect(
        anonPage.getByRole("heading", { name: `Imanes para ${ocasion.name}`, level: 1 }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(anonPage.locator("body")).toContainText(/productos disponibles/i);

      // Breadcrumb sin link roto: Inicio → /, nombre actual presente.
      const nav = anonPage.locator('nav[aria-label="Ruta de navegación"]');
      const homeLink = nav.getByRole("link", { name: "Inicio" });
      await expect(homeLink).toHaveAttribute("href", "/");
      await expect(nav).toContainText(ocasion.name);

      // Productos reales filtrados: al menos 1 link a PDP que existe en DB.
      const pdpLinks = anonPage.locator('main a[href*="/producto/"]');
      expect(await pdpLinks.count(), "la landing debe listar productos").toBeGreaterThan(0);
      const href = await pdpLinks.first().getAttribute("href");
      const realProduct = await db().product.findFirst({
        where: { slug: href!.replace("/producto/", ""), isActive: true, deletedAt: null },
        select: { slug: true },
      });
      expect(realProduct, `el link ${href} debe ser un producto real activo`).not.toBeNull();

      // JSON-LD: BreadcrumbList + CollectionPage con el nombre de la ocasión.
      const scripts = await anonPage.locator('script[type="application/ld+json"]').allInnerTexts();
      const parsed = scripts.flatMap((s) => {
        const data = JSON.parse(s) as
          { "@type"?: string; name?: string } | Array<{ "@type"?: string; name?: string }>;
        return Array.isArray(data) ? data : [data];
      });
      const types = parsed.map((d) => d["@type"]);
      expect(types).toContain("BreadcrumbList");
      expect(types).toContain("CollectionPage");
      const cp = parsed.find((d) => d["@type"] === "CollectionPage");
      expect(cp?.name).toContain(ocasion.name);

      record(
        `ocasion-${idx + 1}-${ocasion.slug}`,
        true,
        `${ocasion.name}: h1 + ${await pdpLinks.count()} productos (1er link ${href}) + breadcrumb + JSON-LD`,
        idx === 0 ? await shot(anonPage, `1-${ocasion.slug}`) : undefined,
      );
    }

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-ocasion",
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
    console.log(`✓ evidencia ocasiones: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-ocasion",
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
