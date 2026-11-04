/*
 * ADR-063 T7 — Descarga del ZIP de producción de un pedido.
 *
 * GET /admin/pedidos/<number>/produccion → un .zip con:
 *   - los PNG 300 DPI de cada pieza, nombrados por mes (calendario) o "pieza-NN", en una carpeta
 *     por item del pedido;
 *   - armado.png (hoja de armado: miniaturas + etiquetas + estado de moderación);
 *   - LEEME.txt (resumen + advertencias).
 *
 * Reemplaza el flujo manual (bajar pieza por pieza) del detalle. Ruta bajo /admin/* → protegida por
 * el middleware; además valida rol + MFA con requireRole (defensa en profundidad).
 */

import JSZip from "jszip";
import { verifyAdminRouteAccess } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import { getOrderProductionBundle } from "@/features/orders/service";
import { downloadProductionAsset } from "@/lib/storage";
import {
  composeAssemblySheet,
  type AssemblyPiece,
} from "@/features/personalization/assembly-sheet";
import { MONTH_NAMES_ES } from "@/features/personalization/calendar-grid";
import { logger } from "@/lib/logger";
import {
  resolveProductionSpec,
  productionPieceGroups,
} from "@/features/personalization/production-spec";
import { parseVariantAttributes } from "@/features/products/variant-schemas";

// Descarga N archivos de storage + zip: dar presupuesto (no el default de 15s).
export const maxDuration = 60;

const MONTH_SLUG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function GET(req: Request, ctx: { params: Promise<{ number: string }> }) {
  const auth = await verifyAdminRouteAccess({
    roles: ADMIN_ROLE_SETS.ALL,
    req,
    checkIdle: true,
  });
  if (!auth.ok) {
    return Response.json(
      { error: "No autorizado.", reason: auth.reason },
      { status: auth.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { number } = await ctx.params;
  const bundle = await getOrderProductionBundle(decodeURIComponent(number));

  if (!bundle) {
    return new Response("Pedido no encontrado", { status: 404 });
  }
  if (bundle.items.length === 0) {
    return new Response("Este pedido no tiene diseños finalizados para imprimir.", { status: 404 });
  }

  // ADR-131 (2026-10-13) — el render 300 DPI corre EN BACKGROUND tras el finalize: una orden
  // puede pagarse con los archivos aún en preparación. No servir un ZIP a medias ni uno
  // vacío silencioso: mientras haya un RenderJob vivo se pide reintentar en unos minutos
  // (la ventana la absorbe el SLA de producción; el render de un pedido entero son minutos,
  // no horas). Un job FAILED se reporta en el LEEME.txt con lo que sí haya.
  const pendingItems = bundle.items.filter((it) => it.renderPending);
  if (pendingItems.length > 0) {
    const detail = pendingItems
      .map(
        (it) =>
          `${it.productName}: ${it.renderProgress?.doneUnits ?? 0} de ${it.renderProgress?.totalUnits ?? "?"} piezas`,
      )
      .join("; ");
    return new Response(
      `Los archivos de impresión de este pedido aún se están preparando (${detail}). Intenta de nuevo en unos minutos.`,
      { status: 409 },
    );
  }

  const zip = new JSZip();
  const pieces: AssemblyPiece[] = [];
  let missing = 0;
  let totalPieces = 0;
  let unapprovedPieces = 0;

  for (let itemIdx = 0; itemIdx < bundle.items.length; itemIdx++) {
    const item = bundle.items[itemIdx]!;
    totalPieces += item.productionUrls.length;
    if (item.moderationStatus !== "APPROVED") {
      unapprovedPieces += item.productionUrls.length;
    }
  }

  const summary: string[] = [
    `Pedido ${bundle.number}`,
    `Piezas de impresión (PNG 300 DPI).`,
    `Total: ${totalPieces} pieza(s) · ${totalPieces - unapprovedPieces} aprobada(s) · ${unapprovedPieces} pendiente(s) de aprobación.`,
    "",
  ];

  if (unapprovedPieces > 0) {
    summary.push(
      "═══════════════════════════════════════════════════════════════",
      "⚠️  ATENCIÓN: hay piezas SIN APROBAR.",
      "    NO imprima los PNG marcados hasta revisarlos en /admin/moderacion.",
      "    La hoja de armado (armado.png) indica cuáles están aprobadas.",
      "═══════════════════════════════════════════════════════════════",
      "",
    );
  }

  // ADR-131 — items cuyo render de imprenta FALLÓ (RenderJob FAILED): el ZIP sale con lo
  // que haya, pero el LEEME lo grita para que producción no imprima un pedido incompleto.
  const failedItems = bundle.items.filter((it) => it.renderFailed);
  if (failedItems.length > 0) {
    summary.push(
      "═══════════════════════════════════════════════════════════════",
      "⚠️  ATENCIÓN: el render de imprenta FALLÓ para:",
      ...failedItems.map(
        (it) =>
          `    ✗ ${it.productName} (${it.sku}) — reprocesar el RenderJob del diseño o pedir los PNG al cliente.`,
      ),
      "═══════════════════════════════════════════════════════════════",
      "",
    );
  }

  for (let itemIdx = 0; itemIdx < bundle.items.length; itemIdx++) {
    const item = bundle.items[itemIdx]!;
    const isCalendar = item.personalizationKind === "CALENDAR_PHOTO_MONTH";
    const spec = resolveProductionSpec({
      personalizationKind: item.personalizationKind,
      productSchema: jsonRecord(item.productSchema),
      variantAttrs: parseVariantAttributes(item.variantAttrs),
      physicalSpecs: jsonRecord(item.physicalSpecs),
      canvasData: jsonRecord(item.canvasData),
      designMetadata: jsonRecord(item.designMetadata),
      productionUrls: item.productionUrls,
      lineQty: item.qty,
    });
    // La CANTIDAD va en el nombre de la carpeta y en la hoja de resumen, no en archivos duplicados:
    // los PNG serían byte a byte iguales y solo engordarían el ZIP. Lo que hacía falta era decirlo,
    // porque antes no aparecía en ninguna parte y un pedido de 2 se imprimía como 1.
    const copias = item.qty > 1 ? ` ×${item.qty}` : "";
    const folder =
      bundle.items.length > 1 ? `${itemIdx + 1}-${slug(item.productName)}${copias}/` : "";
    summary.push(
      `• ${item.productName} (${item.sku}) — ${item.productionUrls.length} pieza(s)` +
        (item.qty > 1
          ? `  ⚠️ IMPRIMIR ${item.qty} COPIAS DE CADA PIEZA (${item.productionUrls.length} × ${item.qty} = ${item.productionUrls.length * item.qty} impresiones)`
          : ""),
      `  Qué es cada archivo: ${spec.queEsCadaArchivo}`,
      ...spec.especificaciones.map((entry) => `  ${entry.etiqueta}: ${entry.valor}`),
      ...spec.personalizacion.map((entry) => `  ${entry.etiqueta}: ${entry.valor}`),
      "  Armado:",
      ...spec.pasosArmado.map((step, index) => `    ${index + 1}. ${step}`),
    );
    if (item.moderationStatus !== "APPROVED") {
      summary.push(
        `  ⚠️ Estado de moderación: ${item.moderationStatus} — no imprimir hasta aprobar en /admin/moderacion.`,
      );
    }

    // W2 (owner 2026-11-03) — productos AGRUPADOS (sets de letras por ficha,
    // calendario multi-set, tiras ×N): rótulos reales por pieza y subcarpeta por
    // set/unidad dentro del ZIP (el calendario conserva sus nombres de mes).
    const groups = isCalendar
      ? null
      : productionPieceGroups({
          personalizationKind: item.personalizationKind,
          canvasData: jsonRecord(item.canvasData),
          designMetadata: jsonRecord(item.designMetadata),
          productionCount: item.productionUrls.length,
          startMonth:
            typeof jsonRecord(item.productSchema)?.startMonth === "number"
              ? (jsonRecord(item.productSchema)!.startMonth as number)
              : undefined,
        });
    const pieceInfo = new Map<number, { label: string; subfolder: string }>();
    if (groups) {
      for (const g of groups) {
        const subfolder = groups.length > 1 ? `${g.key}/` : "";
        for (const p of g.pieces) pieceInfo.set(p.index, { label: p.label, subfolder });
      }
    }

    for (let i = 0; i < item.productionUrls.length; i++) {
      const monthIndex0 = (((item.startMonth + i) % 12) + 12) % 12;
      const grouped = pieceInfo.get(i);
      const label = isCalendar
        ? `${MONTH_NAMES_ES[monthIndex0] ?? `Mes ${i + 1}`}${item.calendarYear ? ` ${item.calendarYear}` : ""}`
        : (grouped?.label ??
          (spec.reversosConMarcaAgua.includes(i + 1)
            ? `Pieza ${i + 1} · frente A + reverso B con marca de agua Lucams`
            : `Pieza ${i + 1}`));
      const fileName = isCalendar
        ? `${String(i + 1).padStart(2, "0")}-${MONTH_SLUG[monthIndex0] ?? `mes-${i + 1}`}.png`
        : grouped
          ? `${grouped.subfolder}${String(i + 1).padStart(2, "0")}-${slug(grouped.label)}.png`
          : `pieza-${String(i + 1).padStart(2, "0")}.png`;

      const bytes = await downloadProductionAsset(item.productionUrls[i]!);
      if (!bytes) {
        missing++;
        summary.push(`  ✗ ${label}: archivo no disponible en storage.`);
        continue;
      }
      zip.file(`${folder}${fileName}`, bytes);
      pieces.push({
        // La hoja de armado es lo que se mira mientras se produce: si hay que sacar más de una
        // copia, tiene que verse ahí y no solo en el resumen de texto.
        label: item.qty > 1 ? `${label} — ${item.qty} copias` : label,
        moderationStatus: item.moderationStatus,
        productName: item.productName,
        png: bytes,
      });
    }
  }

  // Hoja de armado (armado.png) — no rompe la descarga si falla la composición.
  const createdAtLabel = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(bundle.createdAt);
  try {
    const sheet = await composeAssemblySheet({
      orderNumber: bundle.number,
      createdAtLabel,
      pieces,
    });
    zip.file("armado.png", sheet);
  } catch (err) {
    logger.warn(
      { event: "order.production_zip.assembly_fail", orderNumber: bundle.number, err: String(err) },
      "No se pudo componer la hoja de armado",
    );
  }

  if (missing > 0) {
    summary.push("", `⚠️ ${missing} archivo(s) no se pudieron descargar.`);
  }
  summary.push("", "Generado por Lucams Shop · admin.");
  zip.file("LEEME.txt", summary.join("\n"));

  const content = await zip.generateAsync({ type: "nodebuffer" });
  const filename = `pedido-${slug(bundle.number)}-produccion.zip`;

  await recordAdminAction({
    actorId: auth.session.admin.id,
    action: "order.design_zip_download",
    entityType: "Order",
    entityId: bundle.id,
    metadata: {
      orderNumber: bundle.number,
      totalPieces,
      unapprovedPieces,
      missingPieces: missing,
    },
  });

  return new Response(new Uint8Array(content), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
