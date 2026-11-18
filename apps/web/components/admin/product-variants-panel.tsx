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
import { Hint } from "@/components/ui/tooltip";
import {
  groupVariantsByCoverSignature,
  parseVariantAttributes,
  generateVariantLabel,
  sameImageArrays,
  variantCoverSignature,
} from "@/features/products/variant-schemas";
import { PACK_STOCK_PANEL_NOTE } from "@/features/products/stock-constants";
import { listVariantsByProduct } from "@/features/products/service";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { CompactStockEditor } from "@/components/admin/compact-stock-editor";
import { VariantForm } from "@/app/admin/(panel)/productos/[id]/variants/variant-form";
import { VariantImages } from "@/app/admin/(panel)/productos/[id]/variants/variant-images";
import { archiveVariantAction } from "@/app/admin/(panel)/productos/[id]/variants/actions";

export async function ProductVariantsPanel({
  productId,
  basePrice,
  fulfillmentMode,
  productImageCount,
  searchParams,
}: {
  productId: string;
  basePrice: number;
  fulfillmentMode: "MADE_TO_ORDER" | "PHYSICAL_STOCK";
  /** Fotos del producto — para explicar la herencia en VariantImages (D1). */
  productImageCount: number;
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const variants = await listVariantsByProduct(productId);
  const editingId = typeof searchParams.edit === "string" ? searchParams.edit : null;
  const editingVariant = editingId ? (variants.find((v) => v.id === editingId) ?? null) : null;
  const newOpen = searchParams.new === "1";

  const activeVariantsList = variants.filter((v) => v.isActive);
  const pausedVariantsList = variants.filter((v) => !v.isActive);
  const isPackBased = activeVariantsList.some(
    (v) => (parseVariantAttributes(v.attributes).quantity ?? 1) > 1,
  );
  // Lucy 2026-06-27: al crear/editar mostramos SOLO el form (no la tabla con su
  // encabezado flotando encima — se veía como un "error de UI").
  const formMode = newOpen || editingVariant !== null;
  const errorMsg = typeof searchParams.error === "string" ? searchParams.error : null;

  // Portadas por DISEÑO (Lucy 2026-08-25): la opción en edición comparte sus
  // fotos con las opciones ACTIVAS de la misma firma visual.
  const editingCoverGroup = editingVariant
    ? (groupVariantsByCoverSignature(activeVariantsList).get(
        variantCoverSignature(parseVariantAttributes(editingVariant.attributes)),
      ) ?? [editingVariant])
    : [];
  const editingCoverDivergent =
    editingVariant !== null &&
    editingCoverGroup.some((v) => !sameImageArrays(v.images, editingVariant.images));

  return (
    <section className="space-y-5">
      {errorMsg && <AdminNotice tone="error">{errorMsg}</AdminNotice>}

      <AdminNotice tone="info">
        <strong>¿Qué son las opciones?</strong> Definen únicamente atributos físicos del producto
        (tamaño, si lleva imán o no, color o idioma) sobre su unidad comercial base (1 unidad o 1
        pack de 6). Los descuentos automáticos por llevar varias unidades viven exclusivamente en{" "}
        <Link href="/admin/mayorista" className="font-semibold underline underline-offset-2">
          Precios al por mayor
        </Link>
        .
      </AdminNotice>

      {!formMode && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {fulfillmentMode === "PHYSICAL_STOCK" ? (
            <Link
              href="/admin/inventario"
              className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-xs font-semibold"
            >
              <Boxes className="h-3.5 w-3.5" />
              Ir al inventario completo →
            </Link>
          ) : (
            <span className="text-brand-muted text-xs font-medium">
              Producto bajo pedido: no maneja stock de unidades terminadas.
            </span>
          )}
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
            <h3 className="text-brand-purple-dark font-display text-lg font-bold">Nueva opción</h3>
            <Link
              href={`/admin/productos/${productId}?section=opciones`}
              className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
            >
              Cancelar
            </Link>
          </div>
          <VariantForm productId={productId} trackStock={fulfillmentMode === "PHYSICAL_STOCK"} />
        </AdminCard>
      )}

      {/* Form editar — FUERA de la tabla (Lucy 2026-06-27). */}
      {editingVariant && (
        <AdminCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-brand-purple-dark font-display text-lg font-bold">
              Editando: {editingVariant.name === "Default" ? "Única" : editingVariant.name}
            </h3>
            <Link
              href={`/admin/productos/${productId}?section=opciones`}
              className="text-brand-muted hover:text-brand-purple-dark inline-flex items-center gap-1 text-xs font-semibold"
            >
              ← Volver a las opciones
            </Link>
          </div>
          <VariantForm
            productId={productId}
            trackStock={fulfillmentMode === "PHYSICAL_STOCK"}
            variant={{
              id: editingVariant.id,
              name: editingVariant.name,
              sku: editingVariant.sku,
              description: editingVariant.description,
              price: editingVariant.price,
              compareAtPrice: editingVariant.compareAtPrice,
              stock: editingVariant.stock,
              safetyStock: editingVariant.safetyStock,
              isActive: editingVariant.isActive,
              attributes: parseVariantAttributes(editingVariant.attributes),
            }}
          />
          {/* D1: fotos propias de esta opción (vacío = hereda del producto).
              Portadas por diseño (Lucy 2026-08-25): el grupo comparte fotos. */}
          <div className="mt-4">
            <VariantImages
              variantId={editingVariant.id}
              images={editingVariant.images}
              productImageCount={productImageCount}
              groupSize={editingCoverGroup.length}
              groupNames={editingCoverGroup.map((v) => (v.name === "Default" ? "Única" : v.name))}
              divergent={editingCoverDivergent}
            />
          </div>
        </AdminCard>
      )}

      {/* Listado (oculto mientras creas/editas) */}
      {!formMode &&
        (variants.length === 0 ? (
          <AdminEmpty
            icon={<ShoppingBag className="h-5 w-5" />}
            title="Este producto no tiene opciones"
            description="Es raro — todo producto debería tener al menos la opción Única. Crea una con el botón de arriba."
          />
        ) : (
          <>
            {isPackBased && (
              <p className="text-brand-muted mb-3 text-xs leading-snug">{PACK_STOCK_PANEL_NOTE}</p>
            )}
            <AdminTable>
              <AdminTableHead>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Opción</th>
                  <th className="px-4 py-3 text-left font-semibold">Código</th>
                  <th className="px-4 py-3 text-left font-semibold">Características</th>
                  <th className="px-4 py-3 text-right font-semibold">Precio</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    {fulfillmentMode === "MADE_TO_ORDER"
                      ? "Inventario"
                      : isPackBased
                        ? "Stock (packs)"
                        : "Stock"}
                  </th>
                  <th className="px-4 py-3 text-center font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Acción</th>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {activeVariantsList.map((v) => {
                  const attrs = parseVariantAttributes(v.attributes);
                  const label = generateVariantLabel(attrs);
                  const effectivePrice = v.price ?? basePrice;
                  const inheritsPrice = v.price === null;
                  const visibleName = v.name === "Default" ? "Única" : v.name;

                  return (
                    <AdminTableRow key={v.id}>
                      <td className="px-4 py-3">
                        <div className="text-brand-purple-dark font-medium">{visibleName}</div>
                        {v.description && (
                          <div className="text-brand-muted line-clamp-1 text-xs">
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
                          <div className="text-brand-muted text-[10px] font-normal">
                            (hereda del producto)
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {fulfillmentMode === "PHYSICAL_STOCK" ? (
                          <CompactStockEditor
                            variantId={v.id}
                            productId={productId}
                            currentStock={v.stock}
                          />
                        ) : (
                          <span className="text-brand-muted text-xs">Bajo pedido</span>
                        )}
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
                            className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
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
                            <Hint content="Archivar">
                              {/* aria-label: antes el `title` hacía de nombre accesible
                                  del botón (icon-only); Hint lo mueve a description. */}
                              <button
                                type="submit"
                                aria-label="Archivar"
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </button>
                            </Hint>
                          </ConfirmAction>
                        </div>
                      </td>
                    </AdminTableRow>
                  );
                })}
              </AdminTableBody>
            </AdminTable>

            {pausedVariantsList.length > 0 && (
              <details className="border-brand-purple/15 rounded-xl border bg-slate-50/70 p-4">
                <summary className="text-brand-muted hover:text-brand-purple-dark cursor-pointer text-xs font-semibold">
                  Opciones históricas pausadas ({pausedVariantsList.length}) — conservadas para
                  pedidos anteriores, ocultas en tienda
                </summary>
                <div className="mt-3">
                  <AdminTable>
                    <AdminTableBody>
                      {pausedVariantsList.map((v) => {
                        const visibleName = v.name === "Default" ? "Única" : v.name;
                        return (
                          <AdminTableRow key={v.id} className="opacity-75">
                            <td className="px-4 py-2.5 text-xs font-medium">{visibleName}</td>
                            <td className="px-4 py-2.5 font-mono text-xs">{v.sku}</td>
                            <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                              {formatCOP(v.price ?? basePrice)}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <AdminBadge tone="slate">Pausada</AdminBadge>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <Link
                                href={`/admin/productos/${productId}?section=opciones&edit=${v.id}`}
                                className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                Ver / Editar
                              </Link>
                            </td>
                          </AdminTableRow>
                        );
                      })}
                    </AdminTableBody>
                  </AdminTable>
                </div>
              </details>
            )}
          </>
        ))}
    </section>
  );
}
