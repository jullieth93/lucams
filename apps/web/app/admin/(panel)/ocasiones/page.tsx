/*
 * Admin > Ocasiones — Listado + analítica estacional + filtros + orden.
 *
 * Toggle Estado clickeable directamente (badge = toggle, mismo patrón que
 * /admin/categorias). Incluye calendario estacional de 12 meses, conteo de
 * productos vivos y acceso directo a las vitrinas /ocasion/[slug].
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightLeft,
  Calendar,
  ChevronRight,
  ExternalLink,
  Layers,
  Package,
  RotateCcw,
  Tag,
} from "lucide-react";
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
  SortableHeader,
} from "@/components/admin-page";
import { CountUp } from "@/components/admin/count-up";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hint } from "@/components/ui/tooltip";
import { listOcasionTags } from "@/features/ocasiones/service";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import { requireCapability } from "@/lib/admin-rbac-guard";
import { prisma } from "@/lib/db";
import { formatIsoDateCO } from "@/lib/datetime";
import { CreateOcasionForm } from "./create-ocasion-form";
import { restoreOcasionAction, toggleOcasionActiveAction } from "./actions";

export const metadata: Metadata = {
  title: "Ocasiones",
};

const MONTH_NAMES: Record<number, string> = {
  1: "Enero",
  2: "Febrero",
  3: "Marzo",
  4: "Abril",
  5: "Mayo",
  6: "Junio",
  7: "Julio",
  8: "Agosto",
  9: "Septiembre",
  10: "Octubre",
  11: "Noviembre",
  12: "Diciembre",
};

const MONTH_SHORT: Record<number, string> = {
  1: "Ene",
  2: "Feb",
  3: "Mar",
  4: "Abr",
  5: "May",
  6: "Jun",
  7: "Jul",
  8: "Ago",
  9: "Sep",
  10: "Oct",
  11: "Nov",
  12: "Dic",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

export default async function AdminOcasionesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireCapability("catalog:write");
  const canViewRedirects = canAccessAdminPath(session.admin.role, "/admin/redirects");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const status = (
    ["all", "active", "inactive", "archived"].includes(statusRaw ?? "") ? statusRaw : "all"
  ) as "all" | "active" | "inactive" | "archived";
  const sortRaw = pickString(sp, "sort");
  const sort = (["name", "recent"].includes(sortRaw ?? "") ? sortRaw : "order") as
    "order" | "name" | "recent";

  const [ocasiones, allOcasiones, liveProductLinks] = await Promise.all([
    listOcasionTags({ q, status, sort }),
    prisma.ocasionTag.findMany({
      select: {
        id: true,
        name: true,
        isActive: true,
        deletedAt: true,
        monthHint: true,
      },
    }),
    prisma.productOcasionTag.groupBy({
      by: ["ocasionTagId"],
      where: { product: { deletedAt: null } },
      _count: { _all: true },
    }),
  ]);

  const liveCountByOcasion = new Map<string, number>(
    liveProductLinks.map((row) => [row.ocasionTagId, row._count._all]),
  );

  let activeCount = 0;
  let inactiveCount = 0;
  let archivedCount = 0;
  const activeByMonth = new Map<number, string[]>();

  for (const item of allOcasiones) {
    if (item.deletedAt) {
      archivedCount += 1;
    } else if (item.isActive) {
      activeCount += 1;
      if (item.monthHint) {
        const list = activeByMonth.get(item.monthHint) ?? [];
        list.push(item.name);
        activeByMonth.set(item.monthHint, list);
      }
    } else {
      inactiveCount += 1;
    }
  }

  const totalLiveLinks = liveProductLinks.reduce((acc, r) => acc + r._count._all, 0);
  const coveredMonths = activeByMonth.size;

  const created = sp.created === "1";
  const updated = sp.updated === "1";
  const deleted = sp.deleted === "1";
  const restored = sp.restored === "1";
  const errorMsg = typeof sp.error === "string" ? sp.error : null;
  const hasActiveFilters = !!q || status !== "all" || sort !== "order";
  const currentMonth = Number(formatIsoDateCO(new Date()).slice(5, 7));

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Tag className="h-5 w-5" />}
        title="Ocasiones"
        subtitle={
          <>
            {ocasiones.length} {ocasiones.length === 1 ? "ocasión" : "ocasiones"} en vista
            {hasActiveFilters && " · con filtros aplicados"} · Colecciones transversales por fecha o
            celebración.
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Catálogo", href: "/admin/productos" },
          { label: "Ocasiones" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/productos">
                <Package className="mr-1.5 h-4 w-4" />
                Productos
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/categorias">
                <Layers className="mr-1.5 h-4 w-4" />
                Categorías
              </Link>
            </Button>
            {canViewRedirects && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/redirects">
                  <ArrowRightLeft className="mr-1.5 h-4 w-4" />
                  Redirects 301
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <AdminPageBody>
        {/* Resumen ejecutivo + calendario estacional */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <AdminCard className="p-5 lg:col-span-7">
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-emerald-50/70 p-3 ring-1 ring-emerald-200/60">
                <p className="text-[11px] font-semibold tracking-wide text-emerald-800 uppercase">
                  Activas
                </p>
                <p className="font-display mt-0.5 text-2xl font-bold text-emerald-900 tabular-nums">
                  <CountUp value={activeCount} />
                </p>
              </div>
              <div className="bg-brand-purple/5 ring-brand-purple/15 rounded-xl p-3 ring-1">
                <p className="text-brand-purple-dark/80 text-[11px] font-semibold tracking-wide uppercase">
                  Vínculos vivos
                </p>
                <p className="text-brand-purple-dark font-display mt-0.5 text-2xl font-bold tabular-nums">
                  <CountUp value={totalLiveLinks} />
                </p>
              </div>
              <div className="rounded-xl bg-amber-50/70 p-3 ring-1 ring-amber-200/60">
                <p className="text-[11px] font-semibold tracking-wide text-amber-800 uppercase">
                  Meses cubiertos
                </p>
                <p className="font-display mt-0.5 text-2xl font-bold text-amber-900 tabular-nums">
                  <CountUp value={coveredMonths} />
                  <span className="text-sm font-medium text-amber-700/80">/12</span>
                </p>
              </div>
              <div className="rounded-xl bg-slate-100/80 p-3 ring-1 ring-slate-200/80">
                <p className="text-[11px] font-semibold tracking-wide text-slate-600 uppercase">
                  Pausadas / Arch.
                </p>
                <p className="font-display mt-0.5 text-2xl font-bold text-slate-800 tabular-nums">
                  <CountUp value={inactiveCount + archivedCount} />
                </p>
              </div>
            </div>

            <AdminSegmentedBar
              ariaLabel="Distribución de ocasiones por estado"
              items={[
                {
                  key: "active",
                  label: "Activas",
                  count: activeCount,
                  tone: "emerald",
                  href: "/admin/ocasiones?status=active",
                },
                {
                  key: "inactive",
                  label: "Inactivas",
                  count: inactiveCount,
                  tone: "amber",
                  href: "/admin/ocasiones?status=inactive",
                },
                {
                  key: "archived",
                  label: "Archivadas",
                  count: archivedCount,
                  tone: "slate",
                  href: "/admin/ocasiones?status=archived",
                },
              ]}
            />
          </AdminCard>

          <AdminCard className="p-5 lg:col-span-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-brand-purple-dark flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
                <Calendar className="text-brand-purple h-4 w-4" />
                Cobertura estacional (12 meses)
              </h2>
              <span className="text-brand-muted text-[11px]">
                Mes actual: <strong>{MONTH_NAMES[currentMonth]}</strong>
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => {
                const names = activeByMonth.get(m) ?? [];
                const isCurrent = m === currentMonth;
                const hasCoverage = names.length > 0;
                const tooltipText = hasCoverage
                  ? `${MONTH_NAMES[m]}: ${names.join(", ")}`
                  : `${MONTH_NAMES[m]}: sin ocasión destacada activa`;
                return (
                  <Hint key={m} content={tooltipText}>
                    <div
                      className={`flex flex-col items-center justify-center rounded-lg border px-2 py-2 text-center transition-all ${
                        hasCoverage
                          ? "border-brand-purple/25 bg-brand-purple/8 text-brand-purple-dark shadow-2xs"
                          : "border-slate-200/80 bg-slate-50/70 text-slate-400"
                      } ${isCurrent ? "ring-brand-pink ring-2 ring-offset-1" : ""}`}
                    >
                      <span className="text-[11px] font-bold">{MONTH_SHORT[m]}</span>
                      <span className="mt-0.5 text-[10px] font-semibold tabular-nums">
                        {hasCoverage ? `${names.length} act.` : "—"}
                      </span>
                    </div>
                  </Hint>
                );
              })}
            </div>
          </AdminCard>
        </div>

        <AdminNotice tone="info">
          <strong>¿Cómo se conectan con la tienda?</strong> Cada ocasión activa publica su vitrina
          en <code>/ocasion/[slug]</code>, habilita filtros transversales en <code>/productos</code>{" "}
          y nutre al recomendador del catálogo (<code>/api/catalog/recommend</code>).
        </AdminNotice>

        {created && <AdminNotice tone="success">Ocasión creada correctamente.</AdminNotice>}
        {updated && <AdminNotice tone="success">Ocasión actualizada.</AdminNotice>}
        {restored && (
          <AdminNotice tone="success">
            Ocasión restaurada como <strong>inactiva</strong>. Revisa sus productos y actívala
            cuando quieras publicarla.
          </AdminNotice>
        )}
        {deleted && <AdminNotice tone="warning">Ocasión archivada.</AdminNotice>}
        {errorMsg && <AdminNotice tone="error">{errorMsg}</AdminNotice>}

        {/* Toolbar: búsqueda + filtros + ordenamiento (form GET) */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          <div className="sm:col-span-5">
            <label
              htmlFor="f-q"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Buscar
            </label>
            <Input
              id="f-q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="Por nombre o slug…"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
          </div>
          <div className="sm:col-span-3">
            <label
              htmlFor="f-status"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Estado
            </label>
            <select
              id="f-status"
              name="status"
              defaultValue={status}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="all">Todas (no archivadas)</option>
              <option value="active">Solo activas</option>
              <option value="inactive">Solo inactivas</option>
              <option value="archived">Archivadas ({archivedCount})</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <label
              htmlFor="f-sort"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Ordenar por
            </label>
            <select
              id="f-sort"
              name="sort"
              defaultValue={sort}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="order">Orden manual</option>
              <option value="name">Nombre A-Z</option>
              <option value="recent">Más recientes</option>
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-1">
            <Button
              type="submit"
              size="sm"
              className="bg-gradient-brand h-9 w-full text-white hover:brightness-110"
            >
              Filtrar
            </Button>
          </div>
          {hasActiveFilters && (
            <div className="sm:col-span-12">
              <Link
                href="/admin/ocasiones"
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {ocasiones.length === 0 ? (
          <AdminEmpty
            icon={<Tag className="h-5 w-5" />}
            title={hasActiveFilters ? "Sin resultados" : "Todavía no hay ocasiones"}
            description={
              hasActiveFilters
                ? "Prueba quitar algún filtro o cambiar el texto de búsqueda."
                : "Crea tu primera ocasión con el formulario de abajo."
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <SortableHeader
                  label="Nombre"
                  ascValue="name"
                  currentSort={sort}
                  basePath="/admin/ocasiones"
                  preserve={{ q, status: status !== "all" ? status : undefined }}
                />
                <th className="px-4 py-3 text-left font-semibold">Slug / Vitrina</th>
                <th className="px-4 py-3 text-left font-semibold">Mes destacado</th>
                <th className="px-4 py-3 text-left font-semibold">Cantidad sugerida</th>
                <th className="px-4 py-3 text-center font-semibold">Productos</th>
                <SortableHeader
                  label="Orden"
                  ascValue="order"
                  currentSort={sort}
                  basePath="/admin/ocasiones"
                  preserve={{ q, status: status !== "all" ? status : undefined }}
                  align="center"
                />
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acción</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {ocasiones.map((o) => {
                const range = o.suggestedQuantityRange as {
                  min: number;
                  ideal: number;
                  max: number;
                } | null;
                const liveCount = liveCountByOcasion.get(o.id) ?? 0;
                const isArchived = Boolean(o.deletedAt);
                return (
                  <AdminTableRow key={o.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/ocasiones/${o.id}`}
                        className="text-brand-purple-dark hover:text-brand-purple font-semibold hover:underline"
                      >
                        {o.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <code className="text-brand-purple-dark/80 font-mono text-xs">
                          {o.slug}
                        </code>
                        {o.isActive && !isArchived && (
                          <Hint content={`Abrir /ocasion/${o.slug} en tienda`}>
                            <Link
                              href={`/ocasion/${o.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-muted hover:text-brand-purple inline-flex items-center"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Hint>
                        )}
                      </div>
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-sm">
                      {o.monthHint ? (
                        <AdminBadge tone={o.monthHint === currentMonth ? "pink" : "purple"}>
                          {MONTH_NAMES[o.monthHint]}
                        </AdminBadge>
                      ) : (
                        <span className="text-brand-muted text-xs">Todo el año</span>
                      )}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-sm tabular-nums">
                      {range ? `${range.min} · ${range.ideal} · ${range.max} uds.` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-sm tabular-nums">
                      <Link
                        href={`/admin/ocasiones/${o.id}#productos`}
                        className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 font-semibold hover:underline"
                      >
                        {liveCount}
                      </Link>
                    </td>
                    <td className="text-brand-muted px-4 py-3 text-center font-mono text-xs tabular-nums">
                      {o.order}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isArchived ? (
                        <AdminBadge tone="slate">Archivada</AdminBadge>
                      ) : (
                        <form action={toggleOcasionActiveAction} className="inline">
                          <input type="hidden" name="id" value={o.id} />
                          <input type="hidden" name="next" value={o.isActive ? "false" : "true"} />
                          <Hint
                            content={o.isActive ? "Haz clic para pausar" : "Haz clic para activar"}
                          >
                            <button
                              type="submit"
                              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all hover:shadow-sm ${
                                o.isActive
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                                  : "bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${o.isActive ? "bg-emerald-500" : "bg-slate-400"}`}
                                aria-hidden
                              />
                              {o.isActive ? "Activa" : "Inactiva"}
                            </button>
                          </Hint>
                        </form>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {isArchived && (
                          <form action={restoreOcasionAction} className="inline">
                            <input type="hidden" name="id" value={o.id} />
                            <button
                              type="submit"
                              className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 text-xs font-semibold"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Restaurar
                            </button>
                          </form>
                        )}
                        <Link
                          href={`/admin/ocasiones/${o.id}`}
                          className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-xs font-medium"
                        >
                          Editar
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        )}

        <AdminCard className="p-5">
          <h3 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
            Crear ocasión nueva
          </h3>
          <CreateOcasionForm />
        </AdminCard>
      </AdminPageBody>
    </AdminPage>
  );
}
