/*
 * resolveCmsTokens — la promesa de entrega y la cobertura tienen UNA fuente
 * (SiteSettings) y el contenido CMS referencia tokens en vez de literales.
 * Motivado por la duda de Lucy (2026-07-29): editar "Tiempo de fabricación"
 * en el admin no movía nada y el valor mezclaba fabricación con entrega.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/cms", () => ({
  getSettingValue: vi.fn(async (key: string, fallback: string) => {
    switch (key) {
      case "PRODUCTION_DAYS_DEFAULT":
        return "2";
      case "DELIVERY_DAYS_ESTIMATE":
        return "1";
      case "DELIVERY_COVERAGE_COUNT":
        return "1.100+";
      default:
        return fallback;
    }
  }),
  getCmsBlock: vi.fn(async () => null),
}));

import { resolveCmsTokens } from "./cms-tokens";

describe("resolveCmsTokens", () => {
  it("{{fab}} y {{entrega}} salen de las settings canónicas", async () => {
    expect(await resolveCmsTokens("{{fab}} de fabricación + {{entrega}} de entrega")).toBe(
      "2 de fabricación + 1 de entrega",
    );
  });

  it("{{total}} se calcula (fab + entrega), no se lee de ningún lado", async () => {
    expect(await resolveCmsTokens("máximo {{total}} días hábiles")).toBe("máximo 3 días hábiles");
  });

  it("{{cobertura}} sale de DELIVERY_COVERAGE_COUNT", async () => {
    expect(await resolveCmsTokens("Entrega a {{cobertura}} destinos")).toBe(
      "Entrega a 1.100+ destinos",
    );
  });

  it("un cambio de setting se propaga al texto (la duda de Lucy, resuelta)", async () => {
    const { getSettingValue } = await import("@/lib/cms");
    vi.mocked(getSettingValue).mockImplementation(async (key: string, fallback: string) =>
      key === "PRODUCTION_DAYS_DEFAULT" ? "4" : key === "DELIVERY_DAYS_ESTIMATE" ? "2" : fallback,
    );
    const out = await resolveCmsTokens("máximo {{total}} días ({{fab}} + {{entrega}})");
    expect(out).toBe("máximo 6 días (4 + 2)");
  });

  it("{{ciudad}} solo se resuelve con ctx; sin ctx queda literal", async () => {
    expect(await resolveCmsTokens("envío a {{ciudad}}")).toBe("envío a {{ciudad}}");
    expect(await resolveCmsTokens("envío a {{ciudad}}", { city: "Cali" })).toBe("envío a Cali");
  });

  it("tokens desconocidos pasan intactos y texto sin tokens no toca settings", async () => {
    expect(await resolveCmsTokens("cupón {{raro}} sin resolver")).toBe(
      "cupón {{raro}} sin resolver",
    );
    const { getSettingValue } = await import("@/lib/cms");
    vi.mocked(getSettingValue).mockClear();
    await resolveCmsTokens("texto sin tokens");
    expect(getSettingValue).not.toHaveBeenCalled();
  });
});
