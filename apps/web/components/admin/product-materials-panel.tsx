/*
 * <ProductMaterialsPanel> — Fase 7b, costeo por materiales.
 *
 * Pestaña "Materiales" de /admin/productos/[id]: la RECETA del producto
 * (bill of materials simple) — qué insumos lleva una unidad y en qué cantidad.
 *
 * Cada fila muestra material, cantidad editable inline, costo por unidad del
 * insumo (Material.costPerUnit, centavos COP) y subtotal; al pie, el COSTO
 * SUGERIDO de fabricación (Σ cantidad × costo unitario, ver
 * features/products/recipe-cost.ts). Ese sugerido es INFORMATIVO: se aplica a
 * Product.cost solo desde /admin/costos, con el botón "Usar costo sugerido".
 *
 * Server component puro: la página ([id]/page.tsx) fetchea receta + catálogo
 * de insumos y las mutaciones van por product-materials-actions (MANAGER_UP,
 * audit trail) con redirect de vuelta a ?section=materiales.
 */

import { Boxes, Plus, TriangleAlert } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmpty,
  AdminNotice,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
} from "@/components/admin-page";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Input } from "@/components/ui/input";
import { formatCOP } from "@/lib/format";
import { computeRecipeCost, computeRecipeLineCost } from "@/features/products/recipe-cost";
import {
  addProductMaterialAction,
  removeProductMaterialAction,
  updateProductMaterialAction,
} from "@/app/admin/(panel)/productos/product-materials-actions";

export type RecipeItemView = {
  id: string;
  quantity: number;
  note: string | null;
  material: { id: string; name: string; unit: string; costPerUnit: number | null };
};

export type MaterialOption = {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number | null;
};

type SearchParams = { [key: string]: string | string[] | undefined };

const qtyFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });

export function ProductMaterialsPanel({
  productId,
  items,
  availableMaterials,
  searchParams: sp,
}: {
  productId: string;
  items: RecipeItemView[];
  availableMaterials: MaterialOption[];
  searchParams: SearchParams;
}) {
  // El sugerido es null si la receta está vacía O si algún insumo no tiene
  // costo cargado — en ese caso avisamos en vez de mostrar un total mentiroso.
  const suggested = computeRecipeCost(
    items.map((i) => ({ quantity: i.quantity, costPerUnit: i.material.costPerUnit })),
  );
  const missingCosts =
    items.length > 0 && suggested === null && items.some((i) => i.material.costPerUnit === null);

  // No ofrecer en el <select> insumos que ya están en la receta (el unique
  // [productId, materialId] los rechazaría igual, pero mejor no tentar).
  const alreadyInRecipe = new Set(items.map((i) => i.material.id));
  const selectable = availableMaterials.filter((m) => !alreadyInRecipe.has(m.id));

  return (
    <div className="space-y-5">
      {sp.added === "1" && <AdminNotice tone="success">Material agregado a la receta.</AdminNotice>}
      {sp.updated === "1" && <AdminNotice tone="success">Cantidad actualizada.</AdminNotice>}
      {sp.removed === "1" && (
        <AdminNotice tone="success">Material quitado de la receta.</AdminNotice>
      )}
      {typeof sp.error === "string" && <AdminNotice tone="error">{sp.error}</AdminNotice>}

      <AdminNotice tone="info">
        <strong>¿Para qué sirve la receta?</strong> Define qué materiales lleva fabricar{" "}
        <strong>una unidad</strong> de este producto. Con eso, la pantalla{" "}
        <strong>Costos y márgenes</strong> te muestra un “costo sugerido por materiales” junto al
        costo que cargaste a mano — el sugerido nunca pisa tu costo hasta que decidas usarlo.
      </AdminNotice>

      {missingCosts && (
        <AdminNotice tone="warning">
          <TriangleAlert className="mr-1 inline h-4 w-4 align-text-bottom" aria-hidden="true" />
          Algún insumo de la receta no tiene <strong>costo por unidad</strong> cargado, así que el
          costo sugerido no se puede calcular. Complétalo en{" "}
          <strong>Producción → Materiales e insumos</strong>.
        </AdminNotice>
      )}

      <AdminCard className="p-5">
        <h2 className="text-brand-purple-dark font-display mb-4 flex items-center gap-2 text-base font-bold">
          <Plus className="h-5 w-5" />
          Agregar material a la receta
        </h2>
        {selectable.length === 0 ? (
          <p className="text-brand-muted text-sm">
            {availableMaterials.length === 0
              ? "Todavía no hay materiales cargados. Créalos en Producción → Materiales e insumos."
              : "Todos los materiales activos ya están en la receta."}
          </p>
        ) : (
          <form action={addProductMaterialAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="productId" value={productId} />
            <div className="min-w-52 flex-1">
              <label
                htmlFor="pm-material"
                className="text-brand-purple-dark mb-1 block text-xs font-semibold"
              >
                Material
              </label>
              <select
                id="pm-material"
                name="materialId"
                required
                className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-9 w-full rounded-md border bg-white px-2 text-sm"
              >
                {selectable.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.unit})
                    {m.costPerUnit === null ? " — sin costo" : ` — ${formatCOP(m.costPerUnit)}/u`}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <label
                htmlFor="pm-quantity"
                className="text-brand-purple-dark mb-1 block text-xs font-semibold"
              >
                Cantidad / unidad
              </label>
              <Input
                id="pm-quantity"
                name="quantity"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                placeholder="0,75"
                required
                className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-9"
              />
            </div>
            <div className="min-w-40 flex-1">
              <label
                htmlFor="pm-note"
                className="text-brand-purple-dark mb-1 block text-xs font-semibold"
              >
                Nota (opcional)
              </label>
              <Input
                id="pm-note"
                name="note"
                type="text"
                maxLength={200}
                placeholder="ej. para la base"
                className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-9"
              />
            </div>
            <AdminButton type="submit" size="sm" pendingLabel="Agregando…">
              Agregar
            </AdminButton>
          </form>
        )}
      </AdminCard>

      {items.length === 0 ? (
        <AdminEmpty
          icon={<Boxes className="h-5 w-5" />}
          title="Este producto no tiene receta todavía"
          description="Agrega los materiales que lleva fabricar una unidad (papel, tinta, imanes, empaque…) y Costos te mostrará el costo sugerido."
        />
      ) : (
        <AdminTable minWidth={900}>
          <AdminTableHead>
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Material</th>
              <th className="px-4 py-3 text-right font-semibold">Cantidad / unidad</th>
              <th className="px-4 py-3 text-right font-semibold">Costo / unidad</th>
              <th className="px-4 py-3 text-right font-semibold">Subtotal</th>
              <th className="px-4 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {items.map((item) => {
              const lineCost = computeRecipeLineCost(item.quantity, item.material.costPerUnit);
              return (
                <AdminTableRow key={item.id}>
                  <td className="px-4 py-3 align-top">
                    <p className="text-brand-purple-dark text-sm font-semibold">
                      {item.material.name}
                    </p>
                    <p className="text-brand-muted mt-0.5 text-xs">
                      {item.material.unit}
                      {item.note ? ` · ${item.note}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {/* Cantidad editable inline: input + Guardar en la misma celda
                        para que el ajuste fino (0,75 m → 0,8 m) sea de un paso. */}
                    <form
                      action={updateProductMaterialAction}
                      className="flex items-center justify-end gap-2"
                    >
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="productId" value={productId} />
                      <input type="hidden" name="note" value={item.note ?? ""} />
                      <Input
                        name="quantity"
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        defaultValue={item.quantity}
                        aria-label={`Cantidad de ${item.material.name} por unidad`}
                        className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-8 w-24 text-right"
                      />
                      <AdminButton type="submit" size="sm" variant="secondary" pendingLabel="…">
                        Guardar
                      </AdminButton>
                    </form>
                  </td>
                  <td className="text-brand-purple-dark/85 px-4 py-3 text-right align-top text-sm tabular-nums">
                    {item.material.costPerUnit === null ? (
                      <AdminBadge tone="amber">sin costo</AdminBadge>
                    ) : (
                      formatCOP(item.material.costPerUnit)
                    )}
                  </td>
                  <td className="text-brand-purple-dark/85 px-4 py-3 text-right align-top text-sm font-semibold tabular-nums">
                    {lineCost === null ? (
                      <span className="text-brand-muted">—</span>
                    ) : (
                      formatCOP(lineCost)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right align-top">
                    <ConfirmAction
                      action={removeProductMaterialAction}
                      message={`¿Quitar “${item.material.name}” de la receta de este producto? El material sigue existiendo en Materiales e insumos.`}
                    >
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="productId" value={productId} />
                      <button
                        type="submit"
                        className="text-brand-muted text-[11px] font-medium hover:text-rose-600"
                      >
                        Quitar
                      </button>
                    </ConfirmAction>
                  </td>
                </AdminTableRow>
              );
            })}
            {/* Fila total: el costo sugerido por materiales. */}
            <AdminTableRow className="bg-brand-purple/5">
              <td className="text-brand-purple-dark px-4 py-3 text-sm font-bold" colSpan={3}>
                Costo sugerido por materiales ({qtyFmt.format(items.length)}{" "}
                {items.length === 1 ? "insumo" : "insumos"})
              </td>
              <td className="text-brand-purple-dark px-4 py-3 text-right text-sm font-bold tabular-nums">
                {suggested === null ? (
                  <AdminBadge tone="amber">no calculable</AdminBadge>
                ) : (
                  formatCOP(suggested)
                )}
              </td>
              <td className="px-4 py-3" />
            </AdminTableRow>
          </AdminTableBody>
        </AdminTable>
      )}
    </div>
  );
}
