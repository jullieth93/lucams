/*
 * preview-encode — presupuesto de bytes del preview del finalize
 * (fix STG 2026-10-05). El body de la Server Action tiene techo duro ~4.5 MB
 * en Vercel; `fitPreviewToBudget` re-codifica antes de armar el FormData.
 * Acá se cubren las piezas PURAS (tamaño de dataURL + escalera de
 * re-codificación); el loop con canvas queda al server como red de seguridad.
 */

import { describe, it, expect } from "vitest";
import { PREVIEW_UPLOAD_BUDGET_BYTES, dataUrlByteLength, previewFitPlan } from "./preview-encode";

describe("dataUrlByteLength", () => {
  it("cuenta los bytes del payload base64 sin decodificarlo", () => {
    // "hola" = 4 bytes → "aG9sYQ=="
    expect(dataUrlByteLength("data:image/webp;base64,aG9sYQ==")).toBe(4);
    // 3 bytes → sin padding: "aG9s"
    expect(dataUrlByteLength("data:image/png;base64,aG9s")).toBe(3);
    // 5 bytes → 1 char de padding: "aG9sYXM="
    expect(dataUrlByteLength("data:image/jpeg;base64,aG9sYXM=")).toBe(5);
  });

  it("dataURL malformado (sin coma) da 0", () => {
    expect(dataUrlByteLength("data:image/webp")).toBe(0);
  });
});

describe("PREVIEW_UPLOAD_BUDGET_BYTES", () => {
  it("queda POR DEBAJO del techo duro de Vercel (~4.5 MB) con margen multipart", () => {
    expect(PREVIEW_UPLOAD_BUDGET_BYTES).toBeLessThan(4.5 * 1024 * 1024);
    // …pero por encima del techo de 3 MB del server: el camino común (preview
    // de 3-3.5 MB) no se re-codifica en el cliente — lo comprime el server.
    expect(PREVIEW_UPLOAD_BUDGET_BYTES).toBeGreaterThan(3 * 1024 * 1024);
  });
});

describe("previewFitPlan", () => {
  it("entradas moderadas prueban PRIMERO a tamaño completo (conservar nitidez)", () => {
    const plan = previewFitPlan(4 * 1024 * 1024);
    expect(plan.scales[0]).toBe(1);
    expect(plan.qualities).toEqual([0.82, 0.7, 0.58, 0.46]);
    // la escalera de escala es decreciente (downscale progresivo)
    for (let i = 1; i < plan.scales.length; i++) {
      expect(plan.scales[i]).toBeLessThan(plan.scales[i - 1]);
    }
  });

  it("entradas >4.5 MB empiezan con resize (la calidad sola no basta)", () => {
    const plan = previewFitPlan(6 * 1024 * 1024);
    expect(plan.scales[0]).toBeLessThan(1);
    expect(plan.scales).toEqual([0.5, 0.35, 0.25]);
  });

  it("espeja la escalera del server (compressPreviewImage, sharp-safe.ts)", () => {
    // Si el plan del cliente diverge del del server, el "fail-closed" del
    // cliente rechazaría previews que el server sí habría comprimido.
    const moderate = previewFitPlan(4 * 1024 * 1024);
    const huge = previewFitPlan(6 * 1024 * 1024);
    expect(moderate.scales).toEqual([1, 0.75, 0.5, 0.35]);
    expect(huge.scales).toEqual([0.5, 0.35, 0.25]);
    expect(moderate.qualities).toEqual(huge.qualities);
  });
});
