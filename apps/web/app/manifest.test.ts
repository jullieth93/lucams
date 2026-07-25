/*
 * Tests del Web App Manifest — la descripción instalable de la PWA.
 *
 * FOCO: en modo catálogo (Etapa 1) no existe checkout de pago ni envío calculado, así que el
 * manifest no puede prometer "pago en línea seguro y envío a 1.100+ destinos" (Ley 1480, art. 23:
 * información no engañosa). El texto se deriva del flag, no se hardcodea, para que vuelva solo
 * cuando se active el modo full.
 *
 * `lib/store-mode` evalúa la env var AL IMPORTARSE → cada caso corre con `vi.resetModules()` +
 * import dinámico tras fijar el valor (mismo patrón que lib/store-mode.test.ts).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "NEXT_PUBLIC_STORE_MODE";
const original = process.env[KEY];

async function loadManifest() {
  const mod = await import("./manifest");
  return mod.default();
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

describe("manifest()", () => {
  it("en modo catálogo no promete pago en línea ni envío calculado", async () => {
    process.env[KEY] = "catalog";
    const manifest = await loadManifest();
    expect(manifest.description).not.toMatch(/pago en línea/i);
    expect(manifest.description).not.toMatch(/1\.100\+/);
    expect(manifest.description).toMatch(/cotización por WhatsApp/i);
  });

  it("en modo full recupera el texto transaccional", async () => {
    process.env[KEY] = "full";
    const manifest = await loadManifest();
    expect(manifest.description).toMatch(/pago en línea seguro/i);
  });

  it("mantiene nombre, colores e íconos en cualquier modo", async () => {
    process.env[KEY] = "catalog";
    const manifest = await loadManifest();
    expect(manifest.name).toBe("Lucams_shop — Tus recuerdos en imán");
    expect(manifest.theme_color).toBe("#7C6AAD");
    expect(manifest.icons).toHaveLength(3);
  });
});
