/*
 * Admin > Contenido > Mediateca (roadmap B5).
 *
 * Biblioteca de imágenes del sitio: assets subidos al bucket `cms-media`
 * (Supabase Storage) con su metadata en CmsMedia. Se suben acá o desde el
 * editor de un campo de imagen; se reutilizan en cualquier campo type IMAGE
 * (el campo guarda el CmsMedia.id como body).
 *
 * Por asset: miniatura, texto alternativo editable (a11y), dimensiones/peso,
 * conteo de uso (campos que la referencian — si está en uso NO se puede
 * borrar, la guarda vive en el service) y borrado con confirmación.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft, Images } from "lucide-react";
import { AdminButton, AdminPage, AdminPageBody, AdminPageHeader } from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { getCmsMediaUsage, listCmsMedia } from "@/lib/cms-media";
import { MediaLibraryClient } from "./media-library-client";

export const metadata: Metadata = {
  title: "Mediateca",
};

export default async function MediatecaPage() {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const [media, usage] = await Promise.all([listCmsMedia(120), getCmsMediaUsage()]);

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Images className="h-5 w-5" />}
        title="Mediateca"
        subtitle="Imágenes del sitio listas para usar en campos de imagen (banners, hero, logos). Sube una vez y reutiliza."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Contenido", href: "/admin/contenido" },
          { label: "Mediateca" },
        ]}
        actions={
          <AdminButton href="/admin/contenido" variant="secondary">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </AdminButton>
        }
      />

      <AdminPageBody>
        <MediaLibraryClient
          media={media.map((m) => ({
            id: m.id,
            url: m.url,
            alt: m.alt,
            width: m.width,
            height: m.height,
            bytes: m.bytes,
            usedBy: usage.get(m.id) ?? [],
          }))}
        />
      </AdminPageBody>
    </AdminPage>
  );
}
