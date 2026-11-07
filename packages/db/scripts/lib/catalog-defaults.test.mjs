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
