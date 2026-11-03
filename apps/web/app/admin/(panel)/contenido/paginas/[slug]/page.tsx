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
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  ExternalLink,
  FileText,
  RefreshCw,
  ShoppingCart,
  Truck,
} from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { isCatalogMode } from "@/lib/store-mode";
import { cmsFieldHasDraft, getCmsPageBySlug } from "@/features/cms/service";
import { refreshCmsCacheAction } from "../../actions";
import {
  CMS_PAGE_ICONS,
  MODULE_MANAGED_SETTING_KEYS,
  publicPathForCmsFieldKey,
} from "../../page-icons";
import { FieldRow, type InlineField } from "./field-row";
import { PagePreviewPanel } from "./page-preview-panel";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata: Metadata = {
  title: "Editar página",
};

/** Tipos cuyo contenido requiere el editor dedicado (Markdown/HTML/JSON/IMAGE). */
const RICH_TYPES = new Set(["MARKDOWN", "HTML", "JSON", "IMAGE"]);

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
  const { slug } = await params;
  const isGlobalSettings = slug === "global";
  await requireRole(isGlobalSettings ? ADMIN_ROLE_SETS.SUPER : ADMIN_ROLE_SETS.CONTENT);

  const sp = await searchParams;
  const justPublished = sp.published === "1";
  const justUnpublished = sp.unpublished === "1";
  const cacheRefreshed = sp.cache === "refreshed";
  const errorMsg = typeof sp.error === "string" ? sp.error : null;

  const page = await getCmsPageBySlug(slug);
  if (!page) notFound();

  const catalogMode = isCatalogMode();

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
        breadcrumbs={
          isGlobalSettings
            ? [
                { label: "Admin", href: "/admin/dashboard" },
                { label: "Configuración" },
                { label: page.title },
              ]
            : [
                { label: "Admin", href: "/admin/dashboard" },
                { label: "Contenido", href: "/admin/contenido" },
                { label: page.title },
              ]
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isGlobalSettings && (
              <AdminButton href="/admin/contenido" variant="secondary">
                <ArrowLeft className="h-4 w-4" />
                Volver
              </AdminButton>
            )}
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
        {cacheRefreshed && (
          <AdminNotice tone="success">
            Caché de contenido actualizado. El sitio público ya sirve la versión más reciente.
          </AdminNotice>
        )}
        {errorMsg && <AdminNotice tone="error">{errorMsg}</AdminNotice>}

        {/* C1: solo las páginas con URL pública 1:1 abren la vista previa en vivo. */}
        <div
          className={
            page.path
              ? "grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(340px,2fr)]"
              : "space-y-6"
          }
        >
          <div className="space-y-6">
            {page.sections.map((section) => {
              const visibleFields = isGlobalSettings
                ? section.fields.filter((f) => !MODULE_MANAGED_SETTING_KEYS.has(f.key))
                : section.fields;
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
                    {visibleFields.length === 0 ? (
                      <p className="text-brand-muted px-4 py-6 text-center text-sm">
                        Esta sección no tiene campos visibles.
                      </p>
                    ) : (
                      <ul className="divide-brand-purple/10 divide-y">
                        {visibleFields.map((f) => {
                          const hasDraft = cmsFieldHasDraft(f) || !f.isPublished;
                          const publishedBody = f.publishedVersion?.body ?? null;
                          const fieldPublicPath = publicPathForCmsFieldKey(f.key);
                          if (RICH_TYPES.has(f.type)) {
                            // Contenido rico (Markdown/HTML/JSON/IMAGE): preview truncado + editor dedicado.
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
                                    {fieldPublicPath && (
                                      <a
                                        href={fieldPublicPath}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 text-xs font-semibold"
                                      >
                                        Ver {fieldPublicPath}
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
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
                            label: f.publishedVersion?.title ?? f.label,
                            helpText: f.helpText,
                            value: publishedBody ?? f.body,
                            publishedValue: publishedBody,
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
                              publicPath={fieldPublicPath}
                            />
                          );
                        })}
                      </ul>
                    )}

                    {isGlobalSettings && section.key === "comercio" && (
                      <div className="border-brand-purple/10 bg-brand-purple/[0.03] border-t p-4">
                        <p className="text-brand-purple-dark text-xs font-semibold">
                          Reglas operativas con módulo propio (sin editar JSON a mano)
                        </p>
                        <p className="text-brand-muted mt-0.5 text-xs">
                          Envíos, fidelización y recuperación de carritos tienen su propia pantalla
                          con validaciones de negocio:
                        </p>
                        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                          {catalogMode ? (
                            <div className="border-brand-purple/15 rounded-lg border bg-white/70 p-3 opacity-75">
                              <div className="text-brand-purple-dark flex items-center gap-1.5 text-xs font-semibold">
                                <Truck className="text-brand-purple h-4 w-4" />
                                Envíos y transportadoras
                              </div>
                              <p className="text-brand-muted mt-1 text-[11px]">
                                Envío propio Lucams, corte horario, zonas y transportadoras (activo
                                en modo tienda completa).
                              </p>
                            </div>
                          ) : (
                            <Link
                              href="/admin/envios"
                              className="border-brand-purple/15 hover:border-brand-purple/40 group rounded-lg border bg-white p-3 transition-colors"
                            >
                              <div className="text-brand-purple-dark group-hover:text-brand-purple flex items-center justify-between text-xs font-semibold">
                                <span className="inline-flex items-center gap-1.5">
                                  <Truck className="text-brand-purple h-4 w-4" />
                                  Envíos
                                </span>
                                <ArrowRight className="h-3.5 w-3.5" />
                              </div>
                              <p className="text-brand-muted mt-1 text-[11px]">
                                Envío propio Lucams, precio, hora límite, zonas y transportadoras.
                              </p>
                            </Link>
                          )}

                          {catalogMode ? (
                            <div className="border-brand-purple/15 rounded-lg border bg-white/70 p-3 opacity-75">
                              <div className="text-brand-purple-dark flex items-center gap-1.5 text-xs font-semibold">
                                <Award className="text-brand-purple h-4 w-4" />
                                Fidelización y referidos
                              </div>
                              <p className="text-brand-muted mt-1 text-[11px]">
                                Puntos Lucams e «Invita y gana» (activo en modo tienda completa).
                              </p>
                            </div>
                          ) : (
                            <Link
                              href="/admin/fidelizacion"
                              className="border-brand-purple/15 hover:border-brand-purple/40 group rounded-lg border bg-white p-3 transition-colors"
                            >
                              <div className="text-brand-purple-dark group-hover:text-brand-purple flex items-center justify-between text-xs font-semibold">
                                <span className="inline-flex items-center gap-1.5">
                                  <Award className="text-brand-purple h-4 w-4" />
                                  Fidelización
                                </span>
                                <ArrowRight className="h-3.5 w-3.5" />
                              </div>
                              <p className="text-brand-muted mt-1 text-[11px]">
                                Tasas de Puntos Lucams y cupones de «Invita y gana».
                              </p>
                            </Link>
                          )}

                          <Link
                            href="/admin/carritos/configuracion"
                            className="border-brand-purple/15 hover:border-brand-purple/40 group rounded-lg border bg-white p-3 transition-colors"
                          >
                            <div className="text-brand-purple-dark group-hover:text-brand-purple flex items-center justify-between text-xs font-semibold">
                              <span className="inline-flex items-center gap-1.5">
                                <ShoppingCart className="text-brand-purple h-4 w-4" />
                                Carritos abandonados
                              </span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </div>
                            <p className="text-brand-muted mt-1 text-[11px]">
                              Activación, modo manual/automático y tiempos de recordatorio.
                            </p>
                          </Link>
                        </div>
                      </div>
                    )}
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
