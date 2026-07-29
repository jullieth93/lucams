/*
 * Admin > Materiales e insumos (Fase 5 — gestión interna).
 *
 * CRUD de materias primas de producción (papel, tintas, imanes, empaques…)
 * con ALERTA de "Bajo stock" cuando stock < minStock: badge rosa en la fila
 * + banner resumen al tope, para que Lucy vea de un vistazo qué reponer.
 *
 * El listado consulta Prisma directo (no hay service en features/): la regla
 * del módulo es autocontenerse bajo esta carpeta y el query es trivial.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, Plus, TriangleAlert } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
} from "@/components/admin-page";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatCOP } from "@/lib/format";
import { deleteMaterialAction, restoreMaterialAction, toggleMaterialActiveAction } from "./actions";
import { MaterialForm, type MaterialFormValues } from "./material-form";

export const metadata: Metadata = {
  title: "Materiales e insumos",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "active", label: "Activos" },
  { key: "inactive", label: "Desactivados" },
  { key: "all", label: "Todos" },
  { key: "trash", label: "Papelera" },
];

function isLowStock(m: { stock: number; minStock: number; isActive: boolean }): boolean {
  // Solo alerta lo activo: un insumo desactivado ya no se usa en producción.
  return m.isActive && m.stock < m.minStock;
}

const numFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export default async function AdminMaterialesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const statusRaw = typeof sp.status === "string" ? sp.status : "active";
  const status = FILTERS.some((f) => f.key === statusRaw) ? statusRaw : "active";
  const isTrash = status === "trash";

  const where =
    status === "trash"
      ? { deletedAt: { not: null } }
      : status === "inactive"
        ? { deletedAt: null, isActive: false }
        : status === "all"
          ? { deletedAt: null }
          : { deletedAt: null, isActive: true };

  const materials = await prisma.material.findMany({ where });

  // Orden amable para operación: primero lo que hay que reponer (bajo stock),
  // luego alfabético. Se ordena en JS porque "stock < minStock" es comparación
  // entre columnas, algo que Prisma no expresa en orderBy.
  materials.sort((a, b) => {
    const la = isLowStock(a) ? 0 : 1;
    const lb = isLowStock(b) ? 0 : 1;
    if (la !== lb) return la - lb;
    return a.name.localeCompare(b.name, "es");
  });

  const lowStockCount = isTrash ? 0 : materials.filter(isLowStock).length;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Boxes className="h-5 w-5" />}
        title="Materiales e insumos"
        subtitle={
          isTrash
            ? `${materials.length} ${materials.length === 1 ? "material eliminado" : "materiales eliminados"}`
            : `${materials.length} ${materials.length === 1 ? "material" : "materiales"}${
                lowStockCount > 0 ? ` · ${lowStockCount} con bajo stock` : ""
              }`
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Producción" },
          { label: "Materiales e insumos" },
        ]}
      />

      <AdminPageBody>
        {sp.created === "1" && <AdminNotice tone="success">Material creado.</AdminNotice>}
        {sp.updated === "1" && <AdminNotice tone="success">Material actualizado.</AdminNotice>}
        {sp.activated === "1" && <AdminNotice tone="success">Material activado.</AdminNotice>}
        {sp.deactivated === "1" && (
          <AdminNotice tone="warning">
            Material desactivado (ya no se usa en producción).
          </AdminNotice>
        )}
        {sp.deleted === "1" && (
          <AdminNotice tone="warning">
            Material eliminado. Puedes restaurarlo desde la Papelera.
          </AdminNotice>
        )}
        {sp.restored === "1" && <AdminNotice tone="success">Material restaurado.</AdminNotice>}
        {typeof sp.error === "string" && <AdminNotice tone="error">{sp.error}</AdminNotice>}

        {lowStockCount > 0 && (
          <AdminNotice tone="warning">
            <strong>
              {lowStockCount === 1
                ? "Hay 1 material con bajo stock."
                : `Hay ${lowStockCount} materiales con bajo stock.`}
            </strong>{" "}
            Están marcados con el badge “Bajo stock” — considera reponerlos antes de que frenen la
            producción.
          </AdminNotice>
        )}

        {!isTrash && (
          <AdminCard className="p-5">
            <h2 className="text-brand-purple-dark font-display mb-4 flex items-center gap-2 text-base font-bold">
              <Plus className="h-5 w-5" />
              Agregar material
            </h2>
            <MaterialForm mode="create" />
          </AdminCard>
        )}

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "active" ? "/admin/materiales" : `/admin/materiales?status=${f.key}`}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                status === f.key
                  ? "bg-brand-purple-dark text-white"
                  : "border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 border"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {materials.length === 0 ? (
          <AdminEmpty
            icon={<Boxes className="h-5 w-5" />}
            title={
              isTrash
                ? "La papelera está vacía"
                : status === "inactive"
                  ? "No hay materiales desactivados"
                  : "No hay materiales todavía"
            }
            description={
              isTrash
                ? "Los materiales eliminados aparecerán acá por si necesitas restaurarlos."
                : status === "inactive"
                  ? "Cuando desactives un material aparecerá en esta vista."
                  : "Usa el formulario de arriba para agregar el primero (papel, tinta, imanes, empaques…)."
            }
          />
        ) : (
          <AdminTable minWidth={800}>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Material</th>
                <th className="px-4 py-3 text-center font-semibold">Unidad</th>
                <th className="px-4 py-3 text-right font-semibold">Stock</th>
                <th className="px-4 py-3 text-right font-semibold">Mínimo</th>
                <th className="px-4 py-3 text-right font-semibold">Costo / unidad</th>
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {materials.map((m) => {
                const low = isLowStock(m);
                const formValues: MaterialFormValues = {
                  id: m.id,
                  name: m.name,
                  unit: m.unit,
                  stock: m.stock,
                  minStock: m.minStock,
                  costPerUnitPesos: m.costPerUnit === null ? null : m.costPerUnit / 100,
                  note: m.note,
                  isActive: m.isActive,
                };
                return (
                  <AdminTableRow key={m.id} className={low ? "bg-rose-50/40" : ""}>
                    <td className="px-4 py-3 align-top">
                      <p className="text-brand-purple-dark text-sm font-semibold">{m.name}</p>
                      {m.note && <p className="text-brand-muted mt-0.5 text-xs">{m.note}</p>}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-center align-top text-xs">
                      {m.unit}
                    </td>
                    <td
                      className={`px-4 py-3 text-right align-top text-sm font-semibold tabular-nums ${
                        low ? "text-rose-700" : "text-brand-purple-dark"
                      }`}
                    >
                      {numFmt.format(m.stock)}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-right align-top text-sm tabular-nums">
                      {numFmt.format(m.minStock)}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-right align-top text-sm tabular-nums">
                      {m.costPerUnit === null ? (
                        <span className="text-brand-muted">—</span>
                      ) : (
                        formatCOP(m.costPerUnit)
                      )}
                    </td>
                    <td className="px-4 py-3 text-center align-top">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {m.deletedAt ? (
                          <AdminBadge tone="slate">Eliminado</AdminBadge>
                        ) : m.isActive ? (
                          <AdminBadge tone="emerald">Activo</AdminBadge>
                        ) : (
                          <AdminBadge tone="amber">Desactivado</AdminBadge>
                        )}
                        {low && (
                          <AdminBadge tone="rose">
                            <TriangleAlert className="mr-1 h-3 w-3" aria-hidden="true" />
                            Bajo stock
                          </AdminBadge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col items-end gap-2">
                        {m.deletedAt ? (
                          <form action={restoreMaterialAction}>
                            <input type="hidden" name="id" value={m.id} />
                            <button
                              type="submit"
                              className="text-brand-purple-dark hover:text-brand-purple text-[11px] font-medium"
                            >
                              Restaurar
                            </button>
                          </form>
                        ) : (
                          <>
                            <details className="w-full max-w-sm">
                              <summary className="text-brand-purple-dark hover:text-brand-purple cursor-pointer list-none text-right text-[11px] font-medium">
                                Editar…
                              </summary>
                              <div className="border-brand-purple/10 mt-2 rounded-lg border bg-white p-4 shadow-sm">
                                <MaterialForm mode="edit" material={formValues} />
                              </div>
                            </details>
                            <div className="flex flex-wrap items-center justify-end gap-3">
                              <form action={toggleMaterialActiveAction}>
                                <input type="hidden" name="id" value={m.id} />
                                <button
                                  type="submit"
                                  className={
                                    m.isActive
                                      ? "text-[11px] font-medium text-amber-700 hover:text-amber-900"
                                      : "text-[11px] font-medium text-emerald-700 hover:text-emerald-900"
                                  }
                                >
                                  {m.isActive ? "Desactivar" : "Activar"}
                                </button>
                              </form>
                              <ConfirmAction
                                action={deleteMaterialAction}
                                message={`¿Eliminar “${m.name}”? Pasará a la papelera y podrás restaurarlo después.`}
                              >
                                <input type="hidden" name="id" value={m.id} />
                                <button
                                  type="submit"
                                  className="text-brand-muted text-[11px] font-medium hover:text-rose-600"
                                >
                                  Eliminar
                                </button>
                              </ConfirmAction>
                            </div>
                          </>
                        )}
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
