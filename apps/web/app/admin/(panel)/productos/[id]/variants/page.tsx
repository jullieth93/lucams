/*
 * Admin > Productos > [id] > Variantes — Gestión CRUD de variants del producto.
 *
 * Listado + form crear inline + edit con expand inline.
 *
 * Reglas:
 *   - Cada producto tiene al menos 1 variant (la "Default" creada al crear
 *     el producto). No se puede archivar la única activa.
 *   - SKU global único.
 *   - price=null → hereda product.basePrice.
 *   - attributes diferencian variants dentro de la familia (photoSlots,
 *     sizeCm, color, shape, finish, quantity).
 *
 * Brand 2026-05-18: paleta brand, tablas con AdminTable, badges con
 * AdminBadge, empty states con AdminEmpty.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ShoppingBag, Plus, Archive, Edit3 } from "lucide-react";
import { getCurrentAdmin } from "@/lib/auth";
import { getProductById, listVariantsByProduct } from "@/features/products/service";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminNotice,
} from "@/components/admin-page";
import { formatCOP } from "@/lib/format";
import { parseVariantAttributes, generateVariantLabel } from "@/features/products/variant-schemas";
import { VariantForm } from "./variant-form";
import { archiveVariantAction } from "./actions";
import { ConfirmAction } from "@/components/admin/confirm-action";

export const metadata: Metadata = {
  title: "Variantes",
};

type RouteParams = Promise<{ id: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function ProductVariantsPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: SearchParams;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const sp = await searchParams;

  const product = await getProductById(id);
  if (!product) redirect("/admin/productos");

  const variants = await listVariantsByProduct(id);
  const editingId = typeof sp.edit === "string" ? sp.edit : null;
  const newOpen = sp.new === "1";

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<ShoppingBag className="h-5 w-5" />}
        title={
          <>
            Variantes · <span className="text-brand-purple">{product.name}</span>
          </>
        }
        subtitle={
          <>
            {variants.length} {variants.length === 1 ? "variante" : "variantes"} para este producto.
            Cada variante puede tener precio, tamaño, cantidad de fotos y forma propias.
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Catálogo" },
          { label: "Productos", href: "/admin/productos" },
          { label: product.name, href: `/admin/productos/${id}` },
          { label: "Variantes" },
        ]}
        actions={
          !newOpen && !editingId ? (
            <Link
              href={`/admin/productos/${id}/variants?new=1`}
              className="bg-gradient-brand inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold text-white transition-all hover:brightness-110"
            >
              <Plus className="h-4 w-4" />
              Nueva variante
            </Link>
          ) : null
        }
      />

      <AdminPageBody>
        {sp.error && <AdminNotice tone="error">{String(sp.error)}</AdminNotice>}

        <AdminNotice tone="info">
          <strong>¿Qué son las variantes?</strong> Permiten ofrecer el mismo producto en distintas
          cantidades / tamaños / colores. Ej. &quot;Set Polaroid&quot; con variantes de 6, 9 y 12
          fotos. El cliente elige en el PDP, el precio se ajusta solo, y al ir al Estudio se le
          piden los slots correctos. Si dejas el precio vacío hereda el del producto base.
        </AdminNotice>

        {/* Form crear nueva */}
        {newOpen && (
          <AdminCard className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-brand-purple-dark font-display text-lg font-bold">
                Nueva variante
              </h3>
              <Link
                href={`/admin/productos/${id}/variants`}
                className="text-brand-purple-dark/60 hover:text-brand-purple-dark text-xs font-semibold"
              >
                Cancelar
              </Link>
            </div>
            <VariantForm productId={id} />
          </AdminCard>
        )}

        {/* Listado */}
        {variants.length === 0 ? (
          <AdminEmpty
            icon={<ShoppingBag className="h-5 w-5" />}
            title="Este producto no tiene variantes"
            description="Algo raro — todo producto debería tener al menos la variante Default."
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Variante</th>
                <th className="px-4 py-3 text-left font-semibold">SKU</th>
                <th className="px-4 py-3 text-left font-semibold">Atributos</th>
                <th className="px-4 py-3 text-right font-semibold">Precio</th>
                <th className="px-4 py-3 text-right font-semibold">Stock</th>
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acción</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {variants.map((v) => {
                const attrs = parseVariantAttributes(v.attributes);
                const label = generateVariantLabel(attrs);
                const isEditing = editingId === v.id;
                const effectivePrice = v.price ?? product.basePrice;
                const inheritsPrice = v.price === null;

                if (isEditing) {
                  return (
                    <tr key={v.id} className="bg-brand-purple/[0.03]">
                      <td colSpan={7} className="px-4 py-5">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-brand-purple-dark font-display text-base font-bold">
                            Editando: {v.name}
                          </h3>
                          <Link
                            href={`/admin/productos/${id}/variants`}
                            className="text-brand-purple-dark/60 hover:text-brand-purple-dark text-xs font-semibold"
                          >
                            Cancelar edición
                          </Link>
                        </div>
                        <VariantForm
                          productId={id}
                          variant={{
                            id: v.id,
                            name: v.name,
                            sku: v.sku,
                            description: v.description,
                            price: v.price,
                            stock: v.stock,
                            isActive: v.isActive,
                            attributes: attrs,
                          }}
                        />
                      </td>
                    </tr>
                  );
                }

                return (
                  <AdminTableRow key={v.id}>
                    <td className="px-4 py-3">
                      <div className="text-brand-purple-dark font-medium">{v.name}</div>
                      {v.description && (
                        <div className="text-brand-purple-dark/55 line-clamp-1 text-xs">
                          {v.description}
                        </div>
                      )}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 font-mono text-xs">
                      {v.sku}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-xs">
                      <span className="bg-brand-purple/8 inline-block rounded px-2 py-0.5">
                        {label}
                      </span>
                    </td>
                    <td className="text-brand-purple-dark px-4 py-3 text-right font-semibold tabular-nums">
                      {formatCOP(effectivePrice)}
                      {inheritsPrice && (
                        <div className="text-brand-purple-dark/45 text-[10px] font-normal">
                          (hereda base)
                        </div>
                      )}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-right tabular-nums">
                      {v.stock}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {v.isActive ? (
                        <AdminBadge tone="emerald">Activa</AdminBadge>
                      ) : (
                        <AdminBadge tone="slate">Inactiva</AdminBadge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/productos/${id}/variants?edit=${v.id}`}
                          className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Editar
                        </Link>
                        <ConfirmAction
                          action={archiveVariantAction}
                          message={`¿Archivar la variante "${v.name}"? Los pedidos que la referencian seguirán válidos, pero clientes nuevos no podrán seleccionarla.`}
                        >
                          <input type="hidden" name="id" value={v.id} />
                          <input type="hidden" name="productId" value={id} />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                            title="Archivar"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                        </ConfirmAction>
                      </div>
                    </td>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
