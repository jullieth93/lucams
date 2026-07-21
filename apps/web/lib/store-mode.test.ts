/*
 * Tests de lib/store-mode.ts — flag NEXT_PUBLIC_STORE_MODE (Etapa 1 catálogo
 * vs Etapa 2 tienda full).
 *
 * El módulo evalúa la env var AL IMPORTARSE (const de módulo), así que cada
 * caso corre con `vi.resetModules()` + import dinámico tras fijar el valor.
 *
 * FOCO:
 *   - default "full" cuando la var no existe (tienda completa es el default).
 *   - "catalog" y "full" explícitos pasan tal cual.
 *   - valores inválidos (typo, casing, vacío) caen a "full" — fail-closed
 *     hacia la tienda completa: un typo no debe apagar el checkout en prod.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "NEXT_PUBLIC_STORE_MODE";
const original = process.env[KEY];

async function loadStoreMode() {
  return import("./store-mode");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

describe("STORE_MODE", () => {
  it("cae a 'full' cuando NEXT_PUBLIC_STORE_MODE no está definida", async () => {
    delete process.env[KEY];
    const mod = await loadStoreMode();
    expect(mod.STORE_MODE).toBe("full");
    expect(mod.isCatalogMode()).toBe(false);
  });

  it("devuelve 'catalog' con el valor exacto 'catalog' (modo Etapa 1)", async () => {
    process.env[KEY] = "catalog";
    const mod = await loadStoreMode();
    expect(mod.STORE_MODE).toBe("catalog");
    expect(mod.isCatalogMode()).toBe(true);
  });

  it("devuelve 'full' con el valor exacto 'full'", async () => {
    process.env[KEY] = "full";
    const mod = await loadStoreMode();
    expect(mod.STORE_MODE).toBe("full");
    expect(mod.isCatalogMode()).toBe(false);
  });

  it.each(["CATALOG", "Catalog", " catalogue ", "", "0", "true", "disabled"])(
    "cae a 'full' con valor inválido %j (fail-closed hacia tienda completa)",
    async (valor) => {
      process.env[KEY] = valor;
      const mod = await loadStoreMode();
      expect(mod.STORE_MODE).toBe("full");
      expect(mod.isCatalogMode()).toBe(false);
    },
  );
});
