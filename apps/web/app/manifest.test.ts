import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifest()", () => {
  it("describe la tienda transaccional vigente", () => {
    const result = manifest();
    expect(result.description).toMatch(/pago en línea seguro/i);
    expect(result.description).toMatch(/1\.100\+/);
  });

  it("mantiene nombre, colores e íconos", () => {
    const result = manifest();
    expect(result.name).toBe("Lucams Shop — Tus recuerdos en imán");
    expect(result.theme_color).toBe("#7C6AAD");
    expect(result.icons).toHaveLength(3);
  });
});
