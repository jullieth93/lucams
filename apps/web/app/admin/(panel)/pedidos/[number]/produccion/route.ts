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
import { requireRole } from "@/lib/admin-rbac-guard";
import { getOrderProductionBundle } from "@/features/orders/service";
import { downloadProductionAsset } from "@/lib/storage";
import {
  composeAssemblySheet,
  type AssemblyPiece,
} from "@/features/personalization/assembly-sheet";
import { MONTH_NAMES_ES } from "@/features/personalization/calendar-grid";
import { logger } from "@/lib/logger";

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

export async function GET(_req: Request, ctx: { params: Promise<{ number: string }> }) {
  await requireRole(["SUPERADMIN", "MANAGER"]);
  const { number } = await ctx.params;
  const bundle = await getOrderProductionBundle(decodeURIComponent(number));

  if (!bundle) {
    return new Response("Pedido no encontrado", { status: 404 });
  }
  if (bundle.items.length === 0) {
    return new Response("Este pedido no tiene diseños finalizados para imprimir.", { status: 404 });
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

  for (let itemIdx = 0; itemIdx < bundle.items.length; itemIdx++) {
    const item = bundle.items[itemIdx]!;
    const isCalendar = item.personalizationKind === "CALENDAR_PHOTO_MONTH";
    const folder = bundle.items.length > 1 ? `${itemIdx + 1}-${slug(item.productName)}/` : "";
    summary.push(`• ${item.productName} (${item.sku}) — ${item.productionUrls.length} pieza(s)`);
    if (item.moderationStatus !== "APPROVED") {
      summary.push(
        `  ⚠️ Estado de moderación: ${item.moderationStatus} — no imprimir hasta aprobar en /admin/moderacion.`,
      );
    }

    for (let i = 0; i < item.productionUrls.length; i++) {
      const monthIndex0 = (((item.startMonth + i) % 12) + 12) % 12;
      const label = isCalendar
        ? `${MONTH_NAMES_ES[monthIndex0] ?? `Mes ${i + 1}`}${item.calendarYear ? ` ${item.calendarYear}` : ""}`
        : `Pieza ${i + 1}`;
      const fileName = isCalendar
        ? `${String(i + 1).padStart(2, "0")}-${MONTH_SLUG[monthIndex0] ?? `mes-${i + 1}`}.png`
        : `pieza-${String(i + 1).padStart(2, "0")}.png`;

      const bytes = await downloadProductionAsset(item.productionUrls[i]!);
      if (!bytes) {
        missing++;
        summary.push(`  ✗ ${label}: archivo no disponible en storage.`);
        continue;
      }
      zip.file(`${folder}${fileName}`, bytes);
      pieces.push({
        label,
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
  return new Response(new Uint8Array(content), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
