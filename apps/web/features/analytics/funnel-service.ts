/*
 * Servicio server-side del embudo anónimo tienda + Estudio ([ANA-01], Fase 2).
 *
 * Responsabilidades:
 *   1. `recordFunnelEvents`: incremento atómico (`ON CONFLICT DO UPDATE`) en
 *      `FunnelEventDaily`, colapsando duplicados dentro del mismo lote para evitar
 *      el error Postgres `21000` ("cannot affect row a second time").
 *   2. `getFunnelDashboardReport`: consulta agregada en vivo para `/admin/metricas`
 *      respondiendo las 12 preguntas del embudo (pasos, tasa de paso y acumulada,
 *      principal cuello de botella, salud de subida/finalizado del Estudio con
 *      desglose de errores, comparativa por dispositivo y por producto/editor).
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import {
  bogotaDayUtcDate,
  FUNNEL_ALL_PRODUCTS_SLUG,
  type FunnelDeviceCategory,
  type FunnelEditorKind,
  type FunnelErrorCode,
  type FunnelEventName,
  type FunnelSingleEventInput,
} from "./funnel-schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ResolvedFunnelEvent = {
  eventName: FunnelEventName;
  productSlug: string;
  editorKind: FunnelEditorKind;
  deviceCategory: FunnelDeviceCategory;
  errorCode: FunnelErrorCode;
};

/**
 * Incrementa de forma atómica los contadores diarios anónimos.
 * No lee ni persiste cookies, IP, `sessionId` ni `customerId`.
 */
export async function recordFunnelEvents(
  events: readonly (FunnelSingleEventInput & { deviceCategory: FunnelDeviceCategory })[],
  opts?: { now?: Date },
): Promise<number> {
  if (events.length === 0) return 0;

  const day = bogotaDayUtcDate(opts?.now ?? new Date());
  const grouped = new Map<string, ResolvedFunnelEvent & { increment: number }>();

  for (const ev of events) {
    const key = [
      ev.eventName,
      ev.productSlug,
      ev.editorKind,
      ev.deviceCategory,
      ev.errorCode ?? "",
    ].join("|");
    const existing = grouped.get(key);
    if (existing) {
      existing.increment += 1;
    } else {
      grouped.set(key, {
        eventName: ev.eventName,
        productSlug: ev.productSlug,
        editorKind: ev.editorKind,
        deviceCategory: ev.deviceCategory,
        errorCode: ev.errorCode ?? "",
        increment: 1,
      });
    }
  }

  const valuesSql = [...grouped.values()].map(
    (row) =>
      Prisma.sql`(${randomUUID()}, ${day}::date, ${row.eventName}, ${row.productSlug}, ${row.editorKind}, ${row.deviceCategory}, ${row.errorCode}, ${row.increment}, NOW())`,
  );

  await prisma.$executeRaw`
    INSERT INTO "FunnelEventDaily" (
      "id",
      "day",
      "eventName",
      "productSlug",
      "editorKind",
      "deviceCategory",
      "errorCode",
      "count",
      "updatedAt"
    )
    VALUES ${Prisma.join(valuesSql)}
    ON CONFLICT ("day", "eventName", "productSlug", "editorKind", "deviceCategory", "errorCode")
    DO UPDATE SET
      "count" = "FunnelEventDaily"."count" + EXCLUDED."count",
      "updatedAt" = NOW()
  `;

  return grouped.size;
}

// ─────────────────────────────────────────────────────────────────────
// Lectura y diagnóstico para /admin/metricas
// ─────────────────────────────────────────────────────────────────────

export type FunnelFilterWindowDays = 7 | 30;

export type FunnelReportFilters = {
  days: FunnelFilterWindowDays;
  deviceCategory?: "all" | "mobile" | "tablet" | "desktop";
  editorKind?: "all" | "photo" | "name" | "letterset" | "catalog";
  productSlug?: string;
};

export type FunnelStageSummary = {
  eventName: FunnelEventName;
  label: string;
  helper: string;
  count: number;
  /** % respecto al paso inmediatamente anterior con conteo > 0 (null en el primer paso o base 0). */
  stepConversionPct: number | null;
  /** % respecto al paso raíz (`product_view`) cuando `product_view > 0`. */
  overallConversionPct: number | null;
  /** % de caída respecto al paso anterior (100 - stepConversionPct, acotado a 0..100). */
  dropOffPct: number | null;
  /** Solo aplica a pasos exclusivos del Estudio (se oculta/atenúa si el filtro es `catalog`). */
  studioOnly: boolean;
};

export type FunnelErrorBreakdownItem = {
  errorCode: FunnelErrorCode;
  label: string;
  count: number;
  pct: number;
};

export type FunnelOperationHealth = {
  succeeded: number;
  failed: number;
  totalAttempts: number;
  successRatePct: number | null;
  errors: FunnelErrorBreakdownItem[];
};

export type FunnelDeviceSummary = {
  deviceCategory: "mobile" | "tablet" | "desktop";
  label: string;
  productViews: number;
  studioOpens: number;
  studioFinalizes: number;
  cartAdds: number;
  purchases: number;
  studioCompletionPct: number | null;
  overallPurchasePct: number | null;
};

export type FunnelProductSummary = {
  productSlug: string;
  productName: string;
  editorKind: Exclude<FunnelEditorKind, "all">;
  editorLabel: string;
  productViews: number;
  studioOpens: number;
  uploadsSucceeded: number;
  uploadsFailed: number;
  previewsOpened: number;
  finalizesSucceeded: number;
  cartAdds: number;
  purchases: number;
  /** % de quienes abrieron el Estudio y lograron finalizar el diseño. */
  studioCompletionPct: number | null;
  /** % de abandono dentro del Estudio (`100 - studioCompletionPct`). */
  studioDropOffPct: number | null;
};

export type FunnelBottleneckCallout = {
  fromLabel: string;
  toLabel: string;
  fromCount: number;
  toCount: number;
  dropOffPct: number;
  recommendation: string;
};

export type FunnelDashboardReport = {
  windowDays: FunnelFilterWindowDays;
  totalEventsRecorded: number;
  hasData: boolean;
  stages: FunnelStageSummary[];
  bottleneck: FunnelBottleneckCallout | null;
  uploadHealth: FunnelOperationHealth;
  finalizeHealth: FunnelOperationHealth;
  byDevice: FunnelDeviceSummary[];
  byProduct: FunnelProductSummary[];
  availableProducts: Array<{ slug: string; name: string }>;
};

const ERROR_CODE_LABELS: Record<FunnelErrorCode, string> = {
  "": "Sin código específico",
  too_big: "Archivo demasiado pesado o HEIC sin decodificar",
  network: "Conexión inestable o tiempo de espera agotado",
  server_rejected: "Formato no admitido o límite de subidas",
  low_quality: "Resolución insuficiente para impresión 300 DPI",
  master_expired: "URL temporal expirada en sesión larga",
  server_crash: "Tiempo límite o memoria del servidor al exportar",
  validation: "Diseño incompleto o validación rechazada",
  cart_add_failed: "Stock agotado o fallo al pasar al carrito",
};

export const EDITOR_KIND_LABELS: Record<Exclude<FunnelEditorKind, "all">, string> = {
  photo: "Estudio de fotos",
  name: "Nombre en fichas",
  letterset: "Abecedario / Vocales",
  catalog: "Catálogo directo",
};

const DEVICE_LABELS: Record<"mobile" | "tablet" | "desktop", string> = {
  mobile: "Celular",
  tablet: "Tablet",
  desktop: "Computador",
};

const ORDERED_STAGE_SPECS: ReadonlyArray<{
  eventName: FunnelEventName;
  label: string;
  helper: string;
  studioOnly: boolean;
  sessionLevelWhenUnfiltered: boolean;
  dropRecommendation: string;
}> = [
  {
    eventName: "product_view",
    label: "1. Ven la ficha del producto",
    helper: "Visitas reales a páginas de producto (PDP).",
    studioOnly: false,
    sessionLevelWhenUnfiltered: false,
    dropRecommendation:
      "Revisa claridad de fotos principales, precio visible y llamado a personalizar en la ficha.",
  },
  {
    eventName: "studio_open",
    label: "2. Abren el Estudio",
    helper: "Entran a personalizar fotos, nombres o sets de letras.",
    studioOnly: true,
    sessionLevelWhenUnfiltered: false,
    dropRecommendation:
      "Destaca qué tan rápido se personaliza en celular y muestra ejemplos reales antes de abrir el Estudio.",
  },
  {
    eventName: "studio_template_select",
    label: "3. Eligen plantilla o estilo",
    helper: "Seleccionan diseño base cuando el producto ofrece varias opciones.",
    studioOnly: true,
    sessionLevelWhenUnfiltered: false,
    dropRecommendation:
      "Simplifica los nombres de plantillas y asegúrate de que la vista previa inicial guíe la elección.",
  },
  {
    eventName: "studio_asset_upload_succeeded",
    label: "4. Suben fotos con éxito",
    helper: "Fotos cargadas y validadas en la galería del Estudio.",
    studioOnly: true,
    sessionLevelWhenUnfiltered: false,
    dropRecommendation:
      "Revisa la tarjeta «Salud de subida de fotos» abajo: formatos HEIC pesados o red móvil lenta frenan este paso.",
  },
  {
    eventName: "studio_preview_open",
    label: "5. Abren «Ver diseño»",
    helper: "Revisan la vista previa final antes de confirmar.",
    studioOnly: true,
    sessionLevelWhenUnfiltered: false,
    dropRecommendation:
      "Muchos usuarios no completan todos los espacios de foto; verifica si el pack exige demasiadas fotos en móvil.",
  },
  {
    eventName: "studio_finalize_succeeded",
    label: "6. Finalizan el diseño",
    helper: "Aprueban el diseño y generan los archivos listos para taller.",
    studioOnly: true,
    sessionLevelWhenUnfiltered: false,
    dropRecommendation:
      "Revisa errores de exportación o dudas de último minuto en la modal de confirmación del Estudio.",
  },
  {
    eventName: "cart_add",
    label: "7. Agregan al carrito",
    helper: "Líneas personalizadas o de catálogo agregadas al carrito.",
    studioOnly: false,
    sessionLevelWhenUnfiltered: false,
    dropRecommendation:
      "Verifica disponibilidad de stock por variante y claridad del resumen al entrar al carrito.",
  },
  {
    eventName: "checkout_begin",
    label: "8. Inician el checkout",
    helper: "Avanzan desde el carrito al paso 1 (Datos y dirección).",
    studioOnly: false,
    sessionLevelWhenUnfiltered: true,
    dropRecommendation:
      "Muestra costos estimados de envío y tiempos de entrega temprano para evitar sorpresas al salir del carrito.",
  },
  {
    eventName: "checkout_shipping_selected",
    label: "9. Confirman envío",
    helper: "Eligen transportadora válida y llegan al resumen de pago.",
    studioOnly: false,
    sessionLevelWhenUnfiltered: true,
    dropRecommendation:
      "Revisa cobertura/tarifas de transportadoras y simplicidad del formulario de dirección.",
  },
  {
    eventName: "checkout_payment_submitted",
    label: "10. Confirman pago",
    helper: "Envían el formulario de pago en línea (Wompi) o contraentrega.",
    studioOnly: false,
    sessionLevelWhenUnfiltered: true,
    dropRecommendation:
      "Revisa claridad del total final con flete/descuentos y confianza visible en el paso 3 de pago.",
  },
  {
    eventName: "purchase_completed",
    label: "11. Completan la compra",
    helper: "Pedidos confirmados (pago Wompi aprobado o contraentrega confirmada).",
    studioOnly: false,
    sessionLevelWhenUnfiltered: true,
    dropRecommendation:
      "Revisa rechazos de pasarela o fricción bancaria en métodos de pago (PSE, Nequi, Tarjeta).",
  },
];

function safePct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.min(100, Math.round((numerator / denominator) * 1000) / 10);
}

function buildOperationHealth(
  succeeded: number,
  failedByCode: Map<FunnelErrorCode, number>,
): FunnelOperationHealth {
  let failed = 0;
  for (const c of failedByCode.values()) failed += c;
  const totalAttempts = succeeded + failed;
  const errors: FunnelErrorBreakdownItem[] = [...failedByCode.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([errorCode, count]) => ({
      errorCode,
      label: ERROR_CODE_LABELS[errorCode] ?? ERROR_CODE_LABELS[""],
      count,
      pct: failed > 0 ? Math.round((count / failed) * 1000) / 10 : 0,
    }));

  return {
    succeeded,
    failed,
    totalAttempts,
    successRatePct: safePct(succeeded, totalAttempts),
    errors,
  };
}

export async function getFunnelDashboardReport(
  filters: FunnelReportFilters,
  now: Date = new Date(),
): Promise<FunnelDashboardReport> {
  const todayBogota = bogotaDayUtcDate(now);
  const startDay = new Date(todayBogota.getTime() - (filters.days - 1) * DAY_MS);

  const [rows, activeProducts] = await Promise.all([
    prisma.funnelEventDaily.findMany({
      where: {
        day: { gte: startDay },
      },
      select: {
        eventName: true,
        productSlug: true,
        editorKind: true,
        deviceCategory: true,
        errorCode: true,
        count: true,
      },
    }),
    prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const productNameBySlug = new Map(activeProducts.map((p) => [p.slug, p.name]));

  const deviceFilter =
    filters.deviceCategory && filters.deviceCategory !== "all" ? filters.deviceCategory : null;
  const editorFilter =
    filters.editorKind && filters.editorKind !== "all" ? filters.editorKind : null;
  const productFilter =
    filters.productSlug && filters.productSlug !== "all" ? filters.productSlug : null;
  const isScopedToProductOrEditor = Boolean(editorFilter || productFilter);

  const stageCounts = new Map<FunnelEventName, number>();
  const uploadFailures = new Map<FunnelErrorCode, number>();
  const finalizeFailures = new Map<FunnelErrorCode, number>();
  let uploadSuccessTotal = 0;
  let finalizeSuccessTotal = 0;
  let totalEventsRecorded = 0;

  // Acumuladores por dispositivo (respetan filtro de producto/editor para comparar justo).
  const deviceAcc = new Map<
    "mobile" | "tablet" | "desktop",
    {
      productViews: number;
      studioOpens: number;
      studioFinalizes: number;
      cartAdds: number;
      purchases: number;
    }
  >([
    ["mobile", { productViews: 0, studioOpens: 0, studioFinalizes: 0, cartAdds: 0, purchases: 0 }],
    ["desktop", { productViews: 0, studioOpens: 0, studioFinalizes: 0, cartAdds: 0, purchases: 0 }],
    ["tablet", { productViews: 0, studioOpens: 0, studioFinalizes: 0, cartAdds: 0, purchases: 0 }],
  ]);

  // Acumuladores por producto + tipo de editor (respetan filtro de dispositivo).
  const productAcc = new Map<
    string,
    {
      productSlug: string;
      editorKind: Exclude<FunnelEditorKind, "all">;
      productViews: number;
      studioOpens: number;
      uploadsSucceeded: number;
      uploadsFailed: number;
      previewsOpened: number;
      finalizesSucceeded: number;
      cartAdds: number;
      purchases: number;
    }
  >();

  for (const row of rows) {
    const ev = row.eventName as FunnelEventName;
    const isGlobalRow = row.productSlug === FUNNEL_ALL_PRODUCTS_SLUG;

    // 1. Tabla por dispositivo (respeta filtro de producto/editor si está activo).
    if (
      (row.deviceCategory === "mobile" ||
        row.deviceCategory === "tablet" ||
        row.deviceCategory === "desktop") &&
      (!productFilter || row.productSlug === productFilter) &&
      (!editorFilter || row.editorKind === editorFilter)
    ) {
      const bucket = deviceAcc.get(row.deviceCategory)!;
      if (!isGlobalRow) {
        if (ev === "product_view") bucket.productViews += row.count;
        if (ev === "studio_open") bucket.studioOpens += row.count;
        if (ev === "studio_finalize_succeeded") bucket.studioFinalizes += row.count;
        if (ev === "cart_add") bucket.cartAdds += row.count;
        if (isScopedToProductOrEditor && ev === "purchase_completed") {
          bucket.purchases += row.count;
        }
      } else if (!isScopedToProductOrEditor && ev === "purchase_completed") {
        bucket.purchases += row.count;
      }
    }

    // 2. Tabla por producto (solo filas reales de producto, respetando filtro de dispositivo).
    if (!isGlobalRow && (!deviceFilter || row.deviceCategory === deviceFilter)) {
      const ed: Exclude<FunnelEditorKind, "all"> =
        row.editorKind === "name" || row.editorKind === "letterset" || row.editorKind === "catalog"
          ? row.editorKind
          : "photo";
      const pKey = `${row.productSlug}|${ed}`;
      let pBucket = productAcc.get(pKey);
      if (!pBucket) {
        pBucket = {
          productSlug: row.productSlug,
          editorKind: ed,
          productViews: 0,
          studioOpens: 0,
          uploadsSucceeded: 0,
          uploadsFailed: 0,
          previewsOpened: 0,
          finalizesSucceeded: 0,
          cartAdds: 0,
          purchases: 0,
        };
        productAcc.set(pKey, pBucket);
      }
      if (ev === "product_view") pBucket.productViews += row.count;
      if (ev === "studio_open") pBucket.studioOpens += row.count;
      if (ev === "studio_asset_upload_succeeded") pBucket.uploadsSucceeded += row.count;
      if (ev === "studio_asset_upload_failed") pBucket.uploadsFailed += row.count;
      if (ev === "studio_preview_open") pBucket.previewsOpened += row.count;
      if (ev === "studio_finalize_succeeded") pBucket.finalizesSucceeded += row.count;
      if (ev === "cart_add") pBucket.cartAdds += row.count;
      if (ev === "purchase_completed") pBucket.purchases += row.count;
    }

    // 3. Filtros activos para el embudo principal y tarjetas de salud del Estudio.
    if (deviceFilter && row.deviceCategory !== deviceFilter) continue;

    if (isScopedToProductOrEditor) {
      if (isGlobalRow) continue;
      if (productFilter && row.productSlug !== productFilter) continue;
      if (editorFilter && row.editorKind !== editorFilter) continue;
    } else {
      // Sin filtro de producto/editor: los pasos de sesión usan la fila `_all` (1 checkout = 1),
      // mientras que los pasos de producto/Estudio suman las filas de productos reales.
      const spec = ORDERED_STAGE_SPECS.find((s) => s.eventName === ev);
      if (spec) {
        if (spec.sessionLevelWhenUnfiltered && !isGlobalRow) continue;
        if (!spec.sessionLevelWhenUnfiltered && isGlobalRow) continue;
      } else if (isGlobalRow) {
        continue;
      }
    }

    totalEventsRecorded += row.count;
    stageCounts.set(ev, (stageCounts.get(ev) ?? 0) + row.count);

    if (ev === "studio_asset_upload_succeeded") {
      uploadSuccessTotal += row.count;
    } else if (ev === "studio_asset_upload_failed") {
      const code = (row.errorCode || "") as FunnelErrorCode;
      uploadFailures.set(code, (uploadFailures.get(code) ?? 0) + row.count);
    } else if (ev === "studio_finalize_succeeded") {
      finalizeSuccessTotal += row.count;
    } else if (ev === "studio_finalize_failed") {
      const code = (row.errorCode || "") as FunnelErrorCode;
      finalizeFailures.set(code, (finalizeFailures.get(code) ?? 0) + row.count);
    }
  }

  const applicableSpecs =
    editorFilter === "catalog"
      ? ORDERED_STAGE_SPECS.filter((s) => !s.studioOnly)
      : editorFilter === "name" || editorFilter === "letterset"
        ? ORDERED_STAGE_SPECS.filter((s) => s.eventName !== "studio_asset_upload_succeeded")
        : ORDERED_STAGE_SPECS;

  const topCount = stageCounts.get("product_view") ?? 0;
  let prevCount: number | null = null;
  let prevSpec: (typeof ORDERED_STAGE_SPECS)[number] | null = null;
  let worstBottleneck: FunnelBottleneckCallout | null = null;

  const stages: FunnelStageSummary[] = applicableSpecs.map((spec) => {
    const count = stageCounts.get(spec.eventName) ?? 0;
    const stepConversionPct =
      prevCount !== null && prevCount > 0 ? safePct(count, prevCount) : null;
    const dropOffPct =
      stepConversionPct !== null
        ? Math.max(0, Math.round((100 - stepConversionPct) * 10) / 10)
        : null;

    if (
      prevSpec &&
      prevCount !== null &&
      prevCount >= 3 &&
      dropOffPct !== null &&
      dropOffPct > 0 &&
      (!worstBottleneck || dropOffPct > worstBottleneck.dropOffPct)
    ) {
      worstBottleneck = {
        fromLabel: prevSpec.label,
        toLabel: spec.label,
        fromCount: prevCount,
        toCount: count,
        dropOffPct,
        recommendation: spec.dropRecommendation,
      };
    }

    prevCount = count;
    prevSpec = spec;

    return {
      eventName: spec.eventName,
      label: spec.label,
      helper: spec.helper,
      count,
      stepConversionPct,
      overallConversionPct: topCount > 0 ? safePct(count, topCount) : null,
      dropOffPct,
      studioOnly: spec.studioOnly,
    };
  });

  const byDevice: FunnelDeviceSummary[] = (["mobile", "desktop", "tablet"] as const).map((dev) => {
    const d = deviceAcc.get(dev)!;
    return {
      deviceCategory: dev,
      label: DEVICE_LABELS[dev],
      ...d,
      studioCompletionPct: safePct(d.studioFinalizes, d.studioOpens),
      overallPurchasePct: safePct(d.purchases, d.productViews),
    };
  });

  const byProduct: FunnelProductSummary[] = [...productAcc.values()]
    .map((p) => {
      const studioCompletionPct = safePct(p.finalizesSucceeded, p.studioOpens);
      return {
        ...p,
        productName: productNameBySlug.get(p.productSlug) ?? p.productSlug,
        editorLabel: EDITOR_KIND_LABELS[p.editorKind],
        studioCompletionPct,
        studioDropOffPct:
          studioCompletionPct !== null
            ? Math.max(0, Math.round((100 - studioCompletionPct) * 10) / 10)
            : null,
      };
    })
    .sort((a, b) => {
      const lostA = Math.max(0, a.studioOpens - a.finalizesSucceeded);
      const lostB = Math.max(0, b.studioOpens - b.finalizesSucceeded);
      if (lostB !== lostA) return lostB - lostA;
      return b.productViews - a.productViews;
    })
    .slice(0, 12);

  return {
    windowDays: filters.days,
    totalEventsRecorded,
    hasData: totalEventsRecorded > 0,
    stages,
    bottleneck: worstBottleneck,
    uploadHealth: buildOperationHealth(uploadSuccessTotal, uploadFailures),
    finalizeHealth: buildOperationHealth(finalizeSuccessTotal, finalizeFailures),
    byDevice,
    byProduct,
    availableProducts: activeProducts,
  };
}
