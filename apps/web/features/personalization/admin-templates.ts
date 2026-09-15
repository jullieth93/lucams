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
  previewUrl: string;
  isActive: boolean;
  isDeleted: boolean;
  isFallback: boolean; // "libre-*" (lienzo en blanco de respaldo)
  order: number;
  productSlug: string | null;
};

/** Estado visible para Lucy: 🟢 aprobada · 🟡 oculta · ⚫ descartada. */
export function templateStatus(t: AdminTemplate): "aprobada" | "oculta" | "descartada" {
  if (t.isDeleted) return "descartada";
  return t.isActive ? "aprobada" : "oculta";
}

/** Lista TODAS las plantillas (incl. soft-deleted) para el panel de aprobación. */
export async function listTemplatesForAdmin(): Promise<AdminTemplate[]> {
  const rows = await prisma.personalizationTemplate.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      kind: true,
      previewUrl: true,
      isActive: true,
      deletedAt: true,
      order: true,
      product: { select: { slug: true } },
    },
    orderBy: [{ kind: "asc" }, { order: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    kind: r.kind,
    previewUrl: r.previewUrl,
    isActive: r.isActive,
    isDeleted: r.deletedAt !== null,
    isFallback: r.slug.startsWith("libre-"),
    order: r.order,
    productSlug: r.product?.slug ?? null,
  }));
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
