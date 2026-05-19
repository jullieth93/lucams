/*
 * Admin > Contenido > Bloque editor.
 *
 * 2 secciones:
 *  - Editor: textarea split + preview live + cheatsheet markdown
 *  - Historial: versiones anteriores con botón "Volver a esta"
 *
 * Botones globales en header: Publicar, Despublicar, Archivar.
 * Confirmaciones nativas (window.confirm) antes de cada acción
 * pública/destructiva.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Send, EyeOff, Trash2 } from "lucide-react";
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
    <div className="space-y-5">
      {/* Header con acciones */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <Link
            href="/admin/contenido/bloques"
            className="mt-1 text-slate-500 hover:text-slate-700"
            aria-label="Volver a la lista"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="font-mono text-xs text-slate-500">{block.key}</p>
            <h2 className="text-lg font-bold text-slate-900">{block.title ?? block.key}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {block.isPublished ? (
                <span className="text-emerald-700">🟢 Publicado en el sitio</span>
              ) : (
                <span className="text-amber-700">🟡 Borrador — no se ve en el sitio</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canPublishLatest && (
            <form action={publishCmsBlockVersionAction}>
              <input type="hidden" name="blockId" value={block.id} />
              <input type="hidden" name="versionId" value={latestVersion!.id} />
              <Button
                type="submit"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                size="sm"
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
                className="text-slate-700 hover:bg-slate-100"
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
      </div>

      {/* Notices */}
      {justCreated && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          ✓ Bloque creado. Edítalo y publícalo cuando estés lista.
        </div>
      )}
      {justPublished && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          🟢 Publicado. Los cambios ya se ven en el sitio.
        </div>
      )}
      {justUnpublished && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Despublicado. El sitio caerá al texto por defecto.
        </div>
      )}
      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

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
      <section className="mt-8">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          📚 Historial de versiones
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Cada vez que guardas se crea una versión. Puedes volver a cualquier versión anterior con
          un clic.
        </p>
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
      </section>
    </div>
  );
}
