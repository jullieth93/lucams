/*
 * <ProductVariantsPanel> — listado + CRUD de variantes inline.
 *
 * Movido desde /admin/productos/[id]/variants/page.tsx (Lucy 2026-06-26
 * Opción C Sprint 2). Antes era sub-ruta escondida; ahora vive en
 * /admin/productos/[id]?section=opciones con el sub-nav del producto
 * siempre visible arriba.
 *
 * Mantiene:
 *  - Form crear / editar inline con ?new=1 / ?edit=ID (deep-linkeable)
 *  - Acciones server actions existentes (createVariantAction,
 *    updateVariantAction, archiveVariantAction) en /productos/[id]/variants/actions.ts
 *  - Notice pedagógico sobre qué son las opciones
 *
 * Renombramos visualmente "variantes" → "opciones" en el copy de Lucy
 * (mantenemos "variant" en código por compatibilidad con schema/types).
 */

import Link from "next/link";
import { ShoppingBag, Plus, Archive, Edit3, Boxes } from "lucide-react";
import {
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
import { listVariantsByProduct } from "@/features/products/service";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { CompactStockEditor } from "@/components/admin/compact-stock-editor";
import { VariantForm } from "@/app/admin/(panel)/productos/[id]/variants/variant-form";
import { archiveVariantAction } from "@/app/admin/(panel)/productos/[id]/variants/actions";

export async function ProductVariantsPanel({
  productId,
  basePrice,
  searchParams,
}: {
  productId: string;
  basePrice: number;
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const variants = await listVariantsByProduct(productId);
  const editingId = typeof searchParams.edit === "string" ? searchParams.edit : null;
  const newOpen = searchParams.new === "1";
  const errorMsg = typeof searchParams.error === "string" ? searchParams.error : null;

  return (
    <section className="space-y-5">
      {errorMsg && <AdminNotice tone="error">{errorMsg}</AdminNotice>}

      <AdminNotice tone="info">
        <strong>¿Qué son las opciones?</strong> Permiten ofrecer el mismo producto en distintas
        cantidades, tamaños o colores. Ejemplo: el &quot;Set Polaroid&quot; con opciones de 6, 9
        y 12 fotos. El cliente elige en la tienda, el precio se ajusta solo, y al ir al estudio
        de personalización se le piden los espacios correctos. Si dejas el precio vacío, hereda
        el del producto base.
      </AdminNotice>

      {!newOpen && !editingId && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Aquí editas el stock de ESTE producto; en Inventario ves el de todos. */}
          <Link
            href="/admin/inventario"
            className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 text-xs font-semibold"
          >
            <Boxes className="h-3.5 w-3.5" />
            Ver el inventario de todos los productos →
          </Link>
          <Link
            href={`/admin/productos/${productId}?section=opciones&new=1`}
            className="bg-gradient-brand inline-flex h-11 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Nueva opción
          </Link>
        </div>
      )}

      {/* Form crear nueva */}
      {newOpen && (
        <AdminCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-brand-purple-dark font-display text-lg font-bold">
              Nueva opción
            </h3>
            <Link
              href={`/admin/productos/${productId}?section=opciones`}
              className="text-brand-purple-dark/60 hover:text-brand-purple-dark text-xs font-semibold"
            >
              Cancelar
            </Link>
          </div>
          <VariantForm productId={productId} />
        </AdminCard>
      )}

      {/* Listado */}
      {variants.length === 0 ? (
        <AdminEmpty
          icon={<ShoppingBag className="h-5 w-5" />}
          title="Este producto no tiene opciones"
          description="Es raro — todo producto debería tener al menos la opción Única. Crea una con el botón de arriba."
        />
      ) : (
        <AdminTable>
          <AdminTableHead>
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Opción</th>
              <th className="px-4 py-3 text-left font-semibold">Código</th>
              <th className="px-4 py-3 text-left font-semibold">Características</th>
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
              const effectivePrice = v.price ?? basePrice;
              const inheritsPrice = v.price === null;
              const visibleName = v.name === "Default" ? "Única" : v.name;

              if (isEditing) {
                return (
                  <tr key={v.id} className="bg-brand-purple/[0.03]">
                    <td colSpan={7} className="px-4 py-5">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-brand-purple-dark font-display text-base font-bold">
                          Editando: {visibleName}
                        </h3>
                        <Link
                          href={`/admin/productos/${productId}?section=opciones`}
                          className="text-brand-purple-dark/60 hover:text-brand-purple-dark text-xs font-semibold"
                        >
                          Cancelar
                        </Link>
                      </div>
                      <VariantForm
                        productId={productId}
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
                    <div className="text-brand-purple-dark font-medium">{visibleName}</div>
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
                        (hereda del producto)
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {/* Editor rápido de stock — mismo que en Inventario, para
                        que ajustar stock se sienta igual en los dos lados. */}
                    <CompactStockEditor
                      variantId={v.id}
                      productId={productId}
                      currentStock={v.stock}
                    />
                  </td>
                  <td className="px-4 py-3 text-center align-top">
                    {v.isActive ? (
                      <AdminBadge tone="emerald">Activa</AdminBadge>
                    ) : (
                      <AdminBadge tone="slate">Pausada</AdminBadge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/productos/${productId}?section=opciones&edit=${v.id}`}
                        className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Editar
                      </Link>
                      <ConfirmAction
                        action={archiveVariantAction}
                        message={`¿Archivar la opción "${visibleName}"? Los pedidos que la usan siguen válidos, pero clientes nuevos no podrán seleccionarla.`}
                      >
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="productId" value={productId} />
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
    </section>
  );
}
