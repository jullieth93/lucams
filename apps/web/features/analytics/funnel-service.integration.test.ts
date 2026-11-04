/*
 * Integración con Postgres — `recordFunnelEvents` + `getFunnelDashboardReport` ([ANA-01], S07).
 *
 * Certifica:
 *  1. `ON CONFLICT DO UPDATE` atómico y colapso de claves repetidas dentro del mismo
 *     lote (sin error Postgres `21000`).
 *  2. Cálculo exacto de las 11 etapas del embudo, principal cuello de botella,
 *     salud de subida/finalizado del Estudio con desglose de errores y filtros
 *     combinados por dispositivo, superficie y producto.
 */

import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getFunnelDashboardReport, recordFunnelEvents } from "./funnel-service";

const hasDb = Boolean(process.env.DATABASE_URL);
const TEST_PRODUCT_SLUG = "it-funnel-polaroid-test";
const FIXED_NOW = new Date("2026-11-04T15:00:00.000Z"); // 2026-11-04 en Bogotá

describe.skipIf(!hasDb)("FunnelEventDaily — ingesta atómica y reporte de embudo", () => {
  afterEach(async () => {
    await prisma.funnelEventDaily.deleteMany({
      where: {
        OR: [
          { productSlug: TEST_PRODUCT_SLUG },
          {
            day: new Date("2099-01-15T00:00:00.000Z"),
          },
        ],
      },
    });
  });

  it("colapsa duplicados en un mismo lote e incrementa de forma atómica en corridas sucesivas", async () => {
    const isolatedDate = new Date("2099-01-15T16:00:00.000Z");

    const distinctKeys = await recordFunnelEvents(
      [
        {
          eventName: "studio_open",
          productSlug: TEST_PRODUCT_SLUG,
          editorKind: "photo",
          deviceCategory: "mobile",
          errorCode: "",
        },
        {
          eventName: "studio_open",
          productSlug: TEST_PRODUCT_SLUG,
          editorKind: "photo",
          deviceCategory: "mobile",
          errorCode: "",
        },
      ],
      { now: isolatedDate },
    );
    expect(distinctKeys).toBe(1);

    await recordFunnelEvents(
      [
        {
          eventName: "studio_open",
          productSlug: TEST_PRODUCT_SLUG,
          editorKind: "photo",
          deviceCategory: "mobile",
          errorCode: "",
        },
      ],
      { now: isolatedDate },
    );

    const row = await prisma.funnelEventDaily.findFirst({
      where: {
        productSlug: TEST_PRODUCT_SLUG,
        eventName: "studio_open",
      },
    });
    expect(row?.count).toBe(3);
  });

  it("calcula conversión por etapa, cuello de botella y desglose de errores del Estudio filtrados por producto", async () => {
    const batch = [
      ...Array.from({ length: 10 }, () => ({
        eventName: "product_view" as const,
        productSlug: TEST_PRODUCT_SLUG,
        editorKind: "photo" as const,
        deviceCategory: "mobile" as const,
        errorCode: "" as const,
      })),
      ...Array.from({ length: 8 }, () => ({
        eventName: "studio_open" as const,
        productSlug: TEST_PRODUCT_SLUG,
        editorKind: "photo" as const,
        deviceCategory: "mobile" as const,
        errorCode: "" as const,
      })),
      ...Array.from({ length: 7 }, () => ({
        eventName: "studio_template_select" as const,
        productSlug: TEST_PRODUCT_SLUG,
        editorKind: "photo" as const,
        deviceCategory: "mobile" as const,
        errorCode: "" as const,
      })),
      ...Array.from({ length: 6 }, () => ({
        eventName: "studio_asset_upload_succeeded" as const,
        productSlug: TEST_PRODUCT_SLUG,
        editorKind: "photo" as const,
        deviceCategory: "mobile" as const,
        errorCode: "" as const,
      })),
      ...Array.from({ length: 2 }, () => ({
        eventName: "studio_asset_upload_failed" as const,
        productSlug: TEST_PRODUCT_SLUG,
        editorKind: "photo" as const,
        deviceCategory: "mobile" as const,
        errorCode: "low_quality" as const,
      })),
      ...Array.from({ length: 2 }, () => ({
        eventName: "studio_preview_open" as const,
        productSlug: TEST_PRODUCT_SLUG,
        editorKind: "photo" as const,
        deviceCategory: "mobile" as const,
        errorCode: "" as const,
      })),
      ...Array.from({ length: 2 }, () => ({
        eventName: "studio_finalize_succeeded" as const,
        productSlug: TEST_PRODUCT_SLUG,
        editorKind: "photo" as const,
        deviceCategory: "mobile" as const,
        errorCode: "" as const,
      })),
      {
        eventName: "studio_finalize_failed" as const,
        productSlug: TEST_PRODUCT_SLUG,
        editorKind: "photo" as const,
        deviceCategory: "mobile" as const,
        errorCode: "master_expired" as const,
      },
      ...Array.from({ length: 2 }, () => ({
        eventName: "cart_add" as const,
        productSlug: TEST_PRODUCT_SLUG,
        editorKind: "photo" as const,
        deviceCategory: "mobile" as const,
        errorCode: "" as const,
      })),
      ...Array.from({ length: 2 }, () => ({
        eventName: "checkout_begin" as const,
        productSlug: TEST_PRODUCT_SLUG,
        editorKind: "photo" as const,
        deviceCategory: "mobile" as const,
        errorCode: "" as const,
      })),
      ...Array.from({ length: 2 }, () => ({
        eventName: "checkout_shipping_selected" as const,
        productSlug: TEST_PRODUCT_SLUG,
        editorKind: "photo" as const,
        deviceCategory: "mobile" as const,
        errorCode: "" as const,
      })),
      ...Array.from({ length: 2 }, () => ({
        eventName: "checkout_payment_submitted" as const,
        productSlug: TEST_PRODUCT_SLUG,
        editorKind: "photo" as const,
        deviceCategory: "mobile" as const,
        errorCode: "" as const,
      })),
      {
        eventName: "purchase_completed" as const,
        productSlug: TEST_PRODUCT_SLUG,
        editorKind: "photo" as const,
        deviceCategory: "mobile" as const,
        errorCode: "" as const,
      },
    ];

    await recordFunnelEvents(batch, { now: FIXED_NOW });

    const report = await getFunnelDashboardReport(
      {
        days: 7,
        deviceCategory: "mobile",
        editorKind: "photo",
        productSlug: TEST_PRODUCT_SLUG,
      },
      FIXED_NOW,
    );

    expect(report.hasData).toBe(true);
    expect(report.stages).toHaveLength(11);
    expect(report.stages[0]).toMatchObject({ eventName: "product_view", count: 10 });
    expect(report.stages[10]).toMatchObject({
      eventName: "purchase_completed",
      count: 1,
      overallConversionPct: 10,
    });

    // Mayor caída con base >= 3: de studio_asset_upload_succeeded (6) a studio_preview_open (2) = 66.7%
    expect(report.bottleneck).toMatchObject({
      fromCount: 6,
      toCount: 2,
      dropOffPct: 66.7,
    });

    expect(report.uploadHealth).toMatchObject({
      succeeded: 6,
      failed: 2,
      totalAttempts: 8,
      successRatePct: 75,
    });
    expect(report.uploadHealth.errors[0]).toMatchObject({
      errorCode: "low_quality",
      count: 2,
      pct: 100,
    });

    expect(report.finalizeHealth).toMatchObject({
      succeeded: 2,
      failed: 1,
      totalAttempts: 3,
      successRatePct: 66.7,
    });
    expect(report.finalizeHealth.errors[0]).toMatchObject({
      errorCode: "master_expired",
      count: 1,
    });

    // Filtro en dispositivo sin actividad → hasData: false
    const emptyDesktop = await getFunnelDashboardReport(
      {
        days: 7,
        deviceCategory: "desktop",
        editorKind: "photo",
        productSlug: TEST_PRODUCT_SLUG,
      },
      FIXED_NOW,
    );
    expect(emptyDesktop.hasData).toBe(false);
  });
});
