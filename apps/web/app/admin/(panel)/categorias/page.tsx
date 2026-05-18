/*
 * Admin > Categorías — Listado + crear inline (brand palette 2026-05-18).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Edit3, Eye, EyeOff, Layers, Trash2 } from "lucide-react";
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
  AdminCard,
  AdminNotice,
} from "@/components/admin-page";
import { Button } from "@/components/ui/button";
import { listCategories } from "@/features/categories/service";
import { getCurrentAdmin } from "@/lib/auth";
import { CategoryForm } from "./category-form";
import { deleteCategoryAction, toggleCategoryActiveAction } from "./actions";

export const metadata: Metadata = {
  title: "Categorías",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function AdminCategoriasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const categories = await listCategories();
  const justCreated = sp.created === "1";
  const justDeleted = sp.deleted === "1";
  const errorMsg = typeof sp.error === "string" ? sp.error : null;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Layers className="h-5 w-5" />}
        title="Categorías"
        subtitle="Agrupa productos por tipo. Las sub-categorías se crean asignando categoría padre."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Catálogo" },
          { label: "Categorías" },
        ]}
      />

      <AdminPageBody>
        {justCreated && <AdminNotice tone="success">Categoría creada correctamente.</AdminNotice>}
        {justDeleted && <AdminNotice tone="warning">Categoría archivada.</AdminNotice>}
        {errorMsg && <AdminNotice tone="error">{errorMsg}</AdminNotice>}

        {categories.length === 0 ? (
          <AdminEmpty
            icon={<Layers className="h-5 w-5" />}
            title="Todavía no hay categorías"
            description="Crea la primera abajo para empezar a categorizar productos."
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="w-16 px-4 py-3 text-left font-semibold">Orden</th>
                <th className="px-4 py-3 text-left font-semibold">Nombre</th>
                <th className="px-4 py-3 text-left font-semibold">Slug</th>
                <th className="px-4 py-3 text-center font-semibold">Productos</th>
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {categories.map((c) => (
                <AdminTableRow key={c.id}>
                  <td className="text-brand-purple-dark/55 px-4 py-3 tabular-nums">{c.order}</td>
                  <td className="px-4 py-3">
                    <div className="text-brand-purple-dark font-medium">{c.name}</div>
                    {c.description && (
                      <div className="text-brand-purple-dark/55 line-clamp-1 text-xs">
                        {c.description}
                      </div>
                    )}
                  </td>
                  <td className="text-brand-purple-dark/75 px-4 py-3 font-mono text-xs">
                    /{c.slug}
                  </td>
                  <td className="text-brand-purple-dark/85 px-4 py-3 text-center tabular-nums">
                    {c._count.products}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.isActive ? (
                      <AdminBadge tone="emerald">Activa</AdminBadge>
                    ) : (
                      <AdminBadge tone="slate">Inactiva</AdminBadge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/categorias/${c.id}`}
                        className="text-brand-purple hover:bg-brand-purple/10 inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium"
                        title="Editar"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Editar
                      </Link>
                      <form action={toggleCategoryActiveAction} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="next" value={c.isActive ? "false" : "true"} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className={`h-7 px-2 ${c.isActive ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                          aria-label={c.isActive ? `Desactivar ${c.name}` : `Activar ${c.name}`}
                          title={
                            c.isActive ? "Ocultar del storefront" : "Volver a mostrar en storefront"
                          }
                        >
                          {c.isActive ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </form>
                      <form action={deleteCategoryAction} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-rose-600 hover:bg-rose-50"
                          aria-label={`Archivar ${c.name}`}
                          disabled={c._count.products > 0}
                          title={
                            c._count.products > 0
                              ? "Tiene productos asociados — moverlos primero"
                              : "Archivar"
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    </div>
                  </td>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}

        <AdminCard className="p-5">
          <div className="mb-3">
            <h3 className="text-brand-purple-dark font-display text-base font-bold">
              Crear nueva categoría
            </h3>
            <p className="text-brand-purple-dark/60 mt-0.5 text-sm">
              Las categorías agrupan productos por tipo (ej. Magnéticos foto, Personalizados marca,
              Decorativos, Pack).
            </p>
          </div>
          <CategoryForm />
        </AdminCard>
      </AdminPageBody>
    </AdminPage>
  );
}
