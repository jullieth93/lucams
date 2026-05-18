/*
 * Admin > Productos — Listado paginado (brand palette 2026-05-18).
 *
 * Búsqueda por name / sku / slug (case-insensitive). Filtro por isActive.
 * Click en fila → editar. Brand UI: tablas con header brand-purple/5,
 * estados con AdminBadge, empty state con AdminEmpty.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Package, Plus, Search, Edit3, ShoppingBag } from "lucide-react";
import { Input } from "@/components/ui/input";
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
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Catálogo" },
          { label: "Productos" },
        ]}
        actions={
          <AdminButton href="/admin/productos/nuevo" variant="primary">
            <Plus className="h-4 w-4" />
            Nuevo producto
          </AdminButton>
        }
      />

      <AdminPageBody>
        {justCreated && <AdminNotice tone="success">Producto creado correctamente.</AdminNotice>}
        {justDeleted && <AdminNotice tone="warning">Producto archivado (soft-delete).</AdminNotice>}

        <form className="flex items-center gap-2">
          <div className="relative max-w-md flex-1">
            <Search className="text-brand-purple/55 absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
            <Input
              type="search"
              name="q"
              defaultValue={search ?? ""}
              placeholder="Buscar por nombre, SKU o slug…"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30 pl-8"
            />
          </div>
          <AdminButton type="submit" variant="secondary" size="sm">
            Buscar
          </AdminButton>
        </form>

        {items.length === 0 ? (
          <AdminEmpty
            icon={<ShoppingBag className="h-5 w-5" />}
            title={search ? "Sin resultados" : "Todavía no hay productos"}
            description={
              search
                ? `Prueba con otro término o crea un producto nuevo.`
                : "Crea el primero o usa make seed-products para poblar el catálogo demo."
            }
            action={
              !search && (
                <AdminButton href="/admin/productos/nuevo" variant="primary">
                  <Plus className="h-4 w-4" />
                  Crear primer producto
                </AdminButton>
              )
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Producto</th>
                <th className="px-4 py-3 text-left font-semibold">SKU</th>
                <th className="px-4 py-3 text-left font-semibold">Categoría</th>
                <th className="px-4 py-3 text-right font-semibold">Precio</th>
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((p) => (
                <AdminTableRow key={p.id}>
                  <td className="px-4 py-3">
                    <div className="text-brand-purple-dark font-medium">{p.name}</div>
                    <div className="text-brand-purple-dark/50 text-xs">/{p.slug}</div>
                  </td>
                  <td className="text-brand-purple-dark/75 px-4 py-3 font-mono text-xs">{p.sku}</td>
                  <td className="text-brand-purple-dark/85 px-4 py-3">{p.category.name}</td>
                  <td className="text-brand-purple-dark px-4 py-3 text-right font-semibold tabular-nums">
                    {formatCOP(p.basePrice)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ProductStatus isActive={p.isActive} isFeatured={p.isFeatured} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/productos/${p.id}`}
                      className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 text-xs font-medium"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Editar
                    </Link>
                  </td>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}

        {totalPages > 1 && (
          <div className="text-brand-purple-dark/70 flex items-center justify-between text-sm">
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
      className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </Link>
  );
}

function ProductStatus({ isActive, isFeatured }: { isActive: boolean; isFeatured: boolean }) {
  if (!isActive) return <AdminBadge tone="slate">Archivado</AdminBadge>;
  if (isFeatured) return <AdminBadge tone="amber">Destacado</AdminBadge>;
  return <AdminBadge tone="emerald">Activo</AdminBadge>;
}
