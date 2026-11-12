/*
 * Admin > Costos y márgenes — análisis de costo de fabricación vs precio de venta.
 *
 * Dos fuentes de costo por producto:
 *   - MANUAL: Product.cost (centavos COP), editable inline acá mismo.
 *   - SUGERIDO POR MATERIALES (Fase 7b — costeo por materiales): Σ cantidad ×
 *     costo unitario de la receta ProductMaterial (features/products/recipe-cost.ts).
 *     Es INFORMATIVO — nunca pisa Product.cost solo; Lucy lo aplica con el
 *     botón "Usar sugerido", que llama a la misma action del costo manual.
 *
 * El precio de venta se deriva de las variantes — ProductVariant.price con
 * fallback a Product.basePrice cuando la opción no tiene precio propio (misma
 * regla de herencia que aplica el PDP).
 *
 * El margen se calcula sobre el precio MÍNIMO de variantes (peor escenario de
 * venta) y la tabla ordena ascendente: los productos que menos dejan aparecen
 * primero, para que Lucy sepa dónde subir precio o negociar insumos. Los
 * productos sin costo cargado van al final con badge gris — sin costo no hay
 * margen que analizar.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, Calculator, DollarSign, Eye, Package, Search } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminDonutChart,
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
import { CountUp } from "@/components/admin/count-up";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ADMIN_ROLE_SETS, canAccessAdminPath, hasCapability } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { prisma } from "@/lib/db";
import { formatCOP } from "@/lib/format";
import { computeRecipeCost } from "@/features/products/recipe-cost";
import { updateProductCostAction } from "./actions";

export const metadata: Metadata = {
  title: "Costos y márgenes",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type Row = {
  id: string;
  name: string;
  sku: string;
  cost: number | null;
  /** Fase 7b — costo sugerido por receta (centavos); null = sin receta o insumo sin costo. */
  suggestedCost: number | null;
  /** Tiene receta cargada (aunque no sea calculable por falta de costos de insumos). */
  hasRecipe: boolean;
  recipeCount: number;
  minPrice: number;
  maxPrice: number;
  margin: number | null;
  marginPct: number | null;
};

type HealthFilter = "all" | "loss" | "tight" | "healthy" | "missing" | "diff";

function parseHealthFilter(raw?: string): HealthFilter {
  if (
    raw === "loss" ||
    raw === "tight" ||
    raw === "healthy" ||
    raw === "missing" ||
    raw === "diff"
  ) {
    return raw;
  }
  return "all";
}

function buildCostosHref(opts: { q?: string; health?: HealthFilter }): string {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  if (opts.health && opts.health !== "all") params.set("health", opts.health);
  const qs = params.toString();
  return qs ? `/admin/costos?${qs}` : "/admin/costos";
}

function marginTone(pct: number): "rose" | "amber" | "emerald" {
  // Umbrales de bolsillo para Lucy: negativo = se pierde plata; <20% = queda
  // muy justo frente a envío/comisiones; el resto es sano.
  if (pct < 0) return "rose";
  if (pct < 20) return "amber";
  return "emerald";
}

export default async function AdminCostosPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireRole(ADMIN_ROLE_SETS.COSTOS_READ);
  const canEditCost = hasCapability(session.admin.role, "catalog:write");
  const canAccessCatalog = canAccessAdminPath(session.admin.role, "/admin/productos");
  const canAccessMateriales = canAccessAdminPath(session.admin.role, "/admin/materiales");
  const canAccessFinanzas = canAccessAdminPath(session.admin.role, "/admin/finanzas");

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const qLower = q.toLocaleLowerCase("es");
  const health = parseHealthFilter(typeof sp.health === "string" ? sp.health : undefined);

  const products = await prisma.product.findMany({
    where: { deletedAt: null, isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      basePrice: true,
      cost: true,
      variants: {
        where: { deletedAt: null, isActive: true },
        select: { price: true },
      },
      // Fase 7b — receta de materiales para el costo sugerido (roll-up en JS
      // con computeRecipeCost; el filtro de insumos sin costo lo hace la función).
      recipe: {
        select: { quantity: true, material: { select: { costPerUnit: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows: Row[] = products.map((p) => {
    // Variante sin precio propio hereda basePrice; producto sin variantes
    // cotiza directo al basePrice.
    const prices =
      p.variants.length > 0 ? p.variants.map((v) => v.price ?? p.basePrice) : [p.basePrice];
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const margin = p.cost != null ? minPrice - p.cost : null;
    const marginPct = margin != null && minPrice > 0 ? (margin / minPrice) * 100 : null;
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      cost: p.cost,
      suggestedCost: computeRecipeCost(
        p.recipe.map((i) => ({ quantity: i.quantity, costPerUnit: i.material.costPerUnit })),
      ),
      hasRecipe: p.recipe.length > 0,
      recipeCount: p.recipe.length,
      minPrice,
      maxPrice,
      margin,
      marginPct,
    };
  });

  // Peores primero; sin costo al final (no tienen margen calculable).
  rows.sort((a, b) => {
    if (a.margin == null && b.margin == null) return a.name.localeCompare(b.name, "es");
    if (a.margin == null) return 1;
    if (b.margin == null) return -1;
    return a.margin - b.margin;
  });

  const healthyCount = rows.filter((r) => r.marginPct != null && r.marginPct >= 20).length;
  const tightCount = rows.filter(
    (r) => r.marginPct != null && r.marginPct >= 0 && r.marginPct < 20,
  ).length;
  const lossCount = rows.filter((r) => r.marginPct != null && r.marginPct < 0).length;
  const alertCount = lossCount + tightCount;
  const sinCosto = rows.filter((r) => r.cost == null).length;
  const withRecipeCount = rows.filter((r) => r.hasRecipe).length;
  const diffCount = rows.filter(
    (r) => r.cost != null && r.suggestedCost != null && r.cost !== r.suggestedCost,
  ).length;
  const costedRows = rows.filter((r) => r.marginPct != null);
  const avgMarginPct =
    costedRows.length > 0
      ? Math.round(costedRows.reduce((acc, r) => acc + (r.marginPct ?? 0), 0) / costedRows.length)
      : null;

  const filteredRows = rows.filter((r) => {
    if (health === "loss" && !(r.marginPct != null && r.marginPct < 0)) return false;
    if (health === "tight" && !(r.marginPct != null && r.marginPct >= 0 && r.marginPct < 20))
      return false;
    if (health === "healthy" && !(r.marginPct != null && r.marginPct >= 20)) return false;
    if (health === "missing" && r.cost != null) return false;
    if (
      health === "diff" &&
      !(r.cost != null && r.suggestedCost != null && r.cost !== r.suggestedCost)
    )
      return false;
    if (!qLower) return true;
    return (
      r.name.toLocaleLowerCase("es").includes(qLower) ||
      r.sku.toLocaleLowerCase("es").includes(qLower)
    );
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Calculator className="h-5 w-5" />}
        title="Costos y márgenes"
        subtitle={
          <>
            {rows.length} {rows.length === 1 ? "producto activo" : "productos activos"} · fuente
            única de costo unitario y rentabilidad BOM
            {sinCosto > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-amber-700">{sinCosto} sin costo cargado</span>
              </>
            )}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Producción" },
          { label: "Costos y márgenes" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canAccessMateriales && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/materiales">
                  <Boxes className="h-4 w-4" />
                  Materiales e insumos
                </Link>
              </Button>
            )}
            {canAccessCatalog && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/productos">
                  <Package className="h-4 w-4" />
                  Catálogo
                </Link>
              </Button>
            )}
            {canAccessFinanzas && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/finanzas">
                  <DollarSign className="h-4 w-4" />
                  Finanzas
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <AdminPageBody className="space-y-6">
        {!canEditCost ? (
          <AdminNotice tone="info">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Eye className="h-4 w-4 shrink-0" />
              Vista analítica de solo lectura:
            </span>{" "}
            puedes auditar costos unitarios, sugeridos por receta BOM y márgenes brutos de todo el
            catálogo activo. La actualización de costos está centralizada en Operaciones y
            Superadmin.
          </AdminNotice>
        ) : (
          <AdminNotice tone="info">
            <strong>¿Cómo leer esta tabla?</strong> Aquí se centraliza el{" "}
            <strong>costo de fabricación por unidad</strong> (materiales + mano de obra, en pesos)
            de todo el catálogo contra el <strong>precio mínimo de venta</strong> de cada producto.
            Si el producto tiene <strong>receta BOM</strong>, verás el{" "}
            <strong>costo sugerido</strong> por insumos y podrás aplicarlo con un clic en «Usar
            sugerido». Los productos con peor margen aparecen primero.
          </AdminNotice>
        )}

        {sp.updated === "1" && <AdminNotice tone="success">Costo actualizado.</AdminNotice>}
        {typeof sp.error === "string" && <AdminNotice tone="error">{sp.error}</AdminNotice>}

        {/* Dashboard ejecutivo de rentabilidad y cobertura BOM */}
        {rows.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="grid grid-cols-2 gap-3 lg:col-span-7">
              <div className="border-brand-purple/12 rounded-xl border bg-white p-4 shadow-sm">
                <p className="text-brand-muted text-xs font-medium">Margen bruto promedio</p>
                <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
                  {avgMarginPct !== null ? (
                    <>
                      <CountUp value={avgMarginPct} />%
                    </>
                  ) : (
                    "—"
                  )}
                </p>
                <p className="text-brand-muted mt-0.5 text-[11px]">
                  Sobre {costedRows.length} productos con costo
                </p>
              </div>
              <div
                className={`rounded-xl border p-4 shadow-sm ${
                  alertCount > 0
                    ? "border-rose-200/80 bg-rose-50/40"
                    : "border-emerald-200/80 bg-emerald-50/40"
                }`}
              >
                <p
                  className={`text-xs font-medium ${
                    alertCount > 0 ? "text-rose-800" : "text-emerald-800"
                  }`}
                >
                  En alerta (&lt; 20% o pérdida)
                </p>
                <p
                  className={`font-display mt-1 text-2xl font-bold tabular-nums ${
                    alertCount > 0 ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  <CountUp value={alertCount} />
                </p>
                <p
                  className={`mt-0.5 text-[11px] ${
                    alertCount > 0 ? "text-rose-800/80" : "text-emerald-800/80"
                  }`}
                >
                  {lossCount > 0
                    ? `${lossCount} en pérdida · ${tightCount} ajustados`
                    : alertCount > 0
                      ? `${tightCount} con margen ajustado`
                      : "Todos sobre 20%"}
                </p>
              </div>
              <div className="border-brand-purple/12 rounded-xl border bg-white p-4 shadow-sm">
                <p className="text-brand-muted text-xs font-medium">Con receta BOM</p>
                <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
                  <CountUp value={withRecipeCount} />/{rows.length}
                </p>
                <p className="text-brand-muted mt-0.5 text-[11px]">
                  {diffCount > 0 ? `${diffCount} difieren del sugerido` : "Alineados con receta"}
                </p>
              </div>
              <div
                className={`rounded-xl border p-4 shadow-sm ${
                  sinCosto > 0
                    ? "border-amber-200/80 bg-amber-50/40"
                    : "border-brand-purple/12 bg-white"
                }`}
              >
                <p
                  className={`text-xs font-medium ${
                    sinCosto > 0 ? "text-amber-800" : "text-brand-muted"
                  }`}
                >
                  Sin costo cargado
                </p>
                <p
                  className={`font-display mt-1 text-2xl font-bold tabular-nums ${
                    sinCosto > 0 ? "text-amber-700" : "text-brand-purple-dark"
                  }`}
                >
                  <CountUp value={sinCosto} />
                </p>
                <p className="text-brand-muted mt-0.5 text-[11px]">
                  {sinCosto === 0 ? "Cobertura 100%" : "Pendientes de costear"}
                </p>
              </div>
            </div>

            <AdminCard className="p-4 lg:col-span-5">
              <p className="text-brand-purple-dark mb-3 text-xs font-semibold tracking-wider uppercase">
                Salud de márgenes del catálogo
              </p>
              <AdminDonutChart
                ariaLabel="Distribución de salud de márgenes del catálogo"
                centerValue={avgMarginPct !== null ? `${avgMarginPct}%` : "—"}
                centerLabel="Margen prom."
                slices={[
                  {
                    key: "healthy",
                    label: "Margen sano (≥ 20%)",
                    count: healthyCount,
                    tone: "emerald",
                    href: buildCostosHref({ q, health: "healthy" }),
                  },
                  {
                    key: "tight",
                    label: "Margen ajustado (0–20%)",
                    count: tightCount,
                    tone: "amber",
                    href: buildCostosHref({ q, health: "tight" }),
                  },
                  {
                    key: "loss",
                    label: "En pérdida (< 0%)",
                    count: lossCount,
                    tone: "rose",
                    href: buildCostosHref({ q, health: "loss" }),
                  },
                  {
                    key: "missing",
                    label: "Sin costo cargado",
                    count: sinCosto,
                    tone: "slate",
                    href: buildCostosHref({ q, health: "missing" }),
                  },
                ]}
              />
            </AdminCard>
          </div>
        )}

        {/* Búsqueda por producto/SKU + filtros de salud */}
        {rows.length > 0 && (
          <div className="border-brand-purple/10 flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <form action="/admin/costos" method="GET" className="flex flex-1 items-center gap-2">
              {health !== "all" && <input type="hidden" name="health" value={health} />}
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  name="q"
                  defaultValue={q}
                  placeholder="Buscar por producto o SKU…"
                  className="pl-9"
                />
              </div>
              <Button type="submit" variant="outline" size="sm">
                Buscar
              </Button>
              {(q || health !== "all") && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/costos">Limpiar</Link>
                </Button>
              )}
            </form>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por margen">
              {(
                [
                  { key: "all", label: "Todos", count: rows.length },
                  { key: "loss", label: "En pérdida", count: lossCount },
                  { key: "tight", label: "Ajustados", count: tightCount },
                  { key: "healthy", label: "Sanos", count: healthyCount },
                  { key: "diff", label: "Difieren de BOM", count: diffCount },
                  { key: "missing", label: "Sin costo", count: sinCosto },
                ] as const
              ).map((pill) => {
                const active = health === pill.key;
                return (
                  <Link
                    key={pill.key}
                    href={buildCostosHref({ q, health: pill.key })}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      active
                        ? "border-brand-purple bg-brand-purple text-white"
                        : "border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 bg-white"
                    }`}
                  >
                    {pill.label}
                    <span
                      className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                        active ? "bg-white/20" : "bg-brand-purple/10"
                      }`}
                    >
                      {pill.count}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <AdminEmpty
            icon={<Calculator className="h-5 w-5" />}
            title="No hay productos activos"
            description="Cuando tengas productos activos en el catálogo, acá verás su costo y margen."
          />
        ) : filteredRows.length === 0 ? (
          <AdminEmpty
            icon={<Calculator className="h-5 w-5" />}
            title="Ningún producto coincide con este filtro"
            description="Prueba otro término de búsqueda o restablece el filtro de margen."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/costos">Ver todos los productos</Link>
              </Button>
            }
          />
        ) : (
          <AdminTable minWidth={1000}>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Producto</th>
                <th className="px-4 py-3 text-left font-semibold">Costo unitario</th>
                <th className="px-4 py-3 text-left font-semibold">Sugerido por materiales</th>
                <th className="px-4 py-3 text-right font-semibold">Precio mín.</th>
                <th className="px-4 py-3 text-right font-semibold">Precio máx.</th>
                <th className="px-4 py-3 text-right font-semibold">Margen $</th>
                <th className="px-4 py-3 text-center font-semibold">Margen %</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {filteredRows.map((r) => (
                <AdminTableRow key={r.id}>
                  <td className="px-4 py-3 align-top">
                    {canAccessCatalog ? (
                      <Link
                        href={`/admin/productos/${r.id}`}
                        className="text-brand-purple-dark hover:text-brand-purple font-semibold hover:underline"
                      >
                        {r.name}
                      </Link>
                    ) : (
                      <p className="text-brand-purple-dark font-semibold">{r.name}</p>
                    )}
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="text-brand-muted font-mono text-[11px]">{r.sku}</span>
                      {canAccessCatalog && (
                        <Link
                          href={`/admin/productos/${r.id}?section=materiales`}
                          className="text-brand-purple hover:text-brand-purple-dark text-[11px] font-medium hover:underline"
                        >
                          {r.hasRecipe ? `Receta BOM (${r.recipeCount})` : "Armar receta BOM"}
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {canEditCost ? (
                      <>
                        {/* Input en PESOS (lo que Lucy conoce); la action convierte a centavos.
                            Vacío = quitar el costo. */}
                        <form action={updateProductCostAction} className="flex items-center gap-2">
                          <input type="hidden" name="productId" value={r.id} />
                          <Input
                            name="costPesos"
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            placeholder="—"
                            defaultValue={r.cost != null ? Math.round(r.cost / 100) : ""}
                            aria-label={`Costo unitario de ${r.name} en pesos`}
                            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-8 w-28"
                          />
                          <AdminButton type="submit" size="sm" variant="secondary" pendingLabel="…">
                            Guardar
                          </AdminButton>
                        </form>
                        {r.cost != null ? (
                          <p className="text-brand-muted mt-1 text-[11px]">{formatCOP(r.cost)}</p>
                        ) : (
                          <p className="mt-1 text-[11px] text-slate-400">sin costo</p>
                        )}
                      </>
                    ) : r.cost != null ? (
                      <span className="text-brand-purple-dark text-sm font-semibold tabular-nums">
                        {formatCOP(r.cost)}
                      </span>
                    ) : (
                      <AdminBadge tone="slate">sin costo</AdminBadge>
                    )}
                  </td>
                  {/* Fase 7b — costo sugerido por receta de materiales. INFORMATIVO:
                      solo se aplica a Product.cost con el botón "Usar sugerido"
                      cuando el rol tiene catalog:write (D1). */}
                  <td className="px-4 py-3 align-top">
                    {r.suggestedCost != null ? (
                      <div className="space-y-1.5">
                        <p className="text-brand-purple-dark/85 text-sm tabular-nums">
                          {formatCOP(r.suggestedCost)}
                        </p>
                        {r.cost != null &&
                          r.cost !== r.suggestedCost &&
                          (() => {
                            const diff = r.cost - r.suggestedCost;
                            return (
                              <AdminBadge tone="amber">
                                {diff > 0
                                  ? `tu costo +${formatCOP(diff)}`
                                  : `tu costo −${formatCOP(-diff)}`}
                              </AdminBadge>
                            );
                          })()}
                        {canEditCost && r.cost !== r.suggestedCost && (
                          <form action={updateProductCostAction}>
                            <input type="hidden" name="productId" value={r.id} />
                            {/* El action recibe PESOS; el sugerido está en centavos. */}
                            <input type="hidden" name="costPesos" value={r.suggestedCost / 100} />
                            <AdminButton
                              type="submit"
                              size="sm"
                              variant="secondary"
                              pendingLabel="…"
                            >
                              Usar sugerido
                            </AdminButton>
                          </form>
                        )}
                      </div>
                    ) : r.hasRecipe ? (
                      <AdminBadge tone="amber">falta costo de insumo</AdminBadge>
                    ) : (
                      <span className="text-[11px] text-slate-400">sin receta</span>
                    )}
                  </td>
                  <td className="text-brand-purple-dark/85 px-4 py-3 text-right align-top tabular-nums">
                    {formatCOP(r.minPrice)}
                  </td>
                  <td className="text-brand-purple-dark/85 px-4 py-3 text-right align-top tabular-nums">
                    {formatCOP(r.maxPrice)}
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    {r.margin != null ? (
                      <span
                        className={
                          r.margin < 0 ? "font-semibold text-rose-600" : "text-brand-purple-dark/85"
                        }
                      >
                        {formatCOP(r.margin)}
                      </span>
                    ) : (
                      <AdminBadge tone="slate">sin costo</AdminBadge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center align-top">
                    {r.marginPct != null ? (
                      <div className="inline-flex min-w-20 flex-col items-center gap-1">
                        <AdminBadge tone={marginTone(r.marginPct)}>
                          {r.marginPct.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%
                        </AdminBadge>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200/80">
                          <div
                            className={`admin-bar-grow-x h-full rounded-full ${
                              r.marginPct < 0
                                ? "bg-rose-500"
                                : r.marginPct < 20
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                            }`}
                            style={{
                              width: `${Math.max(8, Math.min(100, Math.round(Math.max(0, r.marginPct))))}%`,
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
