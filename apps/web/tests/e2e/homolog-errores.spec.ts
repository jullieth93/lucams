/*
 * HOMOLOGACIÓN E2E — errores: 404 personalizado (soft 404 con la página de
 * marca) y noindex en rutas de un solo uso.
 */

import { E2E_ENV, expect, test } from "./fixtures/auth";
import { disconnectDb, getActiveProduct } from "./fixtures/db";

test.skip(E2E_ENV === "prd", "Suite de homologación destinada a LOCAL y STG.");
test.setTimeout(300_000);

test.afterAll(async () => {
  await disconnectDb();
});

test("errores: 404 de marca + noindex en rutas de un solo uso", async ({ anonPage }) => {
  const notFound = await anonPage.goto("/esto-no-existe-jamas", {
    waitUntil: "domcontentloaded",
  });
  expect(notFound).not.toBeNull();
  await expect(anonPage.locator("body")).toContainText(/esta página se nos perdió/i, {
    timeout: 15_000,
  });

  const checkoutRes = await anonPage.goto("/carrito", { waitUntil: "domcontentloaded" });
  expect(checkoutRes!.status()).toBe(200);
  const product = await getActiveProduct();
  await anonPage.goto(`/estudio/${product!.slug}`, { waitUntil: "domcontentloaded" });
  const robotsMeta = await anonPage
    .locator('meta[name="robots"]')
    .getAttribute("content")
    .catch(() => null);
  expect(robotsMeta, "el estudio debe ser noindex").toContain("noindex");
});
