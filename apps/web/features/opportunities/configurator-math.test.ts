import { describe, expect, it } from "vitest";
import {
  computeConfiguratorEstimate,
  computeProposalMarginSummary,
  countColombianBusinessDaysBetween,
  evaluateEventDateFeasibility,
  piecesPerCommercialUnit,
  type ConfiguratorCatalogPayload,
} from "./configurator-math";

const SAMPLE_CATALOG: ConfiguratorCatalogPayload = {
  products: [
    {
      id: "prod_polaroid",
      slug: "set-fotoimanes-polaroid",
      name: "Set Fotoimanes Polaroid",
      categoryName: "Fotoimanes",
      imageUrl: null,
      productionDays: 2,
      variants: [
        {
          id: "var_pol_6",
          name: "Pack × 6 · 7×9 cm · Con imán",
          sku: "POL-6",
          unitPriceCents: 3_600_000, // $36.000 COP el pack de 6
          piecesPerUnit: 6,
          magnet: true,
          sizeCm: "7x9",
        },
      ],
    },
    {
      id: "prod_cal",
      slug: "calendario-magnetico",
      name: "Calendario Magnético",
      categoryName: "Calendarios",
      imageUrl: null,
      productionDays: 3,
      variants: [
        {
          id: "var_cal_1",
          name: "Set 12 meses · Con imán",
          sku: "CAL-1",
          unitPriceCents: 4_500_000, // $45.000 COP
          piecesPerUnit: 1,
          magnet: true,
          sizeCm: "10x15",
        },
        {
          id: "var_cal_nomag",
          name: "Set 12 meses · Sin imán",
          sku: "CAL-1-NOMAG",
          unitPriceCents: 4_000_000,
          piecesPerUnit: 1,
          magnet: false,
          sizeCm: "10x15",
        },
      ],
    },
  ],
  tiers: [
    {
      productId: "prod_polaroid",
      variantId: null,
      minQty: 4,
      unitPrice: 3_200_000, // $32.000 COP desde 4 packs
      isActive: true,
      deletedAt: null,
    },
  ],
};

describe("configurator-math (ADR-210)", () => {
  it("traduce packs de 6 imanes a piezas físicas reales y aplica escala mayorista", () => {
    expect(piecesPerCommercialUnit({ quantity: 6, photoSlots: 6 })).toBe(6);
    expect(piecesPerCommercialUnit({ photoSlots: 4 })).toBe(1);

    const est = computeConfiguratorEstimate(
      SAMPLE_CATALOG,
      [
        { productId: "prod_polaroid", variantId: "var_pol_6", commercialQty: 5 }, // 30 imanes
        { productId: "prod_cal", variantId: "var_cal_nomag", commercialQty: 20 }, // 20 calendarios
      ],
      "SAME_DESIGN",
      "BULK_STANDARD",
    );

    expect(est.totalCommercialUnits).toBe(25);
    expect(est.totalPhysicalPieces).toBe(50);
    expect(est.meetsMinimumUnits).toBe(true);
    // 5 packs × $32.000 ($160.000) + 20 × $40.000 ($800.000) = $960.000 COP (96_000_000 centavos)
    expect(est.estimatedMaxCents).toBe(96_000_000);
    expect(est.estimatedMinCents).toBeLessThan(est.estimatedMaxCents);
    expect(est.estimatedMinCents).toBeGreaterThan(0);
    expect(est.hasCustomExtrasPendingQuote).toBe(false);
  });

  it("marca extras pendientes de cotizar cuando hay personalización 1 a 1 o empaque individual", () => {
    const est = computeConfiguratorEstimate(
      SAMPLE_CATALOG,
      [{ productId: "prod_cal", variantId: "var_cal_1", commercialQty: 30 }],
      "INDIVIDUAL_NOMINAL",
      "INDIVIDUAL_FAVOR",
    );
    expect(est.hasCustomExtrasPendingQuote).toBe(true);
  });

  it("descuenta fines de semana y festivos colombianos en el semáforo de fecha", () => {
    // Del viernes 2026-12-24 al lunes 2026-12-28: viernes 25 dic es festivo -> solo lunes 28 es hábil (1 día).
    expect(countColombianBusinessDaysBetween("2026-12-24", "2026-12-28")).toBe(1);

    const critical = evaluateEventDateFeasibility({
      todayIso: "2026-12-24",
      eventDateIso: "2026-12-28",
      cityCode: "05001", // Medellín
      totalPhysicalPieces: 120,
      maxBaseProductionDays: 3,
      artworkMode: "SAME_DESIGN",
      packagingType: "BULK_STANDARD",
    });
    expect(critical.state).toBe("CRITICAL_TIGHT");
    expect(critical.suggestedTaskPriority).toBe("URGENT");

    const comfortable = evaluateEventDateFeasibility({
      todayIso: "2026-11-18",
      eventDateIso: "2026-12-15",
      cityCode: "11001", // Bogotá
      totalPhysicalPieces: 60,
      maxBaseProductionDays: 2,
      artworkMode: "SAME_DESIGN",
      packagingType: "BULK_STANDARD",
    });
    expect(comfortable.state).toBe("COMFORTABLE");
    expect(comfortable.isBogota).toBe(true);
  });

  it("detecta líneas o descuentos por debajo del costo BOM en el constructor de propuestas", () => {
    const healthy = computeProposalMarginSummary({
      items: [
        {
          sku: "CAL-1",
          qty: 50,
          designUnits: 1,
          unitPriceCents: 3_500_000,
          unitCostCents: 1_500_000,
        },
      ],
      discountCents: 0,
      shippingCents: 2_000_000,
    });
    expect(healthy.hasBelowCostLine).toBe(false);
    expect(healthy.grossMarginCents).toBe(100_000_000);
    expect(healthy.totalCents).toBe(177_000_000);

    const belowCost = computeProposalMarginSummary({
      items: [
        {
          sku: "CAL-1",
          qty: 50,
          designUnits: 1,
          unitPriceCents: 1_200_000,
          unitCostCents: 1_500_000,
        },
      ],
      discountCents: 0,
      shippingCents: 0,
    });
    expect(belowCost.hasBelowCostLine).toBe(true);
    expect(belowCost.belowCostSkus).toContain("CAL-1");
  });
});
