import { describe, expect, it } from "vitest";
import {
  miniBookGeometry,
  miniBookTemplateGeometry,
  parseExtendedSizeCm,
  physicalUnitsFromFaces,
  readProductExperience,
  supportsTwoFaceDesign,
  twoFaceConstructionForProduct,
} from "./product-experience";

describe("readProductExperience", () => {
  it("usa el comportamiento estándar cuando no hay configuración", () => {
    expect(readProductExperience(null)).toEqual({
      experience: "standard",
      freeUnitDesign: false,
      volumePricingByPhysicalUnit: false,
      spineWidthCm: 0.5,
    });
  });

  it("lee las capacidades explícitas sin activar flags por proximidad", () => {
    expect(
      readProductExperience({
        experience: "mini-book",
        freeUnitDesign: true,
        volumePricingByPhysicalUnit: true,
        spineWidthCm: 0.5,
      }),
    ).toEqual({
      experience: "mini-book",
      freeUnitDesign: true,
      volumePricingByPhysicalUnit: true,
      spineWidthCm: 0.5,
    });
    expect(
      readProductExperience({ experience: "mini-book", freeUnitDesign: "true" }),
    ).toMatchObject({ freeUnitDesign: false, volumePricingByPhysicalUnit: false });
  });
});

describe("unidades físicas y capacidad de dos caras", () => {
  it("agrupa los slots A/B sin contarlos como unidades adicionales", () => {
    expect(physicalUnitsFromFaces(2, 2)).toBe(1);
    expect(physicalUnitsFromFaces(4, 2)).toBe(2);
    expect(physicalUnitsFromFaces(3, 2)).toBe(2);
    expect(physicalUnitsFromFaces(4, 1)).toBe(4);
    expect(physicalUnitsFromFaces(0, 2)).toBe(0);
  });

  it("habilita dúplex en la bola y tiras en separadores", () => {
    expect(twoFaceConstructionForProduct({ experience: "christmas-ornament" })).toBe("duplex");
    expect(supportsTwoFaceDesign({}, "separadores-magneticos")).toBe(true);
    expect(supportsTwoFaceDesign({ galleryTag: "separadores-alargados" }, "otro")).toBe(true);
  });

  it("rechaza mini libros y productos estándar sin soporte explícito", () => {
    expect(supportsTwoFaceDesign({ experience: "mini-book" })).toBe(false);
    expect(supportsTwoFaceDesign({}, "fotoimanes-cuadrados")).toBe(false);
    expect(supportsTwoFaceDesign(null)).toBe(false);
  });
});

describe("medidas de mini libros", () => {
  it.each([
    ["7.1×5", 7.1, 5],
    ["5×2.5", 5, 2.5],
    ["7,1x5", 7.1, 5],
  ] as const)("acepta la medida extendida %s", (input, width, height) => {
    expect(parseExtendedSizeCm(input)).toEqual({ widthCm: width, heightCm: height });
  });

  it("divide 7,1 × 5 cm en dos tapas de 3,3 cm y un lomo de 0,5 cm", () => {
    const geometry = miniBookGeometry("7.1×5")!;
    expect(geometry.coverWidthCm).toBeCloseTo(3.3);
    expect(geometry.thicknessCm).toBe(0.5);
    expect(geometry.regions.back).toEqual({ offsetX: 0, width: 3.3 / 7.1 });
    expect(geometry.regions.spine.offsetX).toBeCloseTo(3.3 / 7.1);
    expect(geometry.regions.spine.width).toBeCloseTo(0.5 / 7.1);
    expect(geometry.regions.front.offsetX).toBeCloseTo(3.8 / 7.1);
    expect(geometry.regions.front.width).toBeCloseTo(3.3 / 7.1);
  });

  it("divide 5 × 2,5 cm en dos tapas de 2,25 cm y un lomo de 0,5 cm", () => {
    const geometry = miniBookGeometry("5×2.5")!;
    expect(geometry.coverWidthCm).toBe(2.25);
    expect(geometry.regions.front.offsetX).toBe(0.55);
    expect(geometry.regions.front.width).toBe(0.45);
  });

  it("rechaza lomos que consumen la carátula o medidas inválidas", () => {
    expect(miniBookGeometry("0.5×5")).toBeNull();
    expect(miniBookGeometry("7.1")).toBeNull();
    expect(miniBookGeometry("7.1×5", 8)).toBeNull();
  });

  it("calcula las mismas regiones en coordenadas de plantilla", () => {
    expect(miniBookTemplateGeometry(710, 500)).toEqual({
      back: { x: 0, width: 330 },
      spine: { x: 330, width: 50 },
      front: { x: 380, width: 330 },
      height: 500,
    });
    expect(miniBookTemplateGeometry(500, 250)).toEqual({
      back: { x: 0, width: 225 },
      spine: { x: 225, width: 50 },
      front: { x: 275, width: 225 },
      height: 250,
    });
  });
});
