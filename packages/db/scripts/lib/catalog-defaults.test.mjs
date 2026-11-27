import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shouldSeedDefaultPhysicalSpecs } from "./catalog-defaults.mjs";
import { NEW_PRODUCTS, CHRISTMAS_ORNAMENT_SLUG, MINI_BOOK_SLUG } from "./new-products.mjs";

test("conserva los valores logísticos existentes", () => {
  assert.equal(
    shouldSeedDefaultPhysicalSpecs({
      personalizationSchema: { photoSlots: 6 },
      physicalSpecs: { weightGrams: 30 },
    }),
    false,
  );
});

test("completa especificaciones vacías de productos estándar", () => {
  for (const physicalSpecs of [null, {}]) {
    assert.equal(
      shouldSeedDefaultPhysicalSpecs({ personalizationSchema: { photoSlots: 6 }, physicalSpecs }),
      true,
    );
  }
});

test("no inventa logística para experiencias físicas especializadas", () => {
  for (const product of NEW_PRODUCTS) {
    assert.equal(shouldSeedDefaultPhysicalSpecs(product), false);
  }
  assert.equal(
    shouldSeedDefaultPhysicalSpecs({
      personalizationSchema: { experience: "folded-strip" },
      physicalSpecs: null,
    }),
    false,
  );
});

test("conserva los precios unitarios, promociones y logística confirmados", () => {
  for (const product of NEW_PRODUCTS) {
    assert.equal(product.basePrice, 1_000_000);
    assert.deepEqual(product.physicalSpecs, {
      weightGrams: 200,
      widthCm: 8,
      heightCm: 8,
      depthCm: 8,
    });
    assert.deepEqual(
      product.wholesaleTiers.map(({ minQty, unitPrice }) => ({ minQty, unitPrice })),
      [
        { minQty: 3, unitPrice: 900_000 },
        { minQty: 5, unitPrice: 800_000 },
      ],
    );
  }
  // 2026-11-11 (owner): la bola se vende Sin imán ($10.000) y Con imán
  // ($11.000, +$1.000) — es la única excepción al precio único por variante.
  const bola = NEW_PRODUCTS.find((p) => p.slug === CHRISTMAS_ORNAMENT_SLUG);
  assert.equal(bola.isActive, true);
  assert.deepEqual(Object.fromEntries(bola.variants.map((v) => [v.attributes.magnet, v.price])), {
    false: 1_000_000,
    true: 1_100_000,
  });
  // Los mini libros quedan sembrados pero INACTIVOS (fuera del catálogo
  // activo de referencia: los 8 de PRD + la bola) con precio único.
  const miniLibros = NEW_PRODUCTS.find((p) => p.slug === MINI_BOOK_SLUG);
  assert.equal(miniLibros.isActive, false);
  assert.ok(miniLibros.variants.every((variant) => variant.price === miniLibros.basePrice));
});

test("ADR-208 Paso 1B: seed-catalog-canonical no reintroduce el buffer MADE_TO_ORDER_STOCK", () => {
  const seedSource = readFileSync(new URL("../seed-catalog-canonical.mjs", import.meta.url), "utf8");
  assert.equal(
    seedSource.includes("MADE_TO_ORDER_STOCK"),
    false,
    "seed-catalog-canonical.mjs no debe referenciar ni sembrar MADE_TO_ORDER_STOCK",
  );
  assert.equal(
    /stock:\s*100_?000/.test(seedSource),
    false,
    "seed-catalog-canonical.mjs no debe escribir stock sintético 100_000",
  );
});
