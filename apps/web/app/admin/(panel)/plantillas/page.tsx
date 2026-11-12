/*
 * Admin — Plantillas del Estudio (Fase 3). Lucy revisa el preview REAL de cada
 * plantilla y la aprueba (se muestra en el Estudio) u oculta. Incluye descartadas
 * (soft-deleted) para poder restaurar las buenas con un clic.
 *
 * 2026-09-15 — el listado se reagrupó por CATEGORÍA DE CATÁLOGO → producto (antes
 * por kind), y cada tarjeta muestra si la plantilla es visible REALMENTE en el
 * Estudio (studioVisible, misma regla que service.listTemplatesForKind) y a qué
 * producto(s) alimenta. Las globales van en el grupo "Globales (todos los
 * productos)".
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  ExternalLink,
  Image as ImageIcon,
  Package,
  Search,
  Shapes,
  ShieldAlert,
} from "lucide-react";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import { requireCapability } from "@/lib/admin-rbac-guard";
import {
  listTemplatesForAdmin,
  templateStatus,
  KIND_LABEL,
  type AdminTemplate,
} from "@/features/personalization/admin-templates";
import {
  AdminCard,
  AdminEmpty,
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminSegmentedBar,
} from "@/components/admin-page";
import { CountUp } from "@/components/admin/count-up";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hint } from "@/components/ui/tooltip";
import { TemplateCardActions } from "./template-card-actions";
import { TemplatePreviewButton } from "./template-preview-button";

export const metadata: Metadata = { title: "Plantillas del Estudio" };

const STATUS_UI: Record<string, { dot: string; label: string }> = {
  // "aprobada" ya no se anuncia como "visible": la visibilidad REAL en el
  // Estudio es la marca ✅/🚫 de la tarjeta (studioVisible).
  aprobada: { dot: "🟢", label: "Aprobada" },
  oculta: { dot: "🟡", label: "Oculta" },
  descartada: { dot: "⚫", label: "Descartada" },
};

const GLOBAL_GROUP = "Globales (todos los productos)";

type StatusFilter = "all" | "visible" | "approved" | "hidden" | "discarded";

function parseStatusFilter(raw?: string): StatusFilter {
  if (raw === "visible" || raw === "approved" || raw === "hidden" || raw === "discarded") {
    return raw;
  }
  return "all";
}

type ProductGroup = {
  title: string;
  productId: string | null;
  productSlug: string | null;
  list: AdminTemplate[];
};
type CategoryGroup = { category: string; products: ProductGroup[] };

/** Agrupa categoría → producto conservando el orden relativo del query. */
function groupByCategory(templates: AdminTemplate[]): CategoryGroup[] {
  const byCategory = new Map<string, Map<string, AdminTemplate[]>>();
  for (const t of templates) {
    const category = t.categoryName ?? GLOBAL_GROUP;
    // Las globales no se subdividen por producto: un solo bloque plano.
    const product = t.categoryName ? (t.productName ?? "Sin producto") : "";
    const products = byCategory.get(category) ?? new Map<string, AdminTemplate[]>();
    const arr = products.get(product) ?? [];
    arr.push(t);
    products.set(product, arr);
    byCategory.set(category, products);
  }
  return [...byCategory.entries()]
    .map(([category, products]): CategoryGroup => {
      const subs = [...products.entries()]
        .map(([title, list]) => ({
          title,
          productId: list[0]?.productId ?? null,
          productSlug: list[0]?.productSlug ?? null,
          list,
        }))
        .sort((a, b) => a.title.localeCompare(b.title, "es"));
      return { category, products: subs };
    })
    .sort((a, b) => {
      // "Globales" primero (alimentan a todo producto sin específicas), el resto alfabético.
      if (a.category === GLOBAL_GROUP) return -1;
      if (b.category === GLOBAL_GROUP) return 1;
      return a.category.localeCompare(b.category, "es");
    });
}

function buildPlantillasHref(opts: { q?: string; status?: StatusFilter }): string {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  if (opts.status && opts.status !== "all") params.set("status", opts.status);
  const qs = params.toString();
  return qs ? `/admin/plantillas?${qs}` : "/admin/plantillas";
}

function TemplateCard({ t }: { t: AdminTemplate }) {
  const st = templateStatus(t);
  return (
    <div className="border-brand-purple/10 group hover:shadow-brand-purple/10 flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="bg-brand-cream/50 relative aspect-square overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={t.previewUrl}
          alt={`Preview de ${t.name}`}
          className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-[1.06]"
          loading="lazy"
        />
        {t.isFallback && (
          <span className="bg-brand-purple-dark/70 absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white">
            respaldo
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <Hint content={t.name}>
          <p className="text-brand-purple-dark truncate text-xs font-semibold">{t.name}</p>
        </Hint>
        <p className="text-brand-muted text-[11px]">{KIND_LABEL[t.kind] ?? t.kind}</p>
        <Hint content={STATUS_UI[st].label}>
          <p className="text-brand-muted text-[11px]">
            {STATUS_UI[st].dot} {st}
          </p>
        </Hint>
        <Hint
          content={
            t.studioVisible
              ? "Cumple la regla de visibilidad del Estudio (editable, activa, aspect y curaduría del producto)"
              : "El Estudio no la lista hoy (oculta, descartada, aspect distinto o tapada por específicas del producto)"
          }
        >
          <p
            className={`text-[11px] font-semibold ${t.studioVisible ? "text-emerald-700" : "text-brand-muted"}`}
          >
            {t.studioVisible ? "✅ Visible en el Estudio" : "🚫 No visible en el Estudio"}
          </p>
        </Hint>
        <p className="text-brand-muted text-[11px] leading-snug">
          {t.studioProductNames.length > 0
            ? `Alimenta: ${t.studioProductNames.join(", ")}`
            : t.productName
              ? `Específica de ${t.productName} — hoy no alimenta su lienzo`
              : "No alimenta ningún producto del Estudio"}
        </p>
        <div className="mt-auto flex flex-col gap-1.5">
          <TemplatePreviewButton template={t} />
          <TemplateCardActions id={t.id} status={st} />
        </div>
      </div>
    </div>
  );
}

export default async function AdminPlantillasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = await requireCapability("production:manage_AssetsCatalog");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const qLower = q.toLocaleLowerCase("es");
  const statusFilter = parseStatusFilter(sp.status);

  const templates = await listTemplatesForAdmin();

  const total = templates.length;
  const visible = templates.filter((t) => t.studioVisible).length;
  const approved = templates.filter((t) => templateStatus(t) === "aprobada").length;
  const approvedNotVisible = templates.filter(
    (t) => templateStatus(t) === "aprobada" && !t.studioVisible,
  ).length;
  const hidden = templates.filter((t) => templateStatus(t) === "oculta").length;
  const discarded = templates.filter((t) => templateStatus(t) === "descartada").length;

  const filtered = templates.filter((t) => {
    const st = templateStatus(t);
    if (statusFilter === "visible" && !t.studioVisible) return false;
    if (statusFilter === "approved" && st !== "aprobada") return false;
    if (statusFilter === "hidden" && st !== "oculta") return false;
    if (statusFilter === "discarded" && st !== "descartada") return false;
    if (!qLower) return true;
    const kindText = KIND_LABEL[t.kind] ?? t.kind;
    return (
      t.name.toLocaleLowerCase("es").includes(qLower) ||
      t.slug.toLocaleLowerCase("es").includes(qLower) ||
      (t.productName ?? "").toLocaleLowerCase("es").includes(qLower) ||
      (t.categoryName ?? "").toLocaleLowerCase("es").includes(qLower) ||
      kindText.toLocaleLowerCase("es").includes(qLower)
    );
  });

  const groups = groupByCategory(filtered);

  const canAccessDisenos = canAccessAdminPath(session.admin.role, "/admin/disenos");
  const canAccessModeracion = canAccessAdminPath(session.admin.role, "/admin/moderacion");
  const canAccessProductos = canAccessAdminPath(session.admin.role, "/admin/productos");

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Shapes className="h-5 w-5" />}
        title="Plantillas del Estudio"
        subtitle={`${visible} visibles en el Estudio · ${approved} aprobadas de ${total}. Aprueba las que te gusten para habilitarlas en el lienzo; oculta las demás.`}
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Producción" },
          { label: "Plantillas del Estudio" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canAccessDisenos && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/disenos">
                  <ImageIcon className="h-4 w-4" />
                  Diseños y fichas
                </Link>
              </Button>
            )}
            {canAccessModeracion && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/moderacion">
                  <ShieldAlert className="h-4 w-4" />
                  Moderación UGC
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
        {/* Pulso ejecutivo de curaduría del Estudio */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="border-brand-purple/12 rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-brand-muted text-xs font-medium">Total plantillas</p>
            <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
              <CountUp value={total} />
            </p>
            <p className="text-brand-muted mt-0.5 text-[11px]">{approved} marcadas aprobadas</p>
          </div>
          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 shadow-sm">
            <p className="text-xs font-medium text-emerald-800">Visibles en el Estudio</p>
            <p className="font-display mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
              <CountUp value={visible} />
            </p>
            <p className="mt-0.5 text-[11px] text-emerald-800/80">Pasan curaduría + proporción</p>
          </div>
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 shadow-sm">
            <p className="text-xs font-medium text-amber-800">Ocultas</p>
            <p className="font-display mt-1 text-2xl font-bold text-amber-700 tabular-nums">
              <CountUp value={hidden} />
            </p>
            <p className="mt-0.5 text-[11px] text-amber-800/80">Conservadas fuera del lienzo</p>
          </div>
          <div className="border-brand-purple/10 rounded-xl border bg-slate-50/70 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-700">Descartadas</p>
            <p className="font-display mt-1 text-2xl font-bold text-slate-700 tabular-nums">
              <CountUp value={discarded} />
            </p>
            <p className="text-brand-muted mt-0.5 text-[11px]">Aprobar las restaura al instante</p>
          </div>
        </div>

        <AdminCard className="p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-brand-purple-dark text-xs font-semibold tracking-wider uppercase">
              Distribución de disponibilidad en el Estudio
            </p>
            <span className="text-brand-muted text-[11px]">Clic en un segmento para filtrar</span>
          </div>
          <AdminSegmentedBar
            ariaLabel="Distribución de plantillas por estado en el Estudio"
            items={[
              {
                key: "visible",
                label: "Visibles en Estudio",
                count: visible,
                tone: "emerald",
                href: buildPlantillasHref({ q, status: "visible" }),
              },
              {
                key: "approved-shadow",
                label: "Aprobadas sin lienzo",
                count: approvedNotVisible,
                tone: "amber",
                href: buildPlantillasHref({ q, status: "approved" }),
                sublabel: "tapadas o proporción distinta",
              },
              {
                key: "hidden",
                label: "Ocultas",
                count: hidden,
                tone: "slate",
                href: buildPlantillasHref({ q, status: "hidden" }),
              },
              {
                key: "discarded",
                label: "Descartadas",
                count: discarded,
                tone: "rose",
                href: buildPlantillasHref({ q, status: "discarded" }),
              },
            ]}
          />
        </AdminCard>

        {/* Búsqueda + filtros de estado */}
        <div className="border-brand-purple/10 flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <form action="/admin/plantillas" method="GET" className="flex flex-1 items-center gap-2">
            {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Buscar plantilla, producto o tipo…"
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Filtrar
            </Button>
            {(q || statusFilter !== "all") && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/plantillas">Limpiar</Link>
              </Button>
            )}
          </form>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Estado">
            {(
              [
                { key: "all", label: "Todas", count: total },
                { key: "visible", label: "Visibles", count: visible },
                { key: "approved", label: "Aprobadas", count: approved },
                { key: "hidden", label: "Ocultas", count: hidden },
                { key: "discarded", label: "Descartadas", count: discarded },
              ] as const
            ).map((pill) => {
              const active = statusFilter === pill.key;
              return (
                <Link
                  key={pill.key}
                  href={buildPlantillasHref({ q, status: pill.key })}
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

        <p className="text-brand-muted text-xs">
          Cada imagen es el preview REAL de la plantilla (cómo se ve el imán), agrupada por la
          categoría y el producto del catálogo al que pertenece. 🟢 aprobada · 🟡 oculta · ⚫
          descartada. ✅/🚫 indica si el Estudio la lista HOY en el lienzo (misma regla que usa el
          editor: editable, activa, proporción del producto y específicas del producto por encima de
          las globales). Aprobar una descartada la restaura; eliminar una oculta/descartada sin
          diseños exige confirmación y código MFA reciente.
        </p>

        {groups.length === 0 ? (
          <AdminEmpty
            icon={<Shapes className="h-5 w-5" />}
            title="Ninguna plantilla coincide con este filtro"
            description="Prueba buscando otro nombre de producto o restableciendo los filtros."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/plantillas">Ver todas las plantillas</Link>
              </Button>
            }
          />
        ) : (
          groups.map((g) => {
            const all = g.products.flatMap((p) => p.list);
            const visibleCount = all.filter((t) => t.studioVisible).length;
            return (
              <section key={g.category} className="mb-8">
                <h2 className="text-brand-purple-dark border-brand-purple/10 mb-3 border-b pb-1.5 text-sm font-bold">
                  {g.category}{" "}
                  <span className="text-brand-muted font-normal">
                    ({visibleCount}/{all.length} visibles en el Estudio)
                  </span>
                </h2>
                {g.products.map((p) => (
                  <div key={p.title || "_globals"} className="mb-5 last:mb-0">
                    {p.title && (
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-brand-purple-dark/80 text-xs font-bold">
                          {p.title}{" "}
                          <span className="text-brand-muted font-normal">
                            ({p.list.filter((t) => t.studioVisible).length}/{p.list.length})
                          </span>
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 text-[11px]">
                          {canAccessProductos && p.productId && (
                            <Link
                              href={`/admin/productos/${p.productId}`}
                              className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 font-semibold hover:underline"
                            >
                              <Package className="h-3 w-3" />
                              Ficha del producto
                            </Link>
                          )}
                          {p.productSlug && (
                            <Link
                              href={`/estudio/${p.productSlug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-muted hover:text-brand-purple-dark inline-flex items-center gap-1 font-medium hover:underline"
                            >
                              Abrir Estudio
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {p.list.map((t) => (
                        <TemplateCard key={t.id} t={t} />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            );
          })
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
