/*
 * Admin > Contenido > Solo borradores (roadmap C4).
 *
 * Todos los campos del sitio con cambios SIN PUBLICAR en una sola lista
 * (borrador más nuevo que lo vivo, o nunca publicados), con publicación
 * individual o en lote. La vista de siempre (por página) sigue siendo el
 * índice; esta es la bandeja de "qué falta por salir".
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileWarning, Send, SendHorizonal } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmpty,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
} from "@/components/admin-page";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { getCurrentAdmin } from "@/lib/auth";
import { cmsFieldHasDraft, listCmsDraftFields } from "@/features/cms/service";
import { publishAllCmsDraftsAction, publishCmsFieldAction } from "../actions";

export const metadata: Metadata = {
  title: "Solo borradores",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function BorradoresPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const publishedCount = typeof sp.published === "string" ? Number(sp.published) : null;
  const errorMsg = typeof sp.error === "string" ? sp.error : null;

  const drafts = await listCmsDraftFields();

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<FileWarning className="h-5 w-5" />}
        title="Solo borradores"
        subtitle="Todos los cambios guardados que todavía no se ven en el sitio. Publícalos uno a uno o todos de una vez."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Contenido", href: "/admin/contenido" },
          { label: "Solo borradores" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton href="/admin/contenido" variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </AdminButton>
            {drafts.length > 0 && (
              <ConfirmAction
                action={publishAllCmsDraftsAction}
                message={`¿Publicar los ${drafts.length} cambios pendientes? Todos se verán en el sitio de inmediato.`}
              >
                <input type="hidden" name="redirectTo" value="/admin/contenido/borradores" />
                <Button
                  type="submit"
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <SendHorizonal className="mr-1.5 h-3.5 w-3.5" />
                  Publicar todo ({drafts.length})
                </Button>
              </ConfirmAction>
            )}
          </div>
        }
      />

      <AdminPageBody>
        {publishedCount !== null && (
          <AdminNotice tone="success">
            {publishedCount === 0
              ? "No había nada pendiente por publicar."
              : `Publicado${publishedCount === 1 ? "" : "s"} ${publishedCount} cambio${publishedCount === 1 ? "" : "s"}. Ya se ve${publishedCount === 1 ? "" : "n"} en el sitio.`}
          </AdminNotice>
        )}
        {errorMsg && <AdminNotice tone="error">{errorMsg}</AdminNotice>}

        {drafts.length === 0 ? (
          <AdminEmpty
            icon={<Send className="h-5 w-5" />}
            title="Nada pendiente"
            description="No hay cambios sin publicar. Todo el contenido del sitio está al día."
          />
        ) : (
          <AdminCard className="overflow-hidden p-0">
            <AdminTable>
              <AdminTableHead>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Campo</th>
                  <th className="px-4 py-3 text-left font-semibold">Página / Sección</th>
                  <th className="px-4 py-3 text-center font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Acción</th>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {drafts.map((f) => {
                  const latest = f.versions[0];
                  const neverPublished = !f.isPublished;
                  return (
                    <AdminTableRow key={f.id}>
                      <td className="px-4 py-3 align-top">
                        <Link
                          href={`/admin/contenido/campos/${f.id}`}
                          className="text-brand-purple-dark hover:text-brand-purple text-sm font-semibold"
                        >
                          {f.label}
                        </Link>
                        <p className="mt-0.5">
                          <code className="bg-brand-purple/5 text-brand-purple-dark/85 rounded px-1.5 py-0.5 font-mono text-[11px]">
                            {f.key}
                          </code>
                        </p>
                      </td>
                      <td className="text-brand-purple-dark/75 px-4 py-3 align-top text-xs">
                        <Link
                          href={`/admin/contenido/paginas/${f.section.page.slug}`}
                          className="hover:text-brand-purple font-semibold"
                        >
                          {f.section.page.title}
                        </Link>
                        <span className="text-brand-muted"> · {f.section.title}</span>
                      </td>
                      <td className="px-4 py-3 text-center align-top">
                        {neverPublished ? (
                          <AdminBadge tone="amber">Borrador</AdminBadge>
                        ) : (
                          <AdminBadge tone="amber">Cambios sin publicar</AdminBadge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <div className="flex items-center justify-end gap-2">
                          {latest && (
                            <form action={publishCmsFieldAction}>
                              <input type="hidden" name="fieldId" value={f.id} />
                              <input type="hidden" name="versionId" value={latest.id} />
                              <input
                                type="hidden"
                                name="redirectTo"
                                value="/admin/contenido/borradores"
                              />
                              <Button
                                type="submit"
                                size="sm"
                                className="bg-emerald-600 text-white hover:bg-emerald-700"
                                title={
                                  cmsFieldHasDraft(f)
                                    ? "Publicar el último borrador"
                                    : "Publicar la última versión"
                                }
                              >
                                <Send className="mr-1 h-3.5 w-3.5" />
                                Publicar
                              </Button>
                            </form>
                          )}
                          <Link
                            href={`/admin/contenido/campos/${f.id}`}
                            className="text-brand-purple-dark hover:text-brand-purple text-xs font-semibold"
                          >
                            Editar →
                          </Link>
                        </div>
                      </td>
                    </AdminTableRow>
                  );
                })}
              </AdminTableBody>
            </AdminTable>
          </AdminCard>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
