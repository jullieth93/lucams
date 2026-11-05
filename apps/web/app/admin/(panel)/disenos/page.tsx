/*
 * ADR-057 Fase B2 — Admin de "Diseños prediseñados". Lucy sube imágenes de diseño listas por
 * producto; el cliente las aplica a un slot en el editor (sin subir su propia foto).
 *
 * 2026-09-15 — el módulo "Fichas del abecedario" (antes página hermana /admin/fichas)
 * se embebió acá como segundo tab: ambos alimentan el Estudio y comparten guard
 * MANAGER_UP. /admin/fichas quedó como redirect permanente a /admin/disenos?tab=fichas.
 */

import type { Metadata } from "next";
import { Shapes } from "lucide-react";
import { requireRole } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { AdminPage, AdminPageBody, AdminPageHeader } from "@/components/admin-page";
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
  // B-5 (2026-10-02) — includeArchived: el manager separa los soft-deleted en la
  // sección colapsable "Archivados" (con Restaurar); la grilla principal sigue
  // mostrando solo los no borrados.
  const [items, tagOptions] = await Promise.all([
    listGalleryAdmin(undefined, { includeArchived: true }),
    listGalleryTagOptions(),
  ]);
  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Shapes className="h-5 w-5" />}
        title="Diseños prediseñados y fichas"
        subtitle="Todo el material visual que alimenta el Estudio: diseños listos por producto y fichas ilustradas del abecedario."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Catálogo" },
          { label: "Diseños prediseñados" },
        ]}
      />
      <AdminPageBody>
        <div className="mx-auto max-w-5xl">
          <DisenosTabs
            productos={<GalleryManager items={items} tagOptions={tagOptions} />}
            fichas={<FichasSection />}
          />
        </div>
      </AdminPageBody>
    </AdminPage>
  );
}
