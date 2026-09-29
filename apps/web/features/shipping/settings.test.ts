/*
 * Tests de las settings operativas de envío (CmsField kind SETTING):
 * lecturas fail-safe (setting ausente o JSON inválido → fallback), la
 * migración de lectura LUCAMS_SHIPPING_LOCALITIES (V1 solo-Bogotá) →
 * LUCAMS_SHIPPING_ZONES (V2 por ciudad) y la normalización de nombres de
 * transportadora usada al filtrar cotizaciones.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/features/cms/service", () => ({
  createCmsField: vi.fn(),
  getCmsFieldByKey: vi.fn(),
  saveCmsFieldDraft: vi.fn(),
}));

const getSettingValue = vi.hoisted(() =>
  vi.fn(async (_key: string, fallback: string): Promise<string> => fallback),
);
vi.mock("@/lib/cms", () => ({
  getSettingValue: (key: string, fallback: string) => getSettingValue(key, fallback),
}));

import {
  countEnabledZones,
  getDisabledCarriersNormalized,
  getLucamsShippingSettings,
  LUCAMS_SHIPPING_DEFAULTS,
  normalizeCarrierKey,
} from "./settings";

describe("getLucamsShippingSettings", () => {
  it("fail-closed: sin settings en DB → apagado, defaults y sin zonas", async () => {
    getSettingValue.mockImplementation(async (_k: string, fb: string) => fb);
    const s = await getLucamsShippingSettings();
    expect(s).toEqual({
      enabled: false,
      priceCop: LUCAMS_SHIPPING_DEFAULTS.priceCop,
      cutoffHour: LUCAMS_SHIPPING_DEFAULTS.cutoffHour,
      zones: {},
    });
  });

  it("parsea LUCAMS_SHIPPING_ZONES (V2 por ciudad)", async () => {
    const values: Record<string, string> = {
      LUCAMS_SHIPPING_ENABLED: "true",
      LUCAMS_SHIPPING_PRICE_COP: "750000",
      LUCAMS_SHIPPING_CUTOFF_HOUR: "15",
      LUCAMS_SHIPPING_ZONES: '{"11001":["chapinero","suba"],"05001":["el-poblado"]}',
    };
    getSettingValue.mockImplementation(async (k: string, fb: string) => values[k] ?? fb);
    const s = await getLucamsShippingSettings();
    expect(s).toEqual({
      enabled: true,
      priceCop: 750_000,
      cutoffHour: 15,
      zones: { "11001": ["chapinero", "suba"], "05001": ["el-poblado"] },
    });
  });

  it("migra el formato V1 (LUCAMS_SHIPPING_LOCALITIES, array plano) a { '11001': [...] }", async () => {
    const values: Record<string, string> = {
      LUCAMS_SHIPPING_ENABLED: "true",
      LUCAMS_SHIPPING_LOCALITIES: '["chapinero","usaquen"]',
    };
    getSettingValue.mockImplementation(async (k: string, fb: string) => values[k] ?? fb);
    const s = await getLucamsShippingSettings();
    expect(s.enabled).toBe(true);
    expect(s.zones).toEqual({ "11001": ["chapinero", "usaquen"] });
  });

  it("V2 tiene precedencia sobre V1 si ambas existen", async () => {
    const values: Record<string, string> = {
      LUCAMS_SHIPPING_ZONES: '{"11001":["suba"]}',
      LUCAMS_SHIPPING_LOCALITIES: '["chapinero"]',
    };
    getSettingValue.mockImplementation(async (k: string, fb: string) => values[k] ?? fb);
    const s = await getLucamsShippingSettings();
    expect(s.zones).toEqual({ "11001": ["suba"] });
  });

  it("valores corruptos caen a los defaults (no rompen el checkout)", async () => {
    const values: Record<string, string> = {
      LUCAMS_SHIPPING_ENABLED: "true",
      LUCAMS_SHIPPING_PRICE_COP: "no-es-numero",
      LUCAMS_SHIPPING_CUTOFF_HOUR: "99",
      LUCAMS_SHIPPING_ZONES: "{json roto",
      LUCAMS_SHIPPING_LOCALITIES: "{tambien roto",
    };
    getSettingValue.mockImplementation(async (k: string, fb: string) => values[k] ?? fb);
    const s = await getLucamsShippingSettings();
    expect(s.enabled).toBe(true);
    expect(s.priceCop).toBe(LUCAMS_SHIPPING_DEFAULTS.priceCop);
    expect(s.cutoffHour).toBe(LUCAMS_SHIPPING_DEFAULTS.cutoffHour);
    expect(s.zones).toEqual({});
  });

  it("LUCAMS_SHIPPING_ZONES ignora entradas malformadas (cityCode no-DANE, ids no-array)", async () => {
    const values: Record<string, string> = {
      LUCAMS_SHIPPING_ZONES: '{"11001":["chapinero",7,""],"abc":["x"],"05001":"no-array"}',
    };
    getSettingValue.mockImplementation(async (k: string, fb: string) => values[k] ?? fb);
    const s = await getLucamsShippingSettings();
    expect(s.zones).toEqual({ "11001": ["chapinero"] });
  });
});

describe("countEnabledZones", () => {
  it("suma las zonas de todas las ciudades", () => {
    expect(countEnabledZones({})).toBe(0);
    expect(countEnabledZones({ "11001": ["a", "b"], "05001": ["c"] })).toBe(3);
  });
});

describe("getDisabledCarriersNormalized", () => {
  it("sin setting → todas habilitadas ([])", async () => {
    getSettingValue.mockImplementation(async (_k: string, fb: string) => fb);
    expect(await getDisabledCarriersNormalized()).toEqual([]);
  });

  it("normaliza los nombres igual que el provider (lowercase, sin tildes/espacios)", async () => {
    getSettingValue.mockImplementation(async () => '["COORDINADORA MERCANTIL","TCC SA"]');
    expect(await getDisabledCarriersNormalized()).toEqual(["coordinadoramercantil", "tccsa"]);
  });

  it("JSON inválido → [] (fail-safe)", async () => {
    getSettingValue.mockImplementation(async () => "no-json");
    expect(await getDisabledCarriersNormalized()).toEqual([]);
  });
});

describe("normalizeCarrierKey", () => {
  it("colapsa formato (mayúsculas, espacios, guiones, tildes)", () => {
    expect(normalizeCarrierKey("COORDINADORA MERCANTIL")).toBe("coordinadoramercantil");
    expect(normalizeCarrierKey("coordinadora-mercantil")).toBe("coordinadoramercantil");
    expect(normalizeCarrierKey("Servientrega")).toBe("servientrega");
  });
});
