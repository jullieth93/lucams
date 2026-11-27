/*
 * Test puro de las agregaciones de features/finanzas/service.ts.
 *
 * Sin DB: las funciones reciben filas (RevenueRow) y el rango ya resuelto.
 * Lo que se fija acá es el criterio de la ventana (Nd vs mes), el relleno
 * de buckets vacíos (días sin ventas = barra en cero) y la matemática de
 * AOV / participación por método de pago.
 */

import { describe, expect, it } from "vitest";
import type { RevenueRow } from "./service";
import {
  aggregateByPaymentMethod,
  aggregateRevenueBuckets,
  buildAccountingOrdersCsv,
  computeAov,
  computeNetCollectedRevenue,
  pctChange,
  resolvePeriodRange,
} from "./service";

const NOW = new Date("2026-09-18T15:30:00.000-05:00"); // 18 sep 2026, 15:30 hora Colombia (-05:00)

function row(total: number, createdAt: Date, paymentMethod: "WOMPI" | "COD" = "WOMPI"): RevenueRow {
  return { total, paymentMethod, createdAt };
}

describe("resolvePeriodRange", () => {
  it("7d arranca hace 6 días a las 00:00 hora Colombia (-05:00) — 7 buckets incluyendo hoy", () => {
    const range = resolvePeriodRange("7d", NOW);
    expect(range.from).toEqual(new Date("2026-09-12T00:00:00.000-05:00"));
    expect(range.to).toBe(NOW);
    expect(range.bucket).toBe("day");
    // Ventana anterior: los 7 días previos, pegada a la actual.
    expect(range.previousTo).toEqual(range.from);
    expect(range.previousFrom).toEqual(new Date("2026-09-05T00:00:00.000-05:00"));
  });

  it("30d arranca hace 29 días a las 00:00 COT, incluido el cambio de año Bogotá", () => {
    const range = resolvePeriodRange("30d", new Date("2027-01-01T02:00:00.000Z"));
    expect(range.from).toEqual(new Date("2026-12-02T05:00:00.000Z"));
    expect(range.to).toEqual(new Date("2027-01-01T02:00:00.000Z"));
  });

  it("90d usa buckets semanales", () => {
    expect(resolvePeriodRange("90d", NOW).bucket).toBe("week");
  });

  it("mes va del 1.º a las 00:00 COT a hoy y el anterior es el mes calendario completo en COT", () => {
    const range = resolvePeriodRange("mes", NOW);
    expect(range.from).toEqual(new Date("2026-09-01T00:00:00.000-05:00"));
    expect(range.previousFrom).toEqual(new Date("2026-08-01T00:00:00.000-05:00"));
    expect(range.previousTo).toEqual(new Date("2026-09-01T00:00:00.000-05:00"));
  });
});

describe("aggregateRevenueBuckets", () => {
  it("suma por día calendario Colombia (-05:00) y rellena con cero los días sin ventas", () => {
    const range = resolvePeriodRange("7d", NOW);
    const buckets = aggregateRevenueBuckets(
      [
        row(100_00, new Date("2026-09-12T10:00:00.000-05:00")),
        row(50_00, new Date("2026-09-12T21:30:00.000-05:00")), // 02:30Z del 13 sep → sigue siendo 12 sep en Bogotá
        row(200_00, new Date("2026-09-18T09:00:00.000-05:00")),
      ],
      range,
    );
    expect(buckets).toHaveLength(7);
    expect(buckets[0]).toMatchObject({ totalCents: 150_00, count: 2 });
    // Días intermedios sin ventas quedan presentes en cero.
    expect(buckets.slice(1, 6).every((b) => b.totalCents === 0 && b.count === 0)).toBe(true);
    expect(buckets[6]).toMatchObject({ totalCents: 200_00, count: 1 });
  });

  it("ignora filas fuera de la ventana (anteriores al from)", () => {
    const range = resolvePeriodRange("7d", NOW);
    const buckets = aggregateRevenueBuckets(
      [row(999_00, new Date("2026-09-01T10:00:00.000-05:00"))],
      range,
    );
    expect(buckets.reduce((acc, b) => acc + b.totalCents, 0)).toBe(0);
  });

  it("90d produce buckets semanales contiguos (~13)", () => {
    const range = resolvePeriodRange("90d", NOW);
    const buckets = aggregateRevenueBuckets([], range);
    expect(buckets.length).toBeGreaterThanOrEqual(13);
    expect(buckets.length).toBeLessThanOrEqual(14);
    const first = buckets[0].start;
    expect(buckets[1].start.getTime() - first.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("aggregateByPaymentMethod", () => {
  it("totales, conteos y porcentajes por método, ordenados por monto", () => {
    const aggs = aggregateByPaymentMethod([
      row(300_00, new Date(), "WOMPI"),
      row(100_00, new Date(), "COD"),
      row(100_00, new Date(), "COD"),
    ]);
    expect(aggs).toEqual([
      { method: "WOMPI", totalCents: 300_00, count: 1, pct: 60 },
      { method: "COD", totalCents: 200_00, count: 2, pct: 40 },
    ]);
  });

  it("sin filas devuelve lista vacía (la página muestra estado vacío)", () => {
    expect(aggregateByPaymentMethod([])).toEqual([]);
  });
});

describe("computeAov / pctChange", () => {
  it("AOV = promedio redondeado en centavos; 0 sin pedidos", () => {
    expect(computeAov([])).toBe(0);
    expect(computeAov([row(100_00, NOW), row(200_01, NOW)])).toBe(150_01);
  });

  it("pctChange calcula la variación y devuelve null sin base anterior", () => {
    expect(pctChange(110, 100)).toBe(10);
    expect(pctChange(90, 100)).toBe(-10);
    expect(pctChange(100, 0)).toBeNull();
  });
});

describe("computeNetCollectedRevenue ([FIN-01])", () => {
  it("resta retractos reembolsados y faltantes COD del bruto cobrado", () => {
    expect(
      computeNetCollectedRevenue({
        wompiCollectedCents: 12_000_000,
        codDeliveredCents: 4_000_000,
        codShortfallCents: 500_000,
        retractRefundedCents: 2_500_000,
      }),
    ).toEqual({
      grossCollectedCents: 16_000_000,
      codShortfallCents: 500_000,
      retractRefundedCents: 2_500_000,
      warrantyRefundedCents: 0,
      withholdingCents: 0,
      totalDeductionsCents: 3_000_000,
      netCollectedCents: 13_000_000,
    });

    expect(
      computeNetCollectedRevenue({
        wompiCollectedCents: 10_000_000,
        directTransferCollectedCents: 5_000_000,
        codDeliveredCents: 0,
        codShortfallCents: 0,
        retractRefundedCents: 0,
        warrantyRefundedCents: 1_200_000,
        withholdingCents: 125_000,
      }),
    ).toEqual({
      grossCollectedCents: 15_000_000,
      codShortfallCents: 0,
      retractRefundedCents: 0,
      warrantyRefundedCents: 1_200_000,
      withholdingCents: 125_000,
      totalDeductionsCents: 1_325_000,
      netCollectedCents: 13_675_000,
    });
  });

  it("nunca produce un ingreso neto negativo", () => {
    const res = computeNetCollectedRevenue({
      wompiCollectedCents: 1_000_000,
      codDeliveredCents: 0,
      codShortfallCents: 0,
      retractRefundedCents: 1_500_000,
    });
    expect(res.netCollectedCents).toBe(0);
  });
});

describe("buildAccountingOrdersCsv — A1 redacción selectiva de PII preservando campos DIAN", () => {
  it("enmascara email_comprador cuando redactBuyerEmail=true y conserva datos fiscales DIAN", () => {
    const sample = [
      {
        number: "LCM-2026-0500",
        createdAt: new Date("2026-09-18T14:00:00.000-05:00"),
        status: "PAID" as const,
        paymentMethod: "WOMPI" as const,
        subtotalCents: 5_000_000,
        discountCents: 0,
        loyaltyDiscountCents: 0,
        shippingCents: 0,
        taxCents: 0,
        totalCents: 5_000_000,
        retractRefundedCents: 0,
        wompiReference: "LCM-2026-0500",
        wompiTransactionId: "tx_500",
        codStatus: null,
        codRemittedCents: null,
        billingDocumentType: "NIT" as const,
        billingDocumentNumber: "901234567-8",
        billingName: "Inversiones Andinas SAS",
        dianStatus: "ACCEPTED" as const,
        dianCufe: "cufe_abc_123",
        email: "comprador@empresa.co",
      },
    ];

    const redacted = buildAccountingOrdersCsv(sample, { redactBuyerEmail: true });
    expect(redacted).not.toContain("comprador@empresa.co");
    expect(redacted).toContain("NIT");
    expect(redacted).toContain("901234567-8");
    expect(redacted).toContain("Inversiones Andinas SAS");
    expect(redacted).toContain("cufe_abc_123");

    const full = buildAccountingOrdersCsv(sample, { redactBuyerEmail: false });
    expect(full).toContain("comprador@empresa.co");
  });

  it("incluye columna reembolso_garantia_cop y descuenta garantías del total_neto_cop", () => {
    const csv = buildAccountingOrdersCsv([
      {
        number: "LCM-2026-0501",
        createdAt: new Date("2026-09-18T14:00:00.000-05:00"),
        status: "DELIVERED" as const,
        paymentMethod: "WOMPI" as const,
        subtotalCents: 10_000_000,
        discountCents: 0,
        loyaltyDiscountCents: 0,
        shippingCents: 0,
        taxCents: 0,
        totalCents: 10_000_000,
        retractRefundedCents: 1_000_000,
        warrantyRefundedCents: 2_500_000,
        wompiReference: "LCM-2026-0501",
        wompiTransactionId: "tx_501",
        codStatus: null,
        codRemittedCents: null,
        billingDocumentType: null,
        billingDocumentNumber: null,
        billingName: null,
        dianStatus: "NOT_REQUIRED" as const,
        dianCufe: null,
        email: "cliente@lucams.test",
      },
    ]);
    const [headerLine, dataLine] = csv
      .replace(/^\uFEFF/, "")
      .trim()
      .split("\r\n");
    const headers = headerLine.split(",");
    const values = dataLine.split(",");
    expect(headers).toContain("reembolso_garantia_cop");
    expect(values[headers.indexOf("total_bruto_cop")]).toBe("100000");
    expect(values[headers.indexOf("reembolso_retracto_cop")]).toBe("10000");
    expect(values[headers.indexOf("reembolso_garantia_cop")]).toBe("25000");
    expect(values[headers.indexOf("total_neto_cop")]).toBe("65000");
  });
});
