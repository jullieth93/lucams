/*
 * Motor puro client-safe del Configurador B2B / Eventos y calculadora de propuestas (`ADR-210`).
 *
 * Invariantes de seguridad y cumplimiento:
 *   1. CERO flotantes en importes finales: toda cifra monetaria opera en centavos COP enteros (`Int`).
 *   2. CERO exposición de costos BOM (`Product.cost`) en tipos o funciones públicas de tienda:
 *      el estimado público usa únicamente precios publicados y escalas `WholesaleTier` activas,
 *      entregando un rango orientativo no vinculante (Ley 1480 arts. 23 y 29).
 *   3. Semáforo de fecha en días hábiles reales de Colombia (`getColombianHolidaysForYear`, `UTC-5`).
 */

import { applyVolumePricing, type VolumeTierInput } from "@/features/cart/volume-pricing";
import { getColombianHolidaysForYear } from "@/lib/colombian-sla";
import { LUCAMS_ZONE_CITIES } from "@/lib/lucams-zones";
import type {
  B2bArtworkMode,
  B2bConfiguredLineInput,
  B2bConfiguredLineSnapshot,
  B2bPackagingType,
} from "./schemas";

export const MIN_B2B_PHYSICAL_UNITS = 25;

export interface ConfiguratorVariantOption {
  id: string;
  name: string;
  sku: string;
  unitPriceCents: number;
  piecesPerUnit: number;
  magnet: boolean | null;
  sizeCm: string | null;
}

export interface ConfiguratorProductOption {
  id: string;
  slug: string;
  name: string;
  categoryName: string;
  imageUrl: string | null;
  productionDays: number;
  variants: ConfiguratorVariantOption[];
}

export interface ConfiguratorCatalogPayload {
  products: ConfiguratorProductOption[];
  tiers: VolumeTierInput[];
}

export function piecesPerCommercialUnit(attributes: unknown): number {
  if (!attributes || typeof attributes !== "object") return 1;
  const rawQty = (attributes as Record<string, unknown>).quantity;
  const parsed = typeof rawQty === "number" ? rawQty : Number(rawQty);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export function extractVariantMagnet(attributes: unknown): boolean | null {
  if (!attributes || typeof attributes !== "object") return null;
  const m = (attributes as Record<string, unknown>).magnet;
  return typeof m === "boolean" ? m : null;
}

export function extractVariantSizeCm(attributes: unknown): string | null {
  if (!attributes || typeof attributes !== "object") return null;
  const s = (attributes as Record<string, unknown>).sizeCm;
  return typeof s === "string" && s.trim().length > 0 ? s.trim() : null;
}

export interface ConfiguratorEstimateResult {
  resolvedLines: B2bConfiguredLineSnapshot[];
  totalCommercialUnits: number;
  totalPhysicalPieces: number;
  meetsMinimumUnits: boolean;
  estimatedMinCents: number;
  estimatedMaxCents: number;
  hasCustomExtrasPendingQuote: boolean;
}

/**
 * Calcula el desglose físico y el rango orientativo referencial para `1..5` líneas del catálogo.
 * Evalúa la mejor escala `WholesaleTier` publicada para cada línea y proyecta una banda prudente
 * de negociación por volumen (`92 %..100 %` en `>= 100` piezas, `95 %..100 %` en `25..99` piezas),
 * redondeada a centavos enteros de `$100 COP` (`10_000` centavos) para lectura ejecutiva limpia.
 */
export function computeConfiguratorEstimate(
  catalog: ConfiguratorCatalogPayload,
  selectedLines: readonly B2bConfiguredLineInput[],
  artworkMode: B2bArtworkMode,
  packagingType: B2bPackagingType,
): ConfiguratorEstimateResult {
  const productMap = new Map(catalog.products.map((p) => [p.id, p]));
  const resolvedLines: B2bConfiguredLineSnapshot[] = [];
  let totalCommercialUnits = 0;
  let totalPhysicalPieces = 0;
  let referenceTotalCents = 0;

  for (const input of selectedLines) {
    if (input.commercialQty < 1) continue;
    const product = productMap.get(input.productId);
    if (!product) continue;
    const variant = product.variants.find((v) => v.id === input.variantId);
    if (!variant) continue;

    const qty = Math.min(100_000, Math.max(1, Math.trunc(input.commercialQty)));
    const physicalPieces = qty * variant.piecesPerUnit;
    const tierUnitCents = applyVolumePricing(
      variant.unitPriceCents,
      catalog.tiers,
      product.id,
      qty,
      1,
      variant.id,
    );

    resolvedLines.push({
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      variantId: variant.id,
      variantName: variant.name,
      sku: variant.sku,
      magnet: variant.magnet,
      commercialQty: qty,
      piecesPerUnit: variant.piecesPerUnit,
      physicalPieces,
      indicativeUnitCents: tierUnitCents,
    });

    totalCommercialUnits += qty;
    totalPhysicalPieces += physicalPieces;
    referenceTotalCents += tierUnitCents * qty;
  }

  const meetsMinimumUnits = totalPhysicalPieces >= MIN_B2B_PHYSICAL_UNITS;
  const lowerFactorBps =
    totalPhysicalPieces >= 250 ? 9000 : totalPhysicalPieces >= 100 ? 9200 : 9500;
  const rawMinCents = Math.floor((referenceTotalCents * lowerFactorBps) / 10_000);
  // Redondeo limpio al múltiplo de $100 COP (10.000 centavos) sin exceder el tope de referencia.
  const roundedMinCents =
    referenceTotalCents >= 100_000
      ? Math.min(referenceTotalCents, Math.floor(rawMinCents / 10_000) * 10_000)
      : rawMinCents;

  const hasCustomExtrasPendingQuote =
    artworkMode === "INDIVIDUAL_NOMINAL" ||
    artworkMode === "CREATIVE_ASSISTANCE" ||
    packagingType !== "BULK_STANDARD";

  return {
    resolvedLines,
    totalCommercialUnits,
    totalPhysicalPieces,
    meetsMinimumUnits,
    estimatedMinCents: Math.max(0, roundedMinCents),
    estimatedMaxCents: Math.max(0, referenceTotalCents),
    hasCustomExtrasPendingQuote,
  };
}

export type EventDateSemaphoreState =
  "UNSET" | "PAST" | "CRITICAL_TIGHT" | "URGENT_VIABLE" | "COMFORTABLE";

export interface EventDateFeasibility {
  state: EventDateSemaphoreState;
  businessDaysAvailable: number | null;
  recommendedMinBusinessDays: number;
  isBogota: boolean;
  headline: string;
  detail: string;
  suggestedTaskPriority: "HIGH" | "URGENT";
}

function parseIsoYmdUtc(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

function formatUtcYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Cuenta días hábiles colombianos estrictos (lunes a viernes, excluyendo festivos Ley Emiliani)
 * posteriores a `fromIso` y hasta `toIso` inclusive.
 */
export function countColombianBusinessDaysBetween(fromIso: string, toIso: string): number | null {
  const start = parseIsoYmdUtc(fromIso);
  const end = parseIsoYmdUtc(toIso);
  if (!start || !end) return null;
  if (end.getTime() < start.getTime()) return -1;
  if (end.getTime() === start.getTime()) return 0;

  let businessDays = 0;
  const cursor = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  while (cursor.getTime() <= end.getTime()) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const holidays = getColombianHolidaysForYear(cursor.getUTCFullYear());
      if (!holidays.has(formatUtcYmd(cursor))) {
        businessDays += 1;
      }
    }
    cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return businessDays;
}

export function evaluateEventDateFeasibility(input: {
  todayIso: string;
  eventDateIso: string;
  cityCode?: string | null;
  cityName?: string | null;
  totalPhysicalPieces: number;
  maxBaseProductionDays?: number;
  artworkMode: B2bArtworkMode;
  packagingType: B2bPackagingType;
}): EventDateFeasibility {
  const isBogota =
    (Boolean(input.cityCode) && LUCAMS_ZONE_CITIES.some((c) => c.cityCode === input.cityCode)) ||
    Boolean(input.cityName && /bogot[aá]/i.test(input.cityName));

  const baseProd = Math.max(2, Math.trunc(input.maxBaseProductionDays ?? 2));
  const volumeExtraDays =
    input.totalPhysicalPieces >= 500
      ? 4
      : input.totalPhysicalPieces >= 200
        ? 2
        : input.totalPhysicalPieces >= 100
          ? 1
          : 0;
  const artworkExtraDays =
    input.artworkMode === "INDIVIDUAL_NOMINAL" || input.artworkMode === "CREATIVE_ASSISTANCE"
      ? 1
      : 0;
  const packagingExtraDays = input.packagingType !== "BULK_STANDARD" ? 1 : 0;
  const transitDays = isBogota ? 1 : 3;
  const recommendedMinBusinessDays =
    baseProd + volumeExtraDays + artworkExtraDays + packagingExtraDays + transitDays;

  if (!input.eventDateIso.trim()) {
    return {
      state: "UNSET",
      businessDaysAvailable: null,
      recommendedMinBusinessDays,
      isBogota,
      headline: `Tiempo estimado habitual: ~${recommendedMinBusinessDays} días hábiles`,
      detail: isBogota
        ? "Incluye muestra digital, producción en taller y entrega local en Bogotá."
        : "Incluye muestra digital, producción en taller y tránsito nacional asegurado.",
      suggestedTaskPriority: input.totalPhysicalPieces >= 100 ? "URGENT" : "HIGH",
    };
  }

  const businessDays = countColombianBusinessDaysBetween(input.todayIso, input.eventDateIso);
  if (businessDays === null || businessDays < 0) {
    return {
      state: "PAST",
      businessDaysAvailable: businessDays,
      recommendedMinBusinessDays,
      isBogota,
      headline: "La fecha seleccionada ya pasó",
      detail: "Elige una fecha igual o posterior a hoy en Colombia.",
      suggestedTaskPriority: "URGENT",
    };
  }

  const hardFloor = isBogota ? 2 : 4;
  if (businessDays < hardFloor) {
    return {
      state: "CRITICAL_TIGHT",
      businessDaysAvailable: businessDays,
      recommendedMinBusinessDays,
      isBogota,
      headline: `Plazo crítico (${businessDays} ${businessDays === 1 ? "día hábil" : "días hábiles"})`,
      detail: isBogota
        ? "Para esta fecha requerimos validar disponibilidad inmediata de taller y entrega directa en Bogotá."
        : "El tránsito nacional suele tardar 2 a 4 días hábiles; validaremos contigo alternativas exprés antes de comprometer fecha.",
      suggestedTaskPriority: "URGENT",
    };
  }

  if (businessDays < recommendedMinBusinessDays) {
    return {
      state: "URGENT_VIABLE",
      businessDaysAvailable: businessDays,
      recommendedMinBusinessDays,
      isBogota,
      headline: `Agenda prioritaria (${businessDays} días hábiles disponibles)`,
      detail: `El tiempo estándar para este volumen es de ~${recommendedMinBusinessDays} días hábiles; marcaremos tu solicitud como urgente para confirmar cupo en taller.`,
      suggestedTaskPriority: "URGENT",
    };
  }

  return {
    state: "COMFORTABLE",
    businessDaysAvailable: businessDays,
    recommendedMinBusinessDays,
    isBogota,
    headline: `Fecha viable con holgura (${businessDays} días hábiles)`,
    detail: `Contamos con tiempo cómodo para muestra digital, fabricación 300 DPI y entrega (${recommendedMinBusinessDays} días hábiles estimados).`,
    suggestedTaskPriority: input.totalPhysicalPieces >= 100 ? "URGENT" : "HIGH",
  };
}

export interface ProposalMarginSummary {
  subtotalCents: number;
  discountCents: number;
  merchandiseNetCents: number;
  shippingCents: number;
  totalCents: number;
  totalCostCents: number | null;
  grossMarginCents: number | null;
  marginPct: number | null;
  hasMissingCost: boolean;
  hasBelowCostLine: boolean;
  belowCostSkus: string[];
}

/**
 * Calculadora financiera pura para el constructor de propuestas en Admin (`opportunities:propose`).
 * Evalúa utilidad neta de mercancía frente al costo BOM (`Product.cost * qty * designUnits`).
 */
export function computeProposalMarginSummary(input: {
  items: ReadonlyArray<{
    sku: string;
    qty: number;
    designUnits: number;
    unitPriceCents: number;
    unitCostCents: number | null;
  }>;
  discountCents: number;
  shippingCents: number;
}): ProposalMarginSummary {
  let subtotalCents = 0;
  let totalCostCents = 0;
  let hasMissingCost = false;
  const belowCostSkus: string[] = [];

  for (const item of input.items) {
    const qty = Math.max(1, Math.trunc(item.qty));
    const designUnits = Math.max(1, Math.trunc(item.designUnits));
    const unitPriceCents = Math.max(0, Math.trunc(item.unitPriceCents));
    const lineRevenue = unitPriceCents * qty * designUnits;
    subtotalCents += lineRevenue;

    if (item.unitCostCents === null || item.unitCostCents === undefined) {
      hasMissingCost = true;
    } else {
      const unitCost = Math.max(0, Math.trunc(item.unitCostCents));
      totalCostCents += unitCost * qty * designUnits;
      if (unitPriceCents < unitCost) {
        belowCostSkus.push(item.sku);
      }
    }
  }

  const discountCents = Math.min(subtotalCents, Math.max(0, Math.trunc(input.discountCents)));
  const merchandiseNetCents = Math.max(0, subtotalCents - discountCents);
  const shippingCents = Math.max(0, Math.trunc(input.shippingCents));
  const totalCents = merchandiseNetCents + shippingCents;

  if (hasMissingCost) {
    return {
      subtotalCents,
      discountCents,
      merchandiseNetCents,
      shippingCents,
      totalCents,
      totalCostCents: null,
      grossMarginCents: null,
      marginPct: null,
      hasMissingCost: true,
      hasBelowCostLine: belowCostSkus.length > 0,
      belowCostSkus,
    };
  }

  const grossMarginCents = merchandiseNetCents - totalCostCents;
  const marginPct =
    merchandiseNetCents > 0
      ? Math.round((grossMarginCents / merchandiseNetCents) * 1000) / 10
      : grossMarginCents < 0
        ? -100
        : 0;

  if (merchandiseNetCents < totalCostCents && belowCostSkus.length === 0) {
    belowCostSkus.push("DESCUENTO_GLOBAL");
  }

  return {
    subtotalCents,
    discountCents,
    merchandiseNetCents,
    shippingCents,
    totalCents,
    totalCostCents,
    grossMarginCents,
    marginPct,
    hasMissingCost: false,
    hasBelowCostLine: belowCostSkus.length > 0,
    belowCostSkus,
  };
}
