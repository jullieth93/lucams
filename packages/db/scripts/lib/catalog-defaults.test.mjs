import assert from "node:assert/strict";
import test from "node:test";
import { shouldSeedDefaultPhysicalSpecs } from "./catalog-defaults.mjs";
import { NEW_PRODUCTS } from "./new-products.mjs";

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
    assert.equal(product.isActive, true);
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
    assert.ok(product.variants.every((variant) => variant.price === product.basePrice));
  }
});
