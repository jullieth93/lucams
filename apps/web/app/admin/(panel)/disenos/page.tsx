/*
 * ADR-057 Fase B2 — Admin de "Diseños prediseñados". Lucy sube imágenes de diseño listas por
 * producto; el cliente las aplica a un slot en el editor (sin subir su propia foto).
 */

import type { Metadata } from "next";
import { requireRole } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { listGalleryAdmin, listGalleryTagOptions } from "@/features/personalization/design-gallery";
import { GalleryManager } from "./gallery-manager";

export const metadata: Metadata = { title: "Diseños prediseñados" };
export const dynamic = "force-dynamic";

export default async function DisenosAdminPage() {
  // B-7 (auditoría 2026-08-24): guard propio — el layout de (panel) NO se
  // re-ejecuta en navegaciones soft, así que un admin degradado a mitad de
  // sesión conservaría acceso de lectura sin este check. Mismo set que ./actions.ts.
  await requireRole(ADMIN_ROLE_SETS.MANAGER_UP);
  // tagOptions = productos activos que declaran galleryTag (fuente única: la BD).
  // El selector del client y la validación del upload leen de la misma lista.
  const [items, tagOptions] = await Promise.all([listGalleryAdmin(), listGalleryTagOptions()]);
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-brand-purple-dark font-display text-2xl">Diseños prediseñados</h1>
        <p className="text-brand-muted mt-1 text-sm">
          Imágenes de diseño listas que el cliente puede aplicar con un toque en el editor (en vez
          de subir su propia foto). Agrúpalas por producto. Ideal para “Separadores para Libros”:
          sube tus diseños y aparecen en el editor para elegir o combinar con foto propia.
        </p>
      </header>
      <GalleryManager items={items} tagOptions={tagOptions} />
    </div>
  );
}
