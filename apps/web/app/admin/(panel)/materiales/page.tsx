/*
 * Admin > Materiales e insumos (Fase 5 — gestión interna; Fase 7b conecta
 * estos insumos con productos vía la receta ProductMaterial, que alimenta el
 * "costo sugerido por materiales" de /admin/costos).
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
import { Boxes, Calculator, Package, Plus, Search, TriangleAlert, Warehouse } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminSegmentedBar,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
} from "@/components/admin-page";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { CountUp } from "@/components/admin/count-up";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import { requireCapability } from "@/lib/admin-rbac-guard";
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
  { key: "low", label: "Bajo stock" },
  { key: "missing-cost", label: "Sin costo" },
  { key: "inactive", label: "Desactivados" },
  { key: "all", label: "Todos" },
  { key: "trash", label: "Papelera" },
];

function isLowStock(m: { stock: number; minStock: number; isActive: boolean }): boolean {
  // Solo alerta lo activo: un insumo desactivado ya no se usa en producción.
  return m.isActive && m.stock < m.minStock;
}

function buildMaterialesHref(opts: { status?: string; q?: string }): string {
  const params = new URLSearchParams();
  if (opts.status && opts.status !== "active") params.set("status", opts.status);
  if (opts.q) params.set("q", opts.q);
  const qs = params.toString();
  return qs ? `/admin/materiales?${qs}` : "/admin/materiales";
}

const numFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export default async function AdminMaterialesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireCapability("catalog:write");

  const sp = await searchParams;
  const statusRaw = typeof sp.status === "string" ? sp.status : "active";
  const status = FILTERS.some((f) => f.key === statusRaw) ? statusRaw : "active";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const qLower = q.toLocaleLowerCase("es");
  const isTrash = status === "trash";

  const allMaterials = await prisma.material.findMany({
    include: { _count: { select: { usedIn: true } } },
  });

  const liveMaterials = allMaterials.filter((m) => m.deletedAt === null);
  const activeCount = liveMaterials.filter((m) => m.isActive).length;
  const healthyCostedCount = liveMaterials.filter(
    (m) => m.isActive && m.stock >= m.minStock && m.costPerUnit !== null,
  ).length;
  const lowStockGlobalCount = liveMaterials.filter(isLowStock).length;
  const missingCostCount = liveMaterials.filter(
    (m) => m.isActive && m.stock >= m.minStock && m.costPerUnit === null,
  ).length;
  const uncostedActiveTotal = liveMaterials.filter(
    (m) => m.isActive && m.costPerUnit === null,
  ).length;
  const inactiveCount = liveMaterials.filter((m) => !m.isActive).length;
  const trashCount = allMaterials.length - liveMaterials.length;
  const inRecipesCount = liveMaterials.filter((m) => m._count.usedIn > 0).length;
  const inventoryValueCentavos = liveMaterials.reduce(
    (acc, m) =>
      acc + (m.isActive && m.costPerUnit !== null ? Math.round(m.stock * m.costPerUnit) : 0),
    0,
  );

  const materials = allMaterials.filter((m) => {
    if (status === "trash") {
      if (!m.deletedAt) return false;
    } else {
      if (m.deletedAt) return false;
      if (status === "active" && !m.isActive) return false;
      if (status === "low" && !isLowStock(m)) return false;
      if (status === "missing-cost" && !(m.isActive && m.costPerUnit === null)) return false;
      if (status === "inactive" && m.isActive) return false;
    }
    if (!qLower) return true;
    return (
      m.name.toLocaleLowerCase("es").includes(qLower) ||
      m.unit.toLocaleLowerCase("es").includes(qLower) ||
      (m.note ?? "").toLocaleLowerCase("es").includes(qLower)
    );
  });

  // Orden amable para operación: primero lo que hay que reponer (bajo stock),
  // luego alfabético. Se ordena en JS porque "stock < minStock" es comparación
  // entre columnas, algo que Prisma no expresa en orderBy.
  materials.sort((a, b) => {
    const la = isLowStock(a) ? 0 : 1;
    const lb = isLowStock(b) ? 0 : 1;
    if (la !== lb) return la - lb;
    return a.name.localeCompare(b.name, "es");
  });

  const canAccessCostos = canAccessAdminPath(session.admin.role, "/admin/costos");
  const canAccessInventario = canAccessAdminPath(session.admin.role, "/admin/inventario");
  const canAccessProductos = canAccessAdminPath(session.admin.role, "/admin/productos");

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Boxes className="h-5 w-5" />}
        title="Materiales e insumos"
        subtitle={
          isTrash
            ? `${materials.length} ${materials.length === 1 ? "material en papelera" : "materiales en papelera"}`
            : `${activeCount} ${activeCount === 1 ? "insumo activo" : "insumos activos"}${
                lowStockGlobalCount > 0 ? ` · ${lowStockGlobalCount} con bajo stock` : ""
              } · alimentan recetas BOM de productos`
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Producción" },
          { label: "Materiales e insumos" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canAccessCostos && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/costos">
                  <Calculator className="h-4 w-4" />
                  Costos y márgenes
                </Link>
              </Button>
            )}
            {canAccessInventario && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/inventario">
                  <Warehouse className="h-4 w-4" />
                  Inventario
                </Link>
              </Button>
            )}
            {canAccessProductos && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/productos">
                  <Package className="h-4 w-4" />
                  Catálogo
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <AdminPageBody className="space-y-6">
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

        {/* Pulso ejecutivo de taller e insumos BOM */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="border-brand-purple/12 rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-brand-muted text-xs font-medium">Insumos activos</p>
            <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
              <CountUp value={activeCount} />
            </p>
            <p className="text-brand-muted mt-0.5 text-[11px]">
              {uncostedActiveTotal === 0
                ? "100% con costo unitario"
                : `${uncostedActiveTotal} sin costo unitario`}
            </p>
          </div>
          <div
            className={`rounded-xl border p-4 shadow-sm ${
              lowStockGlobalCount > 0
                ? "border-rose-200/80 bg-rose-50/40"
                : "border-emerald-200/80 bg-emerald-50/40"
            }`}
          >
            <p
              className={`text-xs font-medium ${
                lowStockGlobalCount > 0 ? "text-rose-800" : "text-emerald-800"
              }`}
            >
              Alertas de reposición
            </p>
            <p
              className={`font-display mt-1 text-2xl font-bold tabular-nums ${
                lowStockGlobalCount > 0 ? "text-rose-700" : "text-emerald-700"
              }`}
            >
              <CountUp value={lowStockGlobalCount} />
            </p>
            <p
              className={`mt-0.5 text-[11px] ${
                lowStockGlobalCount > 0 ? "text-rose-800/80" : "text-emerald-800/80"
              }`}
            >
              {lowStockGlobalCount > 0 ? "Por debajo del mínimo" : "Stock de taller al día"}
            </p>
          </div>
          <div className="border-brand-purple/12 rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-brand-muted text-xs font-medium">Usados en recetas BOM</p>
            <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
              <CountUp value={inRecipesCount} />
            </p>
            <p className="text-brand-muted mt-0.5 text-[11px]">Alimentan costo sugerido</p>
          </div>
          <div className="border-brand-purple/12 rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-brand-muted text-xs font-medium">Valor estimado en taller</p>
            <p className="text-brand-purple-dark font-display mt-1 text-xl font-bold tabular-nums sm:text-2xl">
              {formatCOP(inventoryValueCentavos)}
            </p>
            <p className="text-brand-muted mt-0.5 text-[11px]">Stock activo × costo unitario</p>
          </div>
        </div>

        {liveMaterials.length > 0 && (
          <AdminCard className="p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-brand-purple-dark text-xs font-semibold tracking-wider uppercase">
                Salud operativa de insumos de producción
              </p>
              <span className="text-brand-muted text-[11px]">Clic en un segmento para filtrar</span>
            </div>
            <AdminSegmentedBar
              ariaLabel="Salud operativa de insumos de producción"
              items={[
                {
                  key: "healthy",
                  label: "Stock sano y costeado",
                  count: healthyCostedCount,
                  tone: "emerald",
                  href: buildMaterialesHref({ status: "active", q }),
                },
                {
                  key: "low",
                  label: "Bajo stock",
                  count: lowStockGlobalCount,
                  tone: "rose",
                  href: buildMaterialesHref({ status: "low", q }),
                },
                {
                  key: "missing-cost",
                  label: "Sin costo unitario",
                  count: missingCostCount,
                  tone: "amber",
                  href: buildMaterialesHref({ status: "missing-cost", q }),
                  sublabel: "sobre mínimo",
                },
                {
                  key: "inactive",
                  label: "Desactivados",
                  count: inactiveCount,
                  tone: "slate",
                  href: buildMaterialesHref({ status: "inactive", q }),
                },
              ]}
            />
          </AdminCard>
        )}

        {lowStockGlobalCount > 0 && (
          <AdminNotice tone="warning">
            <strong>
              {lowStockGlobalCount === 1
                ? "Hay 1 material activo con bajo stock."
                : `Hay ${lowStockGlobalCount} materiales activos con bajo stock.`}
            </strong>{" "}
            Están marcados con el badge «Bajo stock» — considera reponerlos antes de que frenen la
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

        {/* Búsqueda + filtros */}
        <div className="border-brand-purple/10 flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <form action="/admin/materiales" method="GET" className="flex flex-1 items-center gap-2">
            {status !== "active" && <input type="hidden" name="status" value={status} />}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Buscar insumo, unidad o nota…"
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Buscar
            </Button>
            {(q || status !== "active") && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/materiales">Limpiar</Link>
              </Button>
            )}
          </form>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar materiales">
            {FILTERS.map((f) => {
              const count =
                f.key === "active"
                  ? activeCount
                  : f.key === "low"
                    ? lowStockGlobalCount
                    : f.key === "missing-cost"
                      ? uncostedActiveTotal
                      : f.key === "inactive"
                        ? inactiveCount
                        : f.key === "trash"
                          ? trashCount
                          : liveMaterials.length;
              return (
                <Link
                  key={f.key}
                  href={buildMaterialesHref({ status: f.key, q })}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    status === f.key
                      ? "bg-brand-purple-dark text-white"
                      : "border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 border bg-white"
                  }`}
                >
                  {f.label}
                  <span
                    className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                      status === f.key ? "bg-white/20" : "bg-brand-purple/10"
                    }`}
                  >
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {materials.length === 0 ? (
          <AdminEmpty
            icon={<Boxes className="h-5 w-5" />}
            title={
              q
                ? "Ningún material coincide con tu búsqueda"
                : isTrash
                  ? "La papelera está vacía"
                  : status === "low"
                    ? "No hay materiales con bajo stock"
                    : status === "missing-cost"
                      ? "Todos tus materiales activos tienen costo unitario"
                      : status === "inactive"
                        ? "No hay materiales desactivados"
                        : "No hay materiales todavía"
            }
            description={
              q
                ? "Prueba con otro término o limpia el filtro para ver todo el inventario de taller."
                : isTrash
                  ? "Los materiales eliminados aparecerán acá por si necesitas restaurarlos."
                  : status === "inactive"
                    ? "Cuando desactives un material aparecerá en esta vista."
                    : "Usa el formulario de arriba para agregar el primero (papel, tinta, imanes, empaques…)."
            }
          />
        ) : (
          <AdminTable minWidth={880}>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Material</th>
                <th className="px-4 py-3 text-center font-semibold">Unidad</th>
                <th className="px-4 py-3 text-right font-semibold">Stock vs mínimo</th>
                <th className="px-4 py-3 text-right font-semibold">Costo / unidad</th>
                <th className="px-4 py-3 text-center font-semibold">Recetas BOM</th>
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {materials.map((m) => {
                const low = isLowStock(m);
                const coveragePct =
                  m.minStock > 0
                    ? Math.min(100, Math.round((m.stock / (m.minStock * 2)) * 100))
                    : m.stock > 0
                      ? 100
                      : 0;
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
                const deleteWarning =
                  m._count.usedIn > 0
                    ? `¿Enviar «${m.name}» a la papelera? Está vinculado a ${m._count.usedIn} ${
                        m._count.usedIn === 1 ? "receta BOM" : "recetas BOM"
                      } de productos; conservará la trazabilidad histórica y podrás restaurarlo después.`
                    : `¿Enviar «${m.name}» a la papelera? Podrás restaurarlo cuando quieras.`;
                return (
                  <AdminTableRow key={m.id} className={low ? "bg-rose-50/40" : ""}>
                    <td className="px-4 py-3 align-top">
                      <p className="text-brand-purple-dark text-sm font-semibold">{m.name}</p>
                      {m.note && <p className="text-brand-muted mt-0.5 text-xs">{m.note}</p>}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-center align-top text-xs">
                      {m.unit}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <div className="inline-flex min-w-28 flex-col items-end gap-1">
                        <span
                          className={`text-sm font-semibold tabular-nums ${
                            low ? "text-rose-700" : "text-brand-purple-dark"
                          }`}
                        >
                          {numFmt.format(m.stock)}{" "}
                          <span className="text-brand-muted text-xs font-normal">
                            / mín. {numFmt.format(m.minStock)}
                          </span>
                        </span>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200/80">
                          <div
                            className={`admin-bar-grow-x h-full rounded-full ${
                              low ? "bg-rose-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.max(coveragePct, m.stock > 0 ? 8 : 0)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-right align-top text-sm tabular-nums">
                      {m.costPerUnit === null ? (
                        <AdminBadge tone="amber">Sin costo</AdminBadge>
                      ) : (
                        formatCOP(m.costPerUnit)
                      )}
                    </td>
                    <td className="px-4 py-3 text-center align-top">
                      {m._count.usedIn > 0 ? (
                        canAccessCostos ? (
                          <Link
                            href="/admin/costos"
                            className="inline-block transition-opacity hover:opacity-85"
                            title="Ver impacto en Costos y márgenes"
                          >
                            <AdminBadge tone="purple">
                              {m._count.usedIn} {m._count.usedIn === 1 ? "producto" : "productos"}
                            </AdminBadge>
                          </Link>
                        ) : (
                          <AdminBadge tone="purple">
                            {m._count.usedIn} {m._count.usedIn === 1 ? "producto" : "productos"}
                          </AdminBadge>
                        )
                      ) : (
                        <span className="text-brand-muted text-xs">Sin asignar</span>
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
                              <ConfirmAction action={deleteMaterialAction} message={deleteWarning}>
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
