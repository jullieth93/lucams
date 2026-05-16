/*
 * Admin > Productos — Listado paginado.
 *
 * Búsqueda por name / sku / slug (case-insensitive). Filtro por
 * isActive (toggle). Click en fila → editar.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Package, Plus, Search, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminPage, AdminPageHeader, AdminPageBody } from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { formatCOP } from "@/lib/format";
import { listProducts } from "@/features/products/service";

export const metadata: Metadata = {
  title: "Productos",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function AdminProductosPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const search = typeof sp.q === "string" ? sp.q : undefined;
  const justCreated = sp.created === "1";
  const justDeleted = sp.deleted === "1";

  const { items, total, pageSize } = await listProducts({ page, search: search ?? undefined });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Package className="h-5 w-5" />}
        title="Productos"
        subtitle={`${total} ${total === 1 ? "producto" : "productos"} en el catálogo`}
        breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Productos" }]}
        actions={
          <Link
            href="/admin/productos/nuevo"
            className="bg-brand-purple hover:bg-brand-purple-dark inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-white transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Link>
        }
      />

      <AdminPageBody>
        {justCreated && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            ✓ Producto creado.
          </div>
        )}
        {justDeleted && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Producto archivado (soft-delete).
          </div>
        )}

        <form className="flex items-center gap-2">
          <div className="relative max-w-md flex-1">
            <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              name="q"
              defaultValue={search ?? ""}
              placeholder="Buscar por nombre, SKU o slug..."
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="ghost" size="sm">
            Buscar
          </Button>
        </form>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {items.length === 0 ? (
            <EmptyState hasSearch={!!search} />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs tracking-wider text-slate-600 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Producto</th>
                  <th className="px-4 py-3 text-left font-medium">SKU</th>
                  <th className="px-4 py-3 text-left font-medium">Categoría</th>
                  <th className="px-4 py-3 text-right font-medium">Precio</th>
                  <th className="px-4 py-3 text-center font-medium">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500">/{p.slug}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{p.sku}</td>
                    <td className="px-4 py-3 text-slate-700">{p.category.name}</td>
                    <td className="px-4 py-3 text-right text-slate-900 tabular-nums">
                      {formatCOP(p.basePrice)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ProductStatus isActive={p.isActive} isFeatured={p.isFeatured} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/productos/${p.id}`}
                        className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span className="text-xs">Editar</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>
              {total} productos · página {page} de {totalPages}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <PaginationLink page={page - 1} search={search}>
                  ← Anterior
                </PaginationLink>
              )}
              {page < totalPages && (
                <PaginationLink page={page + 1} search={search}>
                  Siguiente →
                </PaginationLink>
              )}
            </div>
          </div>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}

function PaginationLink({
  page,
  search,
  children,
}: {
  page: number;
  search?: string;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (search) params.set("q", search);
  return (
    <Link
      href={`/admin/productos?${params.toString()}`}
      className="rounded border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}

function ProductStatus({ isActive, isFeatured }: { isActive: boolean; isFeatured: boolean }) {
  if (!isActive) {
    return (
      <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        Archivado
      </span>
    );
  }
  if (isFeatured) {
    return (
      <span className="inline-block rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Destacado
      </span>
    );
  }
  return (
    <span className="inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Activo
    </span>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-medium text-slate-700">
        {hasSearch ? "Sin resultados." : "Todavía no hay productos."}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        {hasSearch
          ? "Intenta con otro término de búsqueda."
          : "Crea el primero o usa make seed-products para poblar el catálogo demo."}
      </p>
      {!hasSearch && (
        <Link
          href="/admin/productos/nuevo"
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Crear primer producto
        </Link>
      )}
    </div>
  );
}
