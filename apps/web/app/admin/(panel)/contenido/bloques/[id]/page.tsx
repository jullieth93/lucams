/*
 * Admin > Contenido > Bloque editor (brand 2026-05-20).
 *
 * Refactor: ahora usa AdminPage/AdminPageHeader/AdminPageBody como las
 * demás páginas admin para evitar desborde + alineamiento brand
 * consistente. Antes era un <div> raw que iba edge-to-edge en pantallas
 * grandes.
 *
 * 2 secciones:
 *  - Editor: textarea con toolbar visual + preview live + cheatsheet colapsable
 *  - Historial: versiones anteriores con botón "Volver a esta"
 *
 * Botones globales en header: Publicar, Despublicar, Archivar.
 * Confirmaciones nativas (window.confirm) antes de cada acción
 * pública/destructiva.
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, History, Send, EyeOff, Trash2 } from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminCard,
  AdminBadge,
  AdminButton,
  AdminNotice,
} from "@/components/admin-page";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { getCurrentAdmin } from "@/lib/auth";
import { getCmsBlockById } from "@/features/cms/service";
import {
  deleteCmsBlockAction,
  publishCmsBlockVersionAction,
  unpublishCmsBlockAction,
} from "../../actions";
import { BlockEditorForm } from "./block-editor-form";
import { VersionHistory } from "./version-history";

export const metadata: Metadata = {
  title: "Editar bloque",
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function EditarBloquePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const sp = await searchParams;
  const justCreated = sp.created === "1";
  const justPublished = sp.published === "1";
  const justUnpublished = sp.unpublished === "1";
  const errorMsg = typeof sp.error === "string" ? sp.error : null;

  const block = await getCmsBlockById(id);
  if (!block) notFound();

  // La última versión guardada (puede ser borrador o ya publicada).
  const latestVersion = block.versions[0];
  const canPublishLatest = latestVersion && latestVersion.id !== block.publishedVersionId;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<FileText className="h-5 w-5" />}
        title={block.title ?? block.key}
        subtitle={
          <>
            <code className="bg-brand-purple/8 text-brand-purple-dark mr-2 rounded px-1.5 py-0.5 font-mono text-[11px]">
              {block.key}
            </code>
            {block.isPublished ? (
              <AdminBadge tone="emerald">🟢 Publicado en el sitio</AdminBadge>
            ) : (
              <AdminBadge tone="amber">🟡 Borrador — no se ve en el sitio</AdminBadge>
            )}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "IA y Conocimiento" },
          { label: "Bloques", href: "/admin/contenido/bloques" },
          { label: block.title ?? block.key },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton href="/admin/contenido/bloques" variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </AdminButton>
            {canPublishLatest && (
              <form action={publishCmsBlockVersionAction}>
                <input type="hidden" name="blockId" value={block.id} />
                <input type="hidden" name="versionId" value={latestVersion!.id} />
                <Button
                  type="submit"
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  title="Hacer pública la última versión guardada"
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {block.isPublished ? "Publicar nueva versión" : "Publicar"}
                </Button>
              </form>
            )}
            {block.isPublished && (
              <ConfirmAction
                action={unpublishCmsBlockAction}
                message={`¿Despublicar "${block.title ?? block.key}"? El sitio dejará de mostrarlo y caerá al texto por defecto (fallback hardcoded en código).`}
              >
                <input type="hidden" name="blockId" value={block.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="text-brand-purple-dark hover:bg-brand-purple/10"
                  title="Despublicar (el sitio caerá al texto por defecto)"
                >
                  <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                  Despublicar
                </Button>
              </ConfirmAction>
            )}
            <ConfirmAction
              action={deleteCmsBlockAction}
              message={`¿Archivar el bloque "${block.title ?? block.key}"? Quedará oculto del sitio. Tu historial de versiones se conserva.`}
            >
              <input type="hidden" name="blockId" value={block.id} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-red-700 hover:bg-red-50"
                title="Archivar bloque"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Archivar
              </Button>
            </ConfirmAction>
          </div>
        }
      />

      <AdminPageBody>
        {justCreated && (
          <AdminNotice tone="success">
            Bloque creado. Edítalo y publícalo cuando estés lista.
          </AdminNotice>
        )}
        {justPublished && (
          <AdminNotice tone="success">Publicado. Los cambios ya se ven en el sitio.</AdminNotice>
        )}
        {justUnpublished && (
          <AdminNotice tone="warning">
            Despublicado. El sitio caerá al texto por defecto.
          </AdminNotice>
        )}
        {errorMsg && <AdminNotice tone="error">{errorMsg}</AdminNotice>}

        {/* Editor */}
        <BlockEditorForm
          block={{
            id: block.id,
            key: block.key,
            title: block.title,
            body: block.body,
            format: block.format,
            category: block.category,
            description: block.description,
            isPublished: block.isPublished,
          }}
        />

        {/* Historial */}
        <section>
          <h3 className="text-brand-purple-dark font-display mb-2 flex items-center gap-2 text-base font-bold">
            <History className="h-5 w-5" />
            Historial de versiones
          </h3>
          <p className="text-brand-muted mb-3 text-sm">
            Cada vez que guardas se crea una versión. Puedes volver a cualquier versión anterior con
            un clic.
          </p>
          <AdminCard className="overflow-hidden p-0">
            <VersionHistory
              blockId={block.id}
              versions={block.versions.map((v) => ({
                id: v.id,
                version: v.version,
                title: v.title,
                body: v.body,
                publishedAt: v.publishedAt,
                createdAt: v.createdAt,
                createdBy: v.createdBy,
              }))}
              currentPublishedVersionId={block.publishedVersionId}
            />
          </AdminCard>
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
