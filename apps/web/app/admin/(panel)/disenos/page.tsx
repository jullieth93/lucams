/*
 * ADR-057 Fase B2 — Admin de "Diseños prediseñados". Lucy sube imágenes de diseño listas por
 * producto; el cliente las aplica a un slot en el editor (sin subir su propia foto).
 */

import type { Metadata } from "next";
import { listGalleryAdmin } from "@/features/personalization/design-gallery";
import { GalleryManager } from "./gallery-manager";

export const metadata: Metadata = { title: "Diseños prediseñados" };
export const dynamic = "force-dynamic";

export default async function DisenosAdminPage() {
  const items = await listGalleryAdmin();
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
      <GalleryManager items={items} />
    </div>
  );
}
