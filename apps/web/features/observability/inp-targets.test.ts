/*
 * Tests de buildInpTargetTable (Paquete J, 2026-10-02) — la agrupación de
 * INP por elemento que cierra el ciclo de medición de la auditoría §E-4.
 */

import { describe, expect, it } from "vitest";
import { buildInpTargetTable } from "./inp-targets";

const row = (route: string, name: string, value: number, target: string | null) => ({
  route,
  name,
  value,
  target,
});

describe("buildInpTargetTable", () => {
  it("agrupa por (route, target), calcula percentiles y ordena por p75 desc", () => {
    const rows = [
      // Botón lento del estudio: 3 muestras altas.
      row("/estudio/[slug]", "INP", 400, "button#preview"),
      row("/estudio/[slug]", "INP", 600, "button#preview"),
      row("/estudio/[slug]", "INP", 500, "button#preview"),
      // Input de archivo: 3 muestras medias.
      row("/estudio/[slug]", "INP", 250, "input[type=file]"),
      row("/estudio/[slug]", "INP", 300, "input[type=file]"),
      row("/estudio/[slug]", "INP", 200, "input[type=file]"),
    ];
    const table = buildInpTargetTable(rows);
    expect(table).toHaveLength(2);
    expect(table[0]!.target).toBe("button#preview");
    expect(table[0]!.samples).toBe(3);
    expect(table[0]!.percentiles.p75).toBeGreaterThan(table[1]!.percentiles.p75);
    expect(table[0]!.max).toBe(600);
  });

  it("ignora métricas que no son INP y targets null", () => {
    const rows = [
      row("/estudio/[slug]", "LCP", 3000, "img.hero"),
      row("/estudio/[slug]", "INP", 500, null), // INP sin elemento (pre-2026-09-18)
      row("/", "INP", 100, "a.nav"),
      row("/", "INP", 120, "a.nav"),
      row("/", "INP", 110, "a.nav"),
    ];
    const table = buildInpTargetTable(rows);
    expect(table).toHaveLength(1);
    expect(table[0]).toMatchObject({ route: "/", target: "a.nav", samples: 3 });
  });

  it("exige minSamples por grupo (1-2 muestras no dicen nada)", () => {
    const rows = [
      row("/estudio/[slug]", "INP", 900, "button#preview"),
      row("/estudio/[slug]", "INP", 950, "button#preview"),
    ];
    expect(buildInpTargetTable(rows)).toHaveLength(0);
    expect(buildInpTargetTable(rows, { minSamples: 2 })).toHaveLength(1);
  });

  it("el mismo target en rutas distintas son grupos distintos", () => {
    const rows = [
      row("/", "INP", 100, "button#buy"),
      row("/", "INP", 100, "button#buy"),
      row("/", "INP", 100, "button#buy"),
      row("/producto/[slug]", "INP", 200, "button#buy"),
      row("/producto/[slug]", "INP", 200, "button#buy"),
      row("/producto/[slug]", "INP", 200, "button#buy"),
    ];
    const table = buildInpTargetTable(rows);
    expect(table).toHaveLength(2);
    expect(table[0]!.route).toBe("/producto/[slug]");
  });

  it("respeta el límite de filas", () => {
    const rows = Array.from({ length: 20 }, (_, i) => [
      row("/x", "INP", i * 10, `button#b${i}`),
      row("/x", "INP", i * 10, `button#b${i}`),
      row("/x", "INP", i * 10, `button#b${i}`),
    ]).flat();
    expect(buildInpTargetTable(rows, { limit: 5 })).toHaveLength(5);
  });
});
