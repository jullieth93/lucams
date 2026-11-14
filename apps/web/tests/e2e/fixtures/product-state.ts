import { existsSync } from "node:fs";
import { expect, test, type Browser } from "@playwright/test";
import { Prisma } from "@lucams/db";
import { authStatePath, baseUrlFor, currentEnv, extraHeadersFor } from "../_setup/env";
import { db } from "./db";

const NEW_PRODUCT_SLUGS = ["bola-navidena-personalizada", "mini-libros-magneticos"];

export async function captureNewProductState() {
  return db().product.findMany({
    where: { slug: { in: NEW_PRODUCT_SLUGS }, deletedAt: null },
    orderBy: { slug: "asc" },
    select: {
      id: true,
      slug: true,
      isActive: true,
      basePrice: true,
      physicalSpecs: true,
      category: { select: { id: true, isActive: true, deletedAt: true } },
      variants: {
        where: { deletedAt: null },
        orderBy: { id: "asc" },
        select: { id: true, isActive: true, price: true, stock: true },
      },
      wholesaleTiers: {
        where: { deletedAt: null },
        orderBy: { id: "asc" },
        select: {
          id: true,
          minQty: true,
          unitPrice: true,
          note: true,
          isActive: true,
          createdBy: true,
          updatedBy: true,
        },
      },
    },
  });
}

export async function restoreNewProductState(
  states: Awaited<ReturnType<typeof captureNewProductState>>,
) {
  for (const product of states) {
    await db().product.update({
      where: { id: product.id },
      data: {
        isActive: product.isActive,
        basePrice: product.basePrice,
        physicalSpecs: product.physicalSpecs ?? Prisma.DbNull,
      },
    });
    await db().category.update({
      where: { id: product.category.id },
      data: { isActive: product.category.isActive, deletedAt: product.category.deletedAt },
    });
    for (const variant of product.variants) {
      await db().productVariant.update({
        where: { id: variant.id },
        data: { isActive: variant.isActive, price: variant.price, stock: variant.stock },
      });
    }
    for (const tier of product.wholesaleTiers) {
      await db().wholesaleTier.upsert({
        where: { id: tier.id },
        create: { productId: product.id, ...tier },
        update: {
          minQty: tier.minQty,
          unitPrice: tier.unitPrice,
          note: tier.note,
          isActive: tier.isActive,
          updatedBy: tier.updatedBy,
        },
      });
    }
  }
}

export async function expectNewProductStateRestored(
  states: Awaited<ReturnType<typeof captureNewProductState>>,
) {
  expect(await captureNewProductState()).toEqual(states);
}

export async function revalidateNewProductsThroughAdmin(browser: Browser, productIds: string[]) {
  const env = currentEnv();
  const storageState = authStatePath(env, "admin");
  test.skip(
    !existsSync(storageState),
    "La activación real por admin requiere E2E_AUTH=1 para invalidar el catálogo.",
  );
  const products = await db().product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, slug: true, isActive: true },
    orderBy: { slug: "asc" },
  });
  const context = await browser.newContext({
    baseURL: baseUrlFor(env),
    extraHTTPHeaders: extraHeadersFor(env),
    storageState,
    ignoreHTTPSErrors: true,
  });
  try {
    const page = await context.newPage();
    for (const product of products) {
      await db().product.update({
        where: { id: product.id },
        data: { isActive: !product.isActive },
      });
      await page.goto(`/admin/productos?q=${encodeURIComponent(product.slug)}`, {
        waitUntil: "domcontentloaded",
      });
      const row = page.locator("tbody tr").filter({ hasText: `/producto/${product.slug}` });
      const targetLabel = product.isActive ? "Activar" : "Pausar";
      const finalLabel = product.isActive ? "Pausar" : "Activar";
      await expect(async () => {
        await row.getByRole("button", { name: targetLabel, exact: true }).click();
        await expect(row.getByRole("button", { name: finalLabel, exact: true })).toBeVisible({
          timeout: 5_000,
        });
      }).toPass({ timeout: 30_000 });
      await expect
        .poll(async () => {
          const current = await db().product.findUnique({
            where: { id: product.id },
            select: { isActive: true },
          });
          return current?.isActive;
        })
        .toBe(product.isActive);
    }
  } finally {
    await context.close();
  }
}
