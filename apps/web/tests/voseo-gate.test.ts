import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const makefile = readFileSync(new URL("../../../Makefile", import.meta.url), "utf8");
const match = makefile.match(/git grep -niE '([^']+)' --/);
if (!match) throw new Error("No se encontró el patrón anti-voseo del Makefile");
const gate = new RegExp(`\\b(?:${match[1]})\\b`, "i");

describe("Makefile — gate anti-voseo es-CO", () => {
  it.each([
    "Configurálos en el panel",
    "revisálo antes de publicar",
    "agregálo al carrito",
    "cargálo en la mediateca",
    "usálo en el checkout",
    "actualizálos ahora",
    "contános qué pasó",
  ])("rechaza el imperativo voseante enclítico: %s", (copy) => {
    expect(gate.test(copy)).toBe(true);
  });

  it.each([
    "Configúralos en el panel",
    "Revísalo antes de publicar",
    "Agrégalo al carrito",
    "Cárgalo en la mediateca",
    "Úsalo en el checkout",
    "Actualízalos ahora",
    "Cuéntanos qué pasó",
    "Configura los datos y revisa el pedido",
  ])("acepta el tuteo: %s", (copy) => {
    expect(gate.test(copy)).toBe(false);
  });
});
