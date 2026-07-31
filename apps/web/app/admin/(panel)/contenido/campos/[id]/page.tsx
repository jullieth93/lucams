/*
 * Admin > Contenido > Editor de campo (CMS v2) — adaptación de la vieja
 * pantalla bloques/[id] al modelo CmsField.
 *
 * 2 secciones:
 *  - Editor: según el tipo (Markdown con preview, JSON con validación suave,
 *    input/textarea simple) + nombre/ayuda colapsables. Los campos LISTA
 *    (metadata.listSchema) usan el editor de filas (list-editor-form).
 *  - Historial: versiones anteriores con botón "Volver a esta".
 *
 * Acciones de header: Publicar última versión (si hay borrador más nuevo),
 * Despublicar (SOLO kind BLOCK — los ajustes no se pueden despublicar) y
 * Archivar (soft delete → vuelve al editor de la página).
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, History, Send, EyeOff, Trash2 } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { getCurrentAdmin } from "@/lib/auth";
import { getCmsFieldById, getCmsFieldItems, getCmsListSchema } from "@/features/cms/service";
import { cmsMediaPublicUrl, listCmsMedia } from "@/lib/cms-media";
import { prisma } from "@/lib/db";
import {
  deleteCmsFieldAction,
  publishCmsFieldAction,
  unpublishCmsFieldAction,
} from "../../actions";
import { FieldEditorForm } from "./field-editor-form";
import { ListEditorForm } from "./list-editor-form";
import { VersionHistory } from "./version-history";

export const metadata: Metadata = {
  title: "Editar campo",
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function EditarCampoPage({
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

  const field = await getCmsFieldById(id);
  if (!field) notFound();

  const page = field.section.page;
  const pageHref = `/admin/contenido/paginas/${page.slug}`;
  const selfHref = `/admin/contenido/campos/${field.id}`;

  // La última versión guardada (puede ser borrador o ya publicada).
  const latestVersion = field.versions[0];
  const canPublishLatest = latestVersion && latestVersion.id !== field.publishedVersionId;

  // Campo LISTA (roadmap B4): se edita como filas con inputs por subcampo,
  // no con el editor de body. Los items vienen de CmsListItem o se derivan
  // del body JSON (migración perezosa al abrir el editor).
  const listSchema = getCmsListSchema(field.metadata);
  const listItems = listSchema ? await getCmsFieldItems(field.id) : null;

  // Campo IMAGE (roadmap B5): body = CmsMedia.id. Se resuelve el asset actual
  // y la mediateca reciente para el control (subir / reutilizar).
  const isImage = field.type === "IMAGE" && !listSchema;
  const imageMedia =
    isImage && field.body.trim()
      ? await prisma.cmsMedia.findUnique({ where: { id: field.body.trim() } })
      : null;
  const imageLibrary = isImage
    ? (await listCmsMedia(60)).map((m) => ({
        id: m.id,
        url: m.url,
        alt: m.alt,
        width: m.width,
        height: m.height,
      }))
    : null;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<FileText className="h-5 w-5" />}
        title={field.label}
        subtitle={
          <>
            <code className="bg-brand-purple/8 text-brand-purple-dark mr-2 rounded px-1.5 py-0.5 font-mono text-[11px]">
              {field.key}
            </code>
            {field.isPublished ? (
              <AdminBadge tone="emerald">🟢 Publicado en el sitio</AdminBadge>
            ) : (
              <AdminBadge tone="amber">🟡 Borrador — no se ve en el sitio</AdminBadge>
            )}{" "}
            {field.kind === "SETTING" && (
              <AdminBadge tone="purple">Se aplica apenas guardas</AdminBadge>
            )}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Contenido", href: "/admin/contenido" },
          { label: page.title, href: pageHref },
          { label: field.label },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton href={pageHref} variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </AdminButton>
            {canPublishLatest && (
              <form action={publishCmsFieldAction}>
                <input type="hidden" name="fieldId" value={field.id} />
                <input type="hidden" name="versionId" value={latestVersion.id} />
                <input type="hidden" name="redirectTo" value={selfHref} />
                <Button
                  type="submit"
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  title="Hacer pública la última versión guardada"
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {field.isPublished ? "Publicar nueva versión" : "Publicar"}
                </Button>
              </form>
            )}
            {field.kind === "BLOCK" && field.isPublished && (
              <ConfirmAction
                action={unpublishCmsFieldAction}
                message={`¿Despublicar "${field.label}"? El sitio dejará de mostrarlo y caerá al texto por defecto (fallback hardcoded en código).`}
              >
                <input type="hidden" name="fieldId" value={field.id} />
                <input type="hidden" name="redirectTo" value={selfHref} />
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
              action={deleteCmsFieldAction}
              message={`¿Archivar "${field.label}"? Quedará oculto del sitio. Tu historial de versiones se conserva.`}
            >
              <input type="hidden" name="fieldId" value={field.id} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-red-700 hover:bg-red-50"
                title="Archivar campo"
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
            Campo creado. Edítalo y publícalo cuando estés lista.
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

        {/* Editor: lista (campos con listSchema) o editor de body normal */}
        {listSchema && listItems ? (
          <ListEditorForm
            field={{
              id: field.id,
              key: field.key,
              kind: field.kind,
              label: field.label,
              helpText: field.helpText,
              isPublished: field.isPublished,
              listSchema,
              items: listItems.map((item) => item.values),
            }}
          />
        ) : (
          <FieldEditorForm
            field={{
              id: field.id,
              key: field.key,
              kind: field.kind,
              type: field.type,
              label: field.label,
              helpText: field.helpText,
              body: field.body,
              isPublished: field.isPublished,
            }}
            imageMedia={
              imageMedia
                ? {
                    id: imageMedia.id,
                    url: cmsMediaPublicUrl(imageMedia.bucket, imageMedia.path),
                    alt: imageMedia.alt,
                    width: imageMedia.width,
                    height: imageMedia.height,
                  }
                : null
            }
            imageLibrary={imageLibrary ?? undefined}
          />
        )}

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
              fieldId={field.id}
              versions={field.versions.map((v) => ({
                id: v.id,
                version: v.version,
                title: v.title,
                body: v.body,
                publishedAt: v.publishedAt,
                createdAt: v.createdAt,
                createdBy: v.createdBy,
              }))}
              currentPublishedVersionId={field.publishedVersionId}
            />
          </AdminCard>
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
