/*
 * Admin > Contenido — Índice de páginas del sitio (CMS v2).
 *
 * El contenido se navega por PÁGINA del sitio (Inicio, Footer, Contacto…)
 * pensando en una administradora NO técnica: cada tarjeta lleva al editor
 * de esa página (/admin/contenido/paginas/[slug]). El buscador global
 * (server-side, ?q=) encuentra cualquier campo por su nombre, identificador
 * o contenido y lleva directo a su editor (/admin/contenido/campos/[id]).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, FileText, FileWarning, Pencil, RefreshCw, Search } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminButton,
  AdminEmpty,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { cmsFieldHasDraft, listCmsPages, searchCmsFields } from "@/features/cms/service";
import { refreshCmsCacheAction } from "./actions";
import { CMS_PAGE_ICONS } from "./page-icons";

export const metadata: Metadata = {
  title: "Páginas del sitio",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function ContenidoIndexPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const cacheRefreshed = sp.cache === "refreshed";
  const justArchived = sp.archived === "1";

  const pages = await listCmsPages();
  const results = q ? await searchCmsFields(q) : null;
  // Total de cambios sin publicar (roadmap C4 — enlace a la vista «Solo borradores»).
  const totalPending = pages.reduce(
    (acc, p) =>
      acc +
      p.sections.flatMap((s) => s.fields).filter((f) => !f.isPublished || cmsFieldHasDraft(f))
        .length,
    0,
  );

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<FileText className="h-5 w-5" />}
        title="Páginas del sitio"
        subtitle="Edita el contenido de tu sitio por página: elige una tarjeta y cambia los textos sin tocar código."
        breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Contenido" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* C1 paso 2 — modo edición in-place: siembra la cookie y abre la
                portada; cualquier texto CMS clickeado salta a su editor.
                Form MPA (no Server Action): el 303 trae HTML fresco, sin el
                Router Cache del cliente de por medio. */}
            <form method="POST" action="/api/admin/cms/edit-mode">
              <input type="hidden" name="op" value="enable" />
              <input type="hidden" name="next" value="/" />
              <AdminButton type="submit" variant="secondary">
                <Pencil className="h-4 w-4" />
                Editar en el sitio
              </AdminButton>
            </form>
            {/* C4 — bandeja de cambios sin publicar del sitio entero */}
            <AdminButton href="/admin/contenido/borradores" variant="secondary">
              <FileWarning className="h-4 w-4" />
              Solo borradores{totalPending > 0 ? ` (${totalPending})` : ""}
            </AdminButton>
            {/* Lucy 2026-07-23 — invalidar el caché público del CMS tras editar la DB
                directo con scripts (los scripts no pueden llamar updateTag). */}
            <form action={refreshCmsCacheAction}>
              <input type="hidden" name="from" value="/admin/contenido" />
              <AdminButton type="submit" variant="secondary">
                <RefreshCw className="h-4 w-4" />
                Actualizar caché de contenido
              </AdminButton>
            </form>
          </div>
        }
      />

      <AdminPageBody>
        {cacheRefreshed && (
          <AdminNotice tone="success">
            Caché de contenido actualizado. El sitio público ya sirve la versión más reciente.
          </AdminNotice>
        )}
        {justArchived && (
          <AdminNotice tone="warning">
            Campo archivado. El sitio público dejará de mostrarlo (cae al texto por defecto).
          </AdminNotice>
        )}

        {/* Buscador global de campos */}
        <AdminCard className="p-4">
          <form action="/admin/contenido" method="get" className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Busca cualquier texto del sitio: «whatsapp», «privacidad», «horario»…"
                className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 text-brand-purple-dark placeholder:text-brand-purple-dark/35 h-10 w-full rounded-md border bg-white pr-3 pl-9 text-sm shadow-sm focus:ring-2 focus:outline-none"
              />
            </div>
            <AdminButton type="submit" variant="primary">
              Buscar
            </AdminButton>
          </form>
        </AdminCard>

        {/* Resultados de búsqueda */}
        {results !== null && (
          <section className="space-y-3">
            <h2 className="text-brand-purple-dark font-display text-lg font-bold">
              {results.length === 0
                ? `Sin resultados para «${q}»`
                : `${results.length} resultado${results.length === 1 ? "" : "s"} para «${q}»`}
            </h2>
            {results.length > 0 && (
              <AdminTable>
                <AdminTableHead>
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Texto</th>
                    <th className="px-4 py-3 text-left font-semibold">Identificador</th>
                    <th className="px-4 py-3 text-left font-semibold">Página / Sección</th>
                    <th className="px-4 py-3 text-center font-semibold">Estado</th>
                    <th className="px-4 py-3 text-right font-semibold">Acción</th>
                  </tr>
                </AdminTableHead>
                <AdminTableBody>
                  {results.map((f) => (
                    <AdminTableRow key={f.id}>
                      <td className="px-4 py-3 align-top">
                        <span className="text-brand-purple-dark text-sm font-semibold">
                          {f.label}
                        </span>
                        {f.helpText && (
                          <p className="text-brand-muted mt-0.5 line-clamp-1 text-xs">
                            {f.helpText}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <code className="bg-brand-purple/5 text-brand-purple-dark/85 rounded px-1.5 py-0.5 font-mono text-[11px]">
                          {f.key}
                        </code>
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
                        {f.isPublished && f.publishedVersion ? (
                          <AdminBadge tone="emerald">Publicado</AdminBadge>
                        ) : (
                          <AdminBadge tone="amber">Borrador</AdminBadge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <Link
                          href={`/admin/contenido/campos/${f.id}`}
                          className="text-brand-purple-dark hover:text-brand-purple text-xs font-semibold"
                        >
                          Editar →
                        </Link>
                      </td>
                    </AdminTableRow>
                  ))}
                </AdminTableBody>
              </AdminTable>
            )}
          </section>
        )}

        {/* Grid de páginas */}
        {pages.length === 0 ? (
          <AdminEmpty
            icon={<FileText className="h-5 w-5" />}
            title="Todavía no hay páginas de contenido"
            description="Lo normal es que vengan pre-cargadas al instalar el sitio. Pídele a soporte técnico que corra el seed del CMS."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((page) => {
              const Icon = CMS_PAGE_ICONS[page.icon ?? ""] ?? FileText;
              const fields = page.sections.flatMap((s) => s.fields);
              const pending = fields.filter((f) => !f.isPublished || cmsFieldHasDraft(f)).length;
              return (
                <AdminCard key={page.id} hover className="flex flex-col overflow-hidden">
                  <Link
                    href={`/admin/contenido/paginas/${page.slug}`}
                    className="group flex-1 p-5"
                    title={`Editar el contenido de ${page.title}`}
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <div className="from-brand-purple/15 to-brand-pink/15 group-hover:from-brand-purple/25 group-hover:to-brand-pink/25 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br transition-colors">
                        <Icon className="text-brand-purple h-5 w-5" />
                      </div>
                      <h2 className="text-brand-purple-dark font-display group-hover:text-brand-purple text-lg leading-tight font-bold transition-colors">
                        {page.title}
                      </h2>
                    </div>
                    {page.description && (
                      <p className="text-brand-muted line-clamp-2 text-xs leading-snug">
                        {page.description}
                      </p>
                    )}
                    <p className="text-brand-purple-dark/60 mt-2 text-xs font-medium">
                      {fields.length} campo{fields.length === 1 ? "" : "s"} · {page.sections.length}{" "}
                      seccione{page.sections.length === 1 ? "s" : "s"}
                    </p>
                  </Link>
                  <div className="border-brand-purple/10 flex items-center justify-between gap-2 border-t px-5 py-2.5">
                    <div>
                      {pending > 0 && <AdminBadge tone="amber">{pending} sin publicar</AdminBadge>}
                    </div>
                    {page.path && (
                      <a
                        href={page.path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-xs font-semibold"
                        title={`Abrir ${page.path} en una pestaña nueva`}
                      >
                        Ver página
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </AdminCard>
              );
            })}
          </div>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
