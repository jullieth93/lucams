/*
 * Admin > Contenido > Editor de página (CMS v2).
 *
 * Una CmsPage = una página del sitio tal como la entiende la administradora
 * (Inicio, Footer, Contacto, Ajustes del sitio…). Cada sección es una
 * tarjeta; cada campo se edita INLINE si es simple (texto, número, email…)
 * o lleva al editor completo (/admin/contenido/campos/[id]) si es rico
 * (Markdown/HTML/JSON).
 *
 * Valor mostrado por fila: el de la versión PUBLICADA si existe; si no, el
 * borrador actual, marcado como tal. Tras guardar inline, el Server Action
 * revalida esta ruta y la fila se re-renderiza (aparece "Publicar" cuando
 * un BLOCK queda con cambios sin publicar).
 *
 * Roadmap C1: si la página tiene ruta pública (CmsPage.path), a la derecha
 * va una VISTA PREVIA EN VIVO (iframe) que se recarga sola tras guardar o
 * publicar — la señal es el max updatedAt de los campos, que cambia en cada
 * re-render del servidor post-action.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, FileText, RefreshCw } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { cmsFieldHasDraft, getCmsPageBySlug } from "@/features/cms/service";
import { refreshCmsCacheAction } from "../../actions";
import { CMS_PAGE_ICONS } from "../../page-icons";
import { CreateFieldForm } from "./create-field-form";
import { FieldRow, type InlineField } from "./field-row";
import { PagePreviewPanel } from "./page-preview-panel";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata: Metadata = {
  title: "Editar página",
};

/** Tipos con edición inline; MARKDOWN/HTML/JSON/IMAGE van al editor completo. */
const RICH_TYPES = new Set(["MARKDOWN", "HTML", "JSON", "IMAGE"]);

/** Prefijo de key sugerido para campos nuevos: el prefijo común de la sección. */
function suggestKeyPrefix(keys: string[], pageSlug: string, sectionKey: string): string {
  const fallback = `${pageSlug}.${sectionKey}.`;
  if (keys.length === 0) return fallback;
  let prefix = keys[0];
  for (const k of keys.slice(1)) {
    while (!k.startsWith(prefix) && prefix.length > 0) prefix = prefix.slice(0, -1);
  }
  // Corta en el último separador ("." o "_") conservándolo: "home.hero.x" → "home.hero."
  const cut = Math.max(prefix.lastIndexOf("."), prefix.lastIndexOf("_"));
  if (cut > 0) return prefix.slice(0, cut + 1);
  const first = keys[0];
  const cutFirst = Math.max(first.lastIndexOf("."), first.lastIndexOf("_"));
  return cutFirst > 0 ? first.slice(0, cutFirst + 1) : fallback;
}

/** Categoría legacy por defecto para campos nuevos: la más usada en la sección. */
function defaultCategory(categories: string[]): string {
  const counts = new Map<string, number>();
  for (const c of categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best = "GENERAL";
  let bestCount = 0;
  for (const [cat, n] of counts) {
    if (n > bestCount) {
      best = cat;
      bestCount = n;
    }
  }
  return best;
}

/** Preview plano de un contenido rico (misma limpieza que el historial viejo). */
function plainPreview(body: string, max = 180): string {
  const clean = body
    .replace(/[#*_`>-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export default async function EditarPaginaCmsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const { slug } = await params;
  const sp = await searchParams;
  const justPublished = sp.published === "1";
  const justUnpublished = sp.unpublished === "1";
  const justArchived = sp.archived === "1";
  const cacheRefreshed = sp.cache === "refreshed";
  const errorMsg = typeof sp.error === "string" ? sp.error : null;

  const page = await getCmsPageBySlug(slug);
  if (!page) notFound();

  // Señal de recarga de la vista previa (C1): cualquier guardar/publicar
  // actualiza el updatedAt de un campo → el servidor re-renderiza con una
  // señal nueva y el iframe se recarga solo.
  const refreshSignal = String(
    Math.max(0, ...page.sections.flatMap((s) => s.fields.map((f) => f.updatedAt.getTime()))),
  );

  const Icon = CMS_PAGE_ICONS[page.icon ?? ""] ?? FileText;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Icon className="h-5 w-5" />}
        title={page.title}
        subtitle={page.description ?? "Edita los textos de esta página."}
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Contenido", href: "/admin/contenido" },
          { label: page.title },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton href="/admin/contenido" variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </AdminButton>
            <form action={refreshCmsCacheAction}>
              <input type="hidden" name="from" value={`/admin/contenido/paginas/${page.slug}`} />
              <AdminButton type="submit" variant="secondary">
                <RefreshCw className="h-4 w-4" />
                Actualizar caché
              </AdminButton>
            </form>
            {page.path && (
              <a
                href={page.path}
                target="_blank"
                rel="noopener noreferrer"
                className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-md border bg-white px-3.5 py-2 text-sm font-semibold transition-all"
              >
                Ver página
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        }
      />

      <AdminPageBody>
        {justPublished && (
          <AdminNotice tone="success">Publicado. Los cambios ya se ven en el sitio.</AdminNotice>
        )}
        {justUnpublished && (
          <AdminNotice tone="warning">
            Despublicado. El sitio dejará de mostrar ese texto (cae al texto por defecto).
          </AdminNotice>
        )}
        {justArchived && (
          <AdminNotice tone="warning">
            Campo archivado. El sitio público dejará de mostrarlo (cae al texto por defecto).
          </AdminNotice>
        )}
        {cacheRefreshed && (
          <AdminNotice tone="success">
            Caché de contenido actualizado. El sitio público ya sirve la versión más reciente.
          </AdminNotice>
        )}
        {errorMsg && <AdminNotice tone="error">{errorMsg}</AdminNotice>}

        {/* C1: con ruta pública, el editor va a la izquierda y la vista
            previa en vivo a la derecha (apilada en pantallas < xl). */}
        <div
          className={
            page.path
              ? "grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(340px,2fr)]"
              : "space-y-6"
          }
        >
          <div className="space-y-6">
            {page.sections.map((section) => {
              const keyPrefix = suggestKeyPrefix(
                section.fields.map((f) => f.key),
                page.slug,
                section.key,
              );
              const category = defaultCategory(section.fields.map((f) => f.category));
              return (
                <section key={section.id}>
                  <div className="mb-2.5">
                    <h2 className="text-brand-purple-dark font-display text-base font-bold">
                      {section.title}
                    </h2>
                    {section.description && (
                      <p className="text-brand-muted text-xs">{section.description}</p>
                    )}
                  </div>
                  <AdminCard className="overflow-hidden">
                    {section.fields.length === 0 ? (
                      <p className="text-brand-muted px-4 py-6 text-center text-sm">
                        Esta sección todavía no tiene campos.
                      </p>
                    ) : (
                      <ul className="divide-brand-purple/10 divide-y">
                        {section.fields.map((f) => {
                          const hasDraft = cmsFieldHasDraft(f) || !f.isPublished;
                          const publishedBody = f.publishedVersion?.body ?? null;
                          if (RICH_TYPES.has(f.type)) {
                            // Contenido rico (Markdown/HTML/JSON): no se edita inline —
                            // preview truncado + acceso al editor completo.
                            return (
                              <li
                                key={f.id}
                                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-brand-purple-dark text-sm font-semibold">
                                      {f.label}
                                    </span>
                                    {f.isPublished && !hasDraft ? (
                                      <AdminBadge tone="emerald">Publicado</AdminBadge>
                                    ) : f.isPublished ? (
                                      <AdminBadge tone="amber">Cambios sin publicar</AdminBadge>
                                    ) : (
                                      <AdminBadge tone="amber">Borrador</AdminBadge>
                                    )}
                                  </div>
                                  {f.helpText && (
                                    <p className="text-brand-muted mt-0.5 text-xs">{f.helpText}</p>
                                  )}
                                  <p className="text-brand-muted mt-0.5 font-mono text-[10px]">
                                    {f.key}
                                  </p>
                                  <p className="text-brand-purple-dark/60 mt-2 line-clamp-2 text-xs">
                                    {plainPreview(publishedBody ?? f.body)}
                                    {!publishedBody && (
                                      <span className="text-amber-700">
                                        {" "}
                                        (borrador sin publicar)
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <Link
                                  href={`/admin/contenido/campos/${f.id}`}
                                  className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold transition-all"
                                >
                                  Editar
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                              </li>
                            );
                          }
                          const inline: InlineField = {
                            id: f.id,
                            key: f.key,
                            kind: f.kind,
                            type: f.type as InlineField["type"],
                            label: f.label,
                            helpText: f.helpText,
                            value: publishedBody ?? f.body,
                            showingDraft: publishedBody === null,
                            hasDraft,
                            isPublished: f.isPublished,
                          };
                          return (
                            <FieldRow
                              key={f.id}
                              field={inline}
                              latestVersionId={f.versions[0]?.id ?? null}
                              pageSlug={page.slug}
                            />
                          );
                        })}
                      </ul>
                    )}
                    <CreateFieldForm
                      sectionId={section.id}
                      suggestedKeyPrefix={keyPrefix}
                      defaultCategory={category}
                    />
                  </AdminCard>
                </section>
              );
            })}
          </div>
          {page.path && <PagePreviewPanel path={page.path} refreshSignal={refreshSignal} />}
        </div>
      </AdminPageBody>
    </AdminPage>
  );
}
