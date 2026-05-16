/*
 * Admin > Contenido > Bloques — Lista todos los bloques editables.
 *
 * Agrupados por categoría con badge de estado:
 *  🟢 Publicado · 🟡 Borrador · ⚫ Archivado
 *
 * Click en cualquier fila → editor.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentAdmin } from "@/lib/auth";
import { listCmsBlocks } from "@/features/cms/service";

export const metadata: Metadata = {
  title: "Bloques de contenido",
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

  // Agrupar por categoría
  const grouped = blocks.reduce(
    (acc, b) => {
      (acc[b.category] ??= []).push(b);
      return acc;
    },
    {} as Record<string, typeof blocks>,
  );

  const categories = Object.keys(grouped).sort();

  return (
    <div className="space-y-5">
      {justCreated && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          ✓ Bloque creado. Ya puedes editarlo y publicarlo cuando quieras.
        </div>
      )}
      {justArchived && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Bloque archivado. El sitio público dejará de verlo (cae al texto por defecto).
        </div>
      )}

      <div className="flex items-end justify-between gap-3">
        <p className="text-sm text-slate-600">
          {blocks.length === 0
            ? "Todavía no hay bloques de contenido."
            : `${blocks.length} bloque${blocks.length === 1 ? "" : "s"} en total.`}
        </p>
        <Link href="/admin/contenido/bloques/nuevo">
          <Button className="bg-slate-900 text-white hover:bg-slate-800">
            <Plus className="mr-1.5 h-4 w-4" />
            Crear bloque nuevo
          </Button>
        </Link>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 font-medium text-slate-700">Aún no hay bloques de contenido</p>
          <p className="mt-1 text-sm text-slate-500">
            Los bloques son textos largos del sitio (avisos legales, páginas de ayuda, mensajes del
            home).
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Lo normal es que vengan pre-cargados al instalar el sitio. Si llegaste acá vacío,
            créalos o avisa a soporte técnico.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => (
            <section key={cat}>
              <h2 className="mb-2 text-sm font-semibold text-slate-700">
                {CATEGORY_LABELS[cat] ?? cat}{" "}
                <span className="text-xs font-normal text-slate-500">({grouped[cat].length})</span>
              </h2>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs tracking-wider text-slate-600 uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Bloque</th>
                      <th className="px-4 py-3 text-left font-medium">Identificador</th>
                      <th className="px-4 py-3 text-center font-medium">Estado</th>
                      <th className="px-4 py-3 text-center font-medium">Versión</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {grouped[cat].map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/contenido/bloques/${b.id}`}
                            className="font-medium text-slate-900 hover:text-slate-700"
                          >
                            {b.title ?? b.key}
                          </Link>
                          {b.description && (
                            <p className="line-clamp-1 text-xs text-slate-500">{b.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{b.key}</td>
                        <td className="px-4 py-3 text-center">
                          {b.isPublished ? (
                            <span className="inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              🟢 Publicado
                            </span>
                          ) : (
                            <span className="inline-block rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              🟡 Borrador
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-slate-500 tabular-nums">
                          {b.publishedVersion?.version ? `v${b.publishedVersion.version}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/contenido/bloques/${b.id}`}
                            className="text-sm font-medium text-slate-700 hover:text-slate-900"
                          >
                            Editar →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
