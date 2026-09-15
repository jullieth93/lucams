/*
 * Gestión admin de plantillas del Estudio (Fase 3). Permite a Lucy revisar los
 * previews REALES (generados desde el canvasData) y aprobar (mostrar en el Estudio)
 * u ocultar cada plantilla — sin tocar código. Incluye las soft-deleted (las 42
 * rechazadas de ADR-037) para que pueda restaurar las buenas.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { updateTag } from "next/cache";
import type { PersonalizationKind } from "@lucams/db";
import {
  preferProductSpecific,
  filterTemplatesByAspectRatio,
} from "./template-visibility";
import { parsePhotoProductConfig } from "./schemas";

export const KIND_LABEL: Record<PersonalizationKind, string> = {
  NONE: "Sin personalización",
  PHOTO_PACK: "Pack de fotos",
  PHOTO_GRID: "Collage / grilla",
  CALENDAR_PHOTO_MONTH: "Calendario (mes)",
  CALENDAR_PHOTO_HERO: "Calendario (foto grande)",
  EVENT_FAVOR: "Recuerdos de evento",
  BUSINESS_LOGO: "Empresas / logo",
  CUSTOM_DECOR: "Decoración libre",
  TEXT_ONLY: "Solo texto",
} as unknown as Record<PersonalizationKind, string>;

export type AdminTemplate = {
  id: string;
  slug: string;
  name: string;
  kind: PersonalizationKind;
  mode: "EDITABLE" | "PREMADE";
  previewUrl: string;
  isActive: boolean;
  isDeleted: boolean;
  isFallback: boolean; // "libre-*" (lienzo en blanco de respaldo)
  order: number;
  productId: string | null;
  productSlug: string | null;
  /** Nombre del producto dueño (null = plantilla global). */
  productName: string | null;
  /** Categoría de catálogo del producto dueño (null = global). */
  categoryName: string | null;
  /**
   * ¿La ve el cliente en el Estudio? Calculada con la MISMA regla que usa el
   * Estudio (service.listTemplatesForKind): mode EDITABLE + isActive +
   * !deletedAt + kind/productId match (específicas > globales vía
   * preferProductSpecific) + aspect ratio del producto ±0.05
   * (filterTemplatesByAspectRatio) — helpers de template-visibility.ts.
   */
  studioVisible: boolean;
  /** Productos del Estudio (kind != NONE, activos) cuyo lienzo alimenta. */
  studioProductNames: string[];
};

/** Estado visible para Lucy: 🟢 aprobada · 🟡 oculta · ⚫ descartada. */
export function templateStatus(t: AdminTemplate): "aprobada" | "oculta" | "descartada" {
  if (t.isDeleted) return "descartada";
  return t.isActive ? "aprobada" : "oculta";
}

/**
 * Lista TODAS las plantillas (incl. soft-deleted) para el panel de aprobación,
 * anotadas con categoría de catálogo (vía producto) y visibilidad REAL en el
 * Estudio (`studioVisible` / `studioProductNames`).
 */
export async function listTemplatesForAdmin(): Promise<AdminTemplate[]> {
  const [rows, studioProducts] = await Promise.all([
    prisma.personalizationTemplate.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        kind: true,
        mode: true,
        previewUrl: true,
        isActive: true,
        deletedAt: true,
        order: true,
        productId: true,
        canvasData: true,
        product: { select: { slug: true, name: true, category: { select: { name: true } } } },
      },
      orderBy: [{ kind: "asc" }, { order: "asc" }, { name: "asc" }],
    }),
    // Productos con Estudio: personalizables (kind != NONE), activos y no
    // borrados — mismo universo que el catálogo usa para ofrecer "/estudio/<slug>".
    prisma.product.findMany({
      where: { isActive: true, deletedAt: null, personalizationKind: { not: "NONE" } },
      select: { id: true, name: true, personalizationKind: true, personalizationSchema: true },
    }),
  ]);

  // Visibilidad por producto — réplica de service.listTemplatesForKind usando
  // los mismos helpers puros de template-visibility.ts (no se duplica criterio):
  //   pool = EDITABLE + activa + no borrada + kind del producto + (producto o global)
  //   → preferProductSpecific(pool, productId)
  //   → filterTemplatesByAspectRatio(visible, aspect del producto)
  // Ojo: igual que en el Estudio, una específica que luego cae por aspect igual
  // TAPA a las globales (preferProductSpecific corre antes del filtro de aspect).
  const candidates = rows.filter((r) => r.mode === "EDITABLE" && r.isActive && !r.deletedAt);
  const visibleFor = new Map<string, Set<string>>();
  for (const p of studioProducts) {
    const aspectRatio = parsePhotoProductConfig(p.personalizationSchema).aspectRatio;
    const pool = candidates.filter(
      (t) => t.kind === p.personalizationKind && (t.productId === p.id || t.productId === null),
    );
    const visible = filterTemplatesByAspectRatio(preferProductSpecific(pool, p.id), aspectRatio);
    for (const t of visible) {
      const names = visibleFor.get(t.id) ?? new Set<string>();
      names.add(p.name);
      visibleFor.set(t.id, names);
    }
  }

  return rows.map((r) => {
    const studioProductNames = [...(visibleFor.get(r.id) ?? [])].sort((a, b) =>
      a.localeCompare(b, "es"),
    );
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      kind: r.kind,
      mode: r.mode,
      previewUrl: r.previewUrl,
      isActive: r.isActive,
      isDeleted: r.deletedAt !== null,
      isFallback: r.slug.startsWith("libre-"),
      order: r.order,
      productId: r.productId,
      productSlug: r.product?.slug ?? null,
      productName: r.product?.name ?? null,
      categoryName: r.product?.category.name ?? null,
      studioVisible: studioProductNames.length > 0,
      studioProductNames,
    };
  });
}

/**
 * Eliminar DEFINITIVAMENTE una plantilla (owner 2026-09-14: las demo pendientes
 * de aprobar sobran en el panel). Guard: solo si NO está aprobada y NINGÚN
 * diseño la referencia (los diseños conservan templateId — con referencias la
 * regla sigue siendo archivar, nunca borrar). Lanza Error con mensaje para UI.
 */
export async function deleteTemplateIfOrphan(id: string): Promise<void> {
  const t = await prisma.personalizationTemplate.findUnique({
    where: { id },
    select: { isActive: true, deletedAt: true, _count: { select: { designs: true } } },
  });
  if (!t) throw new Error("La plantilla ya no existe.");
  if (t.isActive && !t.deletedAt) {
    throw new Error("No puedes eliminar una plantilla aprobada: ocúltala primero.");
  }
  if (t._count.designs > 0) {
    throw new Error(
      `Tiene ${t._count.designs} diseños que la usan: se conserva descartada, nunca se borra.`,
    );
  }
  await prisma.personalizationTemplate.delete({ where: { id } });
  updateTag("catalog");
}

/**
 * Aprobar = mostrar en el Estudio: isActive=true + restaurar (deletedAt=null) si
 * estaba descartada. Ocultar = isActive=false (se conserva). `actorId` para audit.
 */
export async function setTemplateApproval(
  id: string,
  approved: boolean,
  actorId: string,
): Promise<void> {
  await prisma.personalizationTemplate.update({
    where: { id },
    data: approved
      ? { isActive: true, deletedAt: null, deletedBy: null, updatedBy: actorId }
      : { isActive: false, updatedBy: actorId },
  });
  updateTag("catalog");
}
