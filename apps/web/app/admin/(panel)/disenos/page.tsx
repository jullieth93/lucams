/*
 * ADR-057 Fase B2 — Admin de "Diseños prediseñados". Lucy sube imágenes de diseño listas por
 * producto; el cliente las aplica a un slot en el editor (sin subir su propia foto).
 *
 * 2026-09-15 — el módulo "Fichas del abecedario" (antes página hermana /admin/fichas)
 * se embebió acá como segundo tab: ambos alimentan el Estudio y comparten guard
 * MANAGER_UP. /admin/fichas quedó como redirect permanente a /admin/disenos?tab=fichas.
 */

import type { Metadata } from "next";
import { requireRole } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { listGalleryAdmin, listGalleryTagOptions } from "@/features/personalization/design-gallery";
import { GalleryManager } from "./gallery-manager";
import { FichasSection } from "./fichas-section";
import { DisenosTabs } from "./disenos-tabs";

export const metadata: Metadata = { title: "Diseños prediseñados" };
export const dynamic = "force-dynamic";

export default async function DisenosAdminPage() {
  // B-7 (auditoría 2026-08-24): guard propio — el layout de (panel) NO se
  // re-ejecuta en navegaciones soft, así que un admin degradado a mitad de
  // sesión conservaría acceso de lectura sin este check. Mismo set que
  // ./actions.ts y ./fichas-actions.ts.
  await requireRole(ADMIN_ROLE_SETS.MANAGER_UP);
  // tagOptions = TODO producto activo con superficie de foto en el Estudio (fuente
  // única: la BD). Tag = galleryTag explícito o, sin él, el slug (default-on
  // 2026-09-09 — mismo fallback que aplica el Estudio). El selector del client y
  // la validación del upload leen de la misma lista.
  const [items, tagOptions] = await Promise.all([listGalleryAdmin(), listGalleryTagOptions()]);
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-brand-purple-dark font-display text-2xl">Diseños prediseñados</h1>
        <p className="text-brand-muted mt-1 text-sm">
          Todo el material visual tuyo que alimenta el Estudio: diseños listos por producto (el
          cliente los aplica con un toque en vez de subir su propia foto) y las fichas ilustradas
          del abecedario para el editor de nombres.
        </p>
      </header>
      <DisenosTabs productos={<GalleryManager items={items} tagOptions={tagOptions} />} fichas={<FichasSection />} />
    </div>
  );
}
