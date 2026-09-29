/*
 * Tests del envío propio "Envío Lucam's" (mensajería interna multi-ciudad):
 * la oferta del checkout (buildLucamsOffer) — cuándo aplica, precio desde
 * settings, promesa "hoy/mañana" según la hora de Colombia vs el cutoff —
 * y el catálogo de zonas por ciudad (lib/lucams-zones.ts).
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getLucamsShippingSettings = vi.hoisted(() => vi.fn());
vi.mock("@/features/shipping/settings", () => ({
  getLucamsShippingSettings: () => getLucamsShippingSettings(),
}));

import {
  bogotaHour,
  buildLucamsOffer,
  carrierDisplayName,
  LUCAMS_CARRIER,
} from "./lucams-shipping";
import { getZone, getZoneCityByCode, LUCAMS_ZONE_CITIES } from "@/lib/lucams-zones";

const BOGOTA = "11001";

function settings(over: Partial<Record<string, unknown>> = {}) {
  return {
    enabled: true,
    priceCop: 1_000_000,
    cutoffHour: 12,
    zones: { [BOGOTA]: ["chapinero", "usaquen"] },
    ...over,
  };
}

describe("buildLucamsOffer", () => {
  it("null si el envío propio está apagado", async () => {
    getLucamsShippingSettings.mockResolvedValue(settings({ enabled: false }));
    const offer = await buildLucamsOffer({ cityCode: BOGOTA, zoneId: "chapinero" });
    expect(offer).toBeNull();
  });

  it("null si la ciudad no está en el catálogo de zonas", async () => {
    getLucamsShippingSettings.mockResolvedValue(settings());
    expect(await buildLucamsOffer({ cityCode: "05001", zoneId: "chapinero" })).toBeNull();
    expect(await buildLucamsOffer({ cityCode: "76001", zoneId: null })).toBeNull();
  });

  it("null si la ciudad está en el catálogo pero sin zonas habilitadas en settings", async () => {
    getLucamsShippingSettings.mockResolvedValue(settings({ zones: {} }));
    const offer = await buildLucamsOffer({ cityCode: BOGOTA, zoneId: "chapinero" });
    expect(offer).toBeNull();
  });

  it("null sin zona, con zona inexistente o con zona de otra ciudad", async () => {
    getLucamsShippingSettings.mockResolvedValue(settings());
    expect(await buildLucamsOffer({ cityCode: BOGOTA, zoneId: null })).toBeNull();
    expect(await buildLucamsOffer({ cityCode: BOGOTA, zoneId: "mordor" })).toBeNull();
  });

  it("null si la zona no está habilitada para esa ciudad en las settings", async () => {
    getLucamsShippingSettings.mockResolvedValue(settings({ zones: { [BOGOTA]: ["suba"] } }));
    const offer = await buildLucamsOffer({ cityCode: BOGOTA, zoneId: "chapinero" });
    expect(offer).toBeNull();
  });

  it("oferta con precio de settings y quoteId amarrado a ciudad+zona", async () => {
    getLucamsShippingSettings.mockResolvedValue(settings({ priceCop: 850_000 }));
    // 2026-09-29 14:00 UTC = 09:00 Bogotá < cutoff 12 → mismo día.
    const offer = await buildLucamsOffer(
      { cityCode: BOGOTA, zoneId: "chapinero" },
      new Date("2026-09-29T14:00:00Z"),
    );
    expect(offer).toMatchObject({
      carrier: LUCAMS_CARRIER,
      carrierName: "Envío Lucam's",
      fleteCop: 850_000,
      deliveryDays: 0,
      contraentrega: false,
      quoteId: "lucams-11001-chapinero",
    });
  });

  it("después del cutoff promete entrega mañana (deliveryDays 1)", async () => {
    getLucamsShippingSettings.mockResolvedValue(settings({ cutoffHour: 12 }));
    // 2026-09-29 18:00 UTC = 13:00 Bogotá ≥ cutoff 12 → mañana.
    const offer = await buildLucamsOffer(
      { cityCode: BOGOTA, zoneId: "usaquen" },
      new Date("2026-09-29T18:00:00Z"),
    );
    expect(offer?.deliveryDays).toBe(1);
  });
});

describe("bogotaHour", () => {
  it("convierte UTC a hora de Colombia (UTC-5)", () => {
    expect(bogotaHour(new Date("2026-09-29T14:00:00Z"))).toBe(9);
    expect(bogotaHour(new Date("2026-09-29T16:59:59Z"))).toBe(11);
    expect(bogotaHour(new Date("2026-09-29T17:00:00Z"))).toBe(12);
  });

  it("medianoche UTC sigue siendo ayer en Bogotá", () => {
    expect(bogotaHour(new Date("2026-01-01T04:30:00Z"))).toBe(23);
    expect(bogotaHour(new Date("2026-01-01T05:00:00Z"))).toBe(0);
  });
});

describe("carrierDisplayName", () => {
  it("el envío propio tiene nombre propio; los demás se capitalizan", () => {
    expect(carrierDisplayName(LUCAMS_CARRIER)).toBe("Envío Lucam's");
    expect(carrierDisplayName("tcc-sa")).toBe("Tcc Sa");
    expect(carrierDisplayName(null)).toBe("—");
  });
});

describe("catálogo de zonas (lib/lucams-zones.ts)", () => {
  it("Bogotá: las 20 localidades oficiales con ids únicos y etiqueta «Localidad»", () => {
    const bogota = getZoneCityByCode("11001");
    expect(bogota).not.toBeNull();
    expect(bogota!.zoneLabel).toBe("Localidad");
    expect(bogota!.zones).toHaveLength(20);
    expect(new Set(bogota!.zones.map((z) => z.id)).size).toBe(20);
    expect(bogota!.zones.map((z) => z.name)).toContain("Sumapáz");
  });

  it("el catálogo es una lista por ciudad (extensible a otras ciudades)", () => {
    expect(Array.isArray(LUCAMS_ZONE_CITIES)).toBe(true);
    expect(LUCAMS_ZONE_CITIES.length).toBeGreaterThanOrEqual(1);
    for (const city of LUCAMS_ZONE_CITIES) {
      expect(city.cityCode).toMatch(/^\d{5}$/);
      expect(city.zoneLabel.length).toBeGreaterThan(0);
      expect(city.zones.length).toBeGreaterThan(0);
    }
  });

  it("getZone valida la zona DENTRO de su ciudad", () => {
    expect(getZone("11001", "chapinero")?.name).toBe("Chapinero");
    expect(getZone("11001", "mordor")).toBeNull();
    expect(getZone("05001", "chapinero")).toBeNull();
    expect(getZoneCityByCode("05001")).toBeNull();
  });
});
