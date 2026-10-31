/*
 * El endurecimiento de sharp tiene que EFECTIVAMENTE bloquear, no solo estar escrito.
 *
 * Contexto (actualizado 2026-10-30, LUC-SEC-011): sharp está en 0.35.5 — parcheado para
 * GHSA-f88m-g3jw-g9cj y corriendo en Vercel (PRD lo opera desde 2026-10-06). El bloqueo de los
 * cargadores de GIF, TIFF y VIPS (formatos que esta tienda no acepta) se CONSERVA como defensa
 * en profundidad: superficie no usada no se expone.
 *
 * La exposición es real: el Estudio está vivo en modo catálogo y procesa fotos de invitados.
 *
 * Este test intenta decodificar un GIF real. Si alguien retira el bloqueo —o importa `sharp`
 * directo saltándose este módulo— el GIF se decodifica y el test falla.
 */

import { describe, it, expect } from "vitest";
import sharp, { BLOCKED_LOADERS } from "./sharp-safe";

/** GIF 1×1 válido y mínimo (GIF89a). Sirve para probar que el loader está bloqueado. */
const GIF_1X1 = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** PNG 1×1 transparente — formato SÍ soportado por la tienda, debe seguir funcionando. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("sharp endurecido", () => {
  it("bloquea los cargadores de los formatos donde viven las CVE de libvips", () => {
    expect(BLOCKED_LOADERS).toContain("VipsForeignLoadNsgif");
    expect(BLOCKED_LOADERS).toContain("VipsForeignLoadTiff");
    expect(BLOCKED_LOADERS).toContain("VipsForeignLoadVips");
  });

  it("RECHAZA un GIF real (el bloqueo está activo, no solo declarado)", async () => {
    await expect(sharp(GIF_1X1).metadata()).rejects.toThrow();
  });

  it("sigue procesando PNG, que es un formato que la tienda sí acepta", async () => {
    const meta = await sharp(PNG_1X1).metadata();

    expect(meta.format).toBe("png");
    expect(meta.width).toBe(1);
  });

  it("sigue pudiendo GENERAR salida (el bloqueo es de lectura, no de escritura)", async () => {
    const out = await sharp(PNG_1X1).resize(2, 2).png().toBuffer();

    expect(out.length).toBeGreaterThan(0);
  });
});
