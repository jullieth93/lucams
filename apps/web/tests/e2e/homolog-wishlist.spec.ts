/*
 * HOMOLOGACIÓN E2E — wishlist / favoritos (docs/TESTING.md):
 *
 *   PDP → "Guardar en favoritos" (cliente logueado) → WishlistItem en DB →
 *   /mi-cuenta/favoritos lo lista → quitar → fila borrada. Anónimo: el click
 *   lleva a /login?next=… (sin romper — los favoritos son de clientes).
 *
 * La fila §6.10 "badge del header" NO aplica: el header actual no tiene badge
 * de favoritos (verificado en components/site-header.tsx) — documentado en la
 * auditoría, no se fuerza.
 *
 * Corre en LOCAL y STG × desktop/mobile. En PRD PROHIBIDO (escribe WishlistItem).
 * Cliente: el efímero del global.setup (storageState + fila Customer). Producto
 * REAL leído de la DB del ambiente (nunca se modifica; solo se le adjunta y
 * borra la wishlist del cliente efímero). Evidencia: JSON + screenshots.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "La wishlist escribe WishlistItem: prohibido en PRD.");
test.setTimeout(180_000);

const run = newRunId("wishlist");

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };

test.afterAll(async () => {
  await disconnectDb();
});

test("wishlist: marcar en PDP → en DB → /mi-cuenta/favoritos → quitar → fila borrada (+ anónimo a /login)", async ({
  clientPage,
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

  // Producto REAL del ambiente (solo se le alterna la wishlist del cliente efímero).
  const product = await db().product.findFirst({
    where: { isActive: true, deletedAt: null },
    select: { id: true, slug: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  expect(product, "producto activo del ambiente").not.toBeNull();

  // El cliente efímero del setup (su fila Customer vive en el manifiesto creado
  // por global.setup; la resolvemos por email del storageState client).
  const clientCustomer = await db().customer.findFirst({
    where: { email: { startsWith: "e2e-setup-" }, deletedAt: null },
    orderBy: { email: "desc" },
    select: { id: true, email: true },
  });
  expect(clientCustomer, "cliente efímero del setup con fila Customer").not.toBeNull();

  const wishlistRow = () =>
    db().wishlistItem.findUnique({
      where: { customerId_productId: { customerId: clientCustomer!.id, productId: product!.id } },
    });

  const wishBtn = (page: Page) => page.getByRole("button", { name: /favoritos/i }).first();

  try {
    // 1. PDP (logueado) → marcar favorito → aria-pressed + fila en DB.
    await clientPage.goto(`/producto/${product!.slug}`, { waitUntil: "domcontentloaded" });
    const btn = wishBtn(clientPage);
    await expect(btn).toHaveAttribute("aria-pressed", "false", { timeout: 15_000 });
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
    await expect(async () => {
      expect(await wishlistRow(), "WishlistItem persistido").not.toBeNull();
    }).toPass({ timeout: 20_000 });
    record("pdp-mark-db", true, `${product!.slug} wishlisted por ${clientCustomer!.email}`);

    // 2. /mi-cuenta/favoritos lo lista con su nombre.
    await clientPage.goto("/mi-cuenta/favoritos", { waitUntil: "domcontentloaded" });
    await expect(clientPage.locator("body")).toContainText(product!.name, { timeout: 20_000 });
    record("favoritos-page-lists", true, undefined, await shot(clientPage, "1-favoritos"));

    // 3. Quitar desde la PDP → fila borrada.
    await clientPage.goto(`/producto/${product!.slug}`, { waitUntil: "domcontentloaded" });
    await expect(btn).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "false", { timeout: 15_000 });
    await expect(async () => {
      expect(await wishlistRow(), "la fila se borró al quitar").toBeNull();
    }).toPass({ timeout: 20_000 });
    record("pdp-unmark-db-gone", true);

    // 4. Anónimo: el click NO rompe — lleva a /login?next=…
    // (Si el click cae pre-hidratación es un no-op silencioso: el toPass lo
    // reintenta hasta que React ya tiene el handler — mismo patrón H5.)
    await anonPage.goto(`/producto/${product!.slug}`, { waitUntil: "domcontentloaded" });
    await expect(async () => {
      await wishBtn(anonPage).click();
      await expect(anonPage).toHaveURL(/\/login\?next=/, { timeout: 3_000 });
    }).toPass({ timeout: 25_000 });
    record(
      "anon-redirect-login",
      true,
      "anónimo → /login?next=… (sin error ni fila)",
      await shot(anonPage, "2-anon-login"),
    );

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-wishlist",
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
    console.log(`✓ evidencia wishlist: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-wishlist",
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
