/*
 * Admin > Contenido > Bloques — textos editables del sitio.
 *
 * Presentación reformulada (Lucy 2026-07-29): la lista vive en
 * <BlocksBrowser> (cliente) con buscador + agrupación por LUGAR del sitio
 * en vez de categoría técnica. El server solo trae los datos.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileText, Plus, RefreshCw } from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminEmpty,
  AdminButton,
  AdminNotice,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { listCmsBlocks } from "@/features/cms/service";
import { refreshCmsCacheAction } from "../actions";
import { BlocksBrowser } from "./blocks-browser";

export const metadata: Metadata = {
  title: "Textos del sitio",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function BloquesListPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const justCreated = sp.created === "1";
  const justArchived = sp.archived === "1";
  const cacheRefreshed = sp.cache === "refreshed";

  const blocks = await listCmsBlocks({});
  const rows = blocks.map((b) => ({
    id: b.id,
    key: b.key,
    title: b.title,
    description: b.description,
    isPublished: b.isPublished,
    version: b.publishedVersion?.version ?? null,
  }));

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<FileText className="h-5 w-5" />}
        title="Textos del sitio"
        subtitle={
          blocks.length === 0
            ? "Todavía no hay bloques de contenido."
            : `${blocks.length} textos editables de tu tienda y correos — búscalos como los ves en el sitio y edítalos sin tocar código.`
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Contenido" },
          { label: "Textos del sitio" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Lucy 2026-07-23 — invalidar el caché público del CMS tras editar la DB
                directo con scripts (los scripts no pueden llamar updateTag). */}
            <form action={refreshCmsCacheAction}>
              <AdminButton type="submit" variant="secondary">
                <RefreshCw className="h-4 w-4" />
                Actualizar caché de contenido
              </AdminButton>
            </form>
            <AdminButton href="/admin/contenido/bloques/nuevo" variant="primary">
              <Plus className="h-4 w-4" />
              Crear bloque nuevo
            </AdminButton>
          </div>
        }
      />

      <AdminPageBody>
        {cacheRefreshed && (
          <AdminNotice tone="success">
            Caché de contenido actualizado. El sitio público ya sirve la versión más reciente de
            bloques y configuración.
          </AdminNotice>
        )}
        {justCreated && (
          <AdminNotice tone="success">
            Bloque creado. Ya puedes editarlo y publicarlo cuando quieras.
          </AdminNotice>
        )}
        {justArchived && (
          <AdminNotice tone="warning">
            Bloque archivado. El sitio público dejará de mostrarlo (cae al texto por defecto).
          </AdminNotice>
        )}

        {blocks.length === 0 ? (
          <AdminEmpty
            icon={<FileText className="h-5 w-5" />}
            title="Aún no hay bloques de contenido"
            description="Los bloques son textos largos del sitio (avisos legales, páginas de ayuda, mensajes del home). Lo normal es que vengan pre-cargados al instalar el sitio."
            action={
              <AdminButton href="/admin/contenido/bloques/nuevo" variant="primary">
                <Plus className="h-4 w-4" />
                Crear primer bloque
              </AdminButton>
            }
          />
        ) : (
          <BlocksBrowser blocks={rows} />
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
