/*
 * Admin > Contenido > Bloque nuevo (brand 2026-05-20).
 *
 * Form de creación. Lo normal es que los bloques estén pre-cargados
 * en seed; esto sirve para que el admin agregue nuevos bloques
 * personalizados (banners promocionales temporales, FAQ extra, etc).
 *
 * Refactor: ahora usa AdminPage para evitar desborde y alinearse con
 * el resto de páginas admin.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft, FilePlus } from "lucide-react";
import { AdminButton, AdminPage, AdminPageBody, AdminPageHeader } from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { CreateBlockForm } from "./create-block-form";

export const metadata: Metadata = {
  title: "Crear bloque",
};

type SearchParams = Promise<{ category?: string }>;

export default async function NuevoBloquePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  const sp = await searchParams;
  const defaultCategory = sp.category;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<FilePlus className="h-5 w-5" />}
        title="Crear bloque nuevo"
        subtitle="Un bloque es un texto largo editable del sitio (página, banner, FAQ, mensaje)."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "IA y Conocimiento" },
          { label: "Bloques", href: "/admin/contenido/bloques" },
          { label: "Nuevo" },
        ]}
        actions={
          <AdminButton href="/admin/contenido/bloques" variant="secondary">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </AdminButton>
        }
      />

      <AdminPageBody>
        <CreateBlockForm defaultCategory={defaultCategory} />
      </AdminPageBody>
    </AdminPage>
  );
}
