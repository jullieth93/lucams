/*
 * Admin > Contenido > Bloques — Lista todos los bloques editables (brand 2026-05-18).
 *
 * Agrupados por categoría con badges de estado:
 *  🟢 Publicado · 🟡 Borrador
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Plus, ChevronRight } from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminBadge,
  AdminEmpty,
  AdminButton,
  AdminNotice,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { listCmsBlocks } from "@/features/cms/service";

export const metadata: Metadata = {
  title: "Base de conocimiento",
};

const CATEGORY_LABELS: Record<string, string> = {
  LEGAL: "📋 Textos legales",
  HOME: "🏠 Página de inicio",
  FOOTER: "👇 Pie de página",
  EMPTY_STATE: "🦝 Mensajes cuando no hay contenido",
  COOKIES: "🍪 Banner de cookies",
  FAQ: "❓ Preguntas frecuentes",
  SUPPORT: "💬 Soporte y contacto",
  MAINTENANCE: "🛠️ Página de mantenimiento",
  EMAIL: "📧 Correos automáticos",
  MARKETING: "📢 Banners promocionales",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function BloquesListPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const justCreated = sp.created === "1";
  const justArchived = sp.archived === "1";

  const blocks = await listCmsBlocks({});

  const grouped = blocks.reduce(
    (acc, b) => {
      (acc[b.category] ??= []).push(b);
      return acc;
    },
    {} as Record<string, typeof blocks>,
  );

  const categories = Object.keys(grouped).sort();

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<FileText className="h-5 w-5" />}
        title="Base de conocimiento"
        subtitle={
          blocks.length === 0
            ? "Todavía no hay bloques de contenido."
            : `${blocks.length} bloque${blocks.length === 1 ? "" : "s"} de contenido editables — alimentan storefront, emails y el bot futuro.`
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "IA y Conocimiento" },
          { label: "Bloques" },
        ]}
        actions={
          <AdminButton href="/admin/contenido/bloques/nuevo" variant="primary">
            <Plus className="h-4 w-4" />
            Crear bloque nuevo
          </AdminButton>
        }
      />

      <AdminPageBody>
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
          <div className="space-y-6">
            {categories.map((cat) => (
              <section key={cat}>
                <h2 className="text-brand-purple-dark mb-2.5 flex items-center gap-2 text-sm font-bold">
                  <span>{CATEGORY_LABELS[cat] ?? cat}</span>
                  <span className="text-brand-purple-dark/50 text-xs font-normal">
                    ({grouped[cat].length})
                  </span>
                </h2>
                <AdminTable>
                  <AdminTableHead>
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Bloque</th>
                      <th className="px-4 py-3 text-left font-semibold">Identificador</th>
                      <th className="px-4 py-3 text-center font-semibold">Estado</th>
                      <th className="px-4 py-3 text-center font-semibold">Versión</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </AdminTableHead>
                  <AdminTableBody>
                    {grouped[cat].map((b) => (
                      <AdminTableRow key={b.id}>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/contenido/bloques/${b.id}`}
                            className="text-brand-purple-dark hover:text-brand-purple font-medium"
                          >
                            {b.title ?? b.key}
                          </Link>
                          {b.description && (
                            <p className="text-brand-purple-dark/55 line-clamp-1 text-xs">
                              {b.description}
                            </p>
                          )}
                        </td>
                        <td className="text-brand-purple-dark/75 px-4 py-3 font-mono text-xs">
                          {b.key}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {b.isPublished ? (
                            <AdminBadge tone="emerald">🟢 Publicado</AdminBadge>
                          ) : (
                            <AdminBadge tone="amber">🟡 Borrador</AdminBadge>
                          )}
                        </td>
                        <td className="text-brand-purple-dark/65 px-4 py-3 text-center text-xs tabular-nums">
                          {b.publishedVersion?.version ? `v${b.publishedVersion.version}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/contenido/bloques/${b.id}`}
                            className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 text-xs font-medium"
                          >
                            Editar
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </AdminTableRow>
                    ))}
                  </AdminTableBody>
                </AdminTable>
              </section>
            ))}
          </div>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
