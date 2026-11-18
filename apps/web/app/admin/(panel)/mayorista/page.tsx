/*
 * Admin > Precios al por mayor — gobierno ejecutivo de escalas por volumen (WholesaleTier).
 *
 * Cada nivel define: a partir de `minQty` unidades, el precio unitario pasa a
 * `unitPrice` (centavos COP). Un nivel con `productId` NULL es global ("Todo el
 * catálogo"); uno con producto específico tiene prioridad sobre los globales.
 *
 * Seguridad y RBAC (Bloque 3 — N-21 estricto):
 *   - Lectura: `ADMIN_ROLE_SETS.MAYORISTA_READ` (`SUPERADMIN`, `OPERATIONS_MANAGER`,
 *     `MANAGER`, `FINANCE_ANALYST`).
 *   - Escritura: `catalog:write` (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`).
 *     `FINANCE_ANALYST` audita escalas y márgenes en modo solo lectura.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  Calculator,
  Eye,
  Layers,
  Package,
  Plus,
  Search,
  Ticket,
  TrendingDown,
} from "lucide-react";
import {
  AdminBadge,
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
} from "@/components/admin-page";
import { CountUp } from "@/components/admin/count-up";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MAX_SELF_SERVICE_PHYSICAL_UNITS,
  maxSelectorUnitsForProduct,
} from "@/features/personalization/design-units";
import { ADMIN_ROLE_SETS, canAccessAdminPath, hasCapability } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { prisma } from "@/lib/db";
import { formatDateCO } from "@/lib/datetime";
import { formatCOP } from "@/lib/format";
import { CreateTierForm } from "./create-tier-form";
import { TierRow } from "./tier-row";

export const metadata: Metadata = {
  title: "Precios al por mayor",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
type TierFilter = "all" | "active" | "inactive" | "margin-alert" | "global";

function pickStr(v: string | string[] | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

export default async function AdminMayoristaPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireRole(ADMIN_ROLE_SETS.MAYORISTA_READ);
  const role = session.admin.role;
  const canEdit = hasCapability(role, "catalog:write");
  const canViewProducts = canAccessAdminPath(role, "/admin/productos");
  const canViewCosts = canAccessAdminPath(role, "/admin/costos");
  const canViewCoupons = canAccessAdminPath(role, "/admin/cupones");
  const canViewB2B = canAccessAdminPath(role, "/admin/oportunidades");

  const sp = await searchParams;
  const q = pickStr(sp.q);
  const qLower = q.toLowerCase();
  const filterRaw = pickStr(sp.filter);
  const filter: TierFilter =
    filterRaw === "active" ||
    filterRaw === "inactive" ||
    filterRaw === "margin-alert" ||
    filterRaw === "global"
      ? filterRaw
      : "all";

  const [tiers, products] = await Promise.all([
    prisma.wholesaleTier.findMany({
      where: { deletedAt: null },
      include: {
        variant: {
          select: { id: true, name: true, sku: true, price: true, attributes: true },
        },
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            slug: true,
            basePrice: true,
            cost: true,
            isActive: true,
            personalizationKind: true,
            personalizationSchema: true,
            variants: {
              where: { deletedAt: null, isActive: true },
              select: { id: true, name: true, sku: true, price: true, attributes: true },
            },
          },
        },
      },
      orderBy: { minQty: "asc" },
    }),
    prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        sku: true,
        slug: true,
        basePrice: true,
        cost: true,
        personalizationKind: true,
        personalizationSchema: true,
        variants: {
          where: { deletedAt: null, isActive: true },
          select: { id: true, name: true, sku: true, price: true, attributes: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const refPriceByProductId = new Map<string, number>();
  for (const p of products) {
    const ref =
      p.variants.length > 0
        ? Math.min(...p.variants.map((v) => v.price ?? p.basePrice))
        : p.basePrice;
    refPriceByProductId.set(p.id, ref);
  }
  for (const t of tiers) {
    if (t.product && !refPriceByProductId.has(t.product.id)) {
      const ref =
        t.product.variants.length > 0
          ? Math.min(...t.product.variants.map((v) => v.price ?? t.product!.basePrice))
          : t.product.basePrice;
      refPriceByProductId.set(t.product.id, ref);
    }
  }

  // Métricas ejecutivas sobre el universo completo de niveles no eliminados
  const activeTiers = tiers.filter((t) => t.isActive);
  const distinctProductIds = new Set(
    activeTiers.filter((t) => t.productId !== null).map((t) => t.productId as string),
  );
  const globalActiveTiers = activeTiers
    .filter((t) => t.productId === null)
    .map((t) => ({ minQty: t.minQty, unitPrice: t.unitPrice }));

  let savingsSum = 0;
  let savingsCount = 0;
  let healthyCount = 0;
  let tightMarginCount = 0;
  let belowCostCount = 0;
  let uncostedOrGlobalCount = 0;
  const inactiveCount = tiers.length - activeTiers.length;

  function tierReferencePrice(t: (typeof tiers)[number]): number | null {
    if (t.variant) {
      return t.variant.price ?? t.product?.basePrice ?? null;
    }
    return t.productId ? (refPriceByProductId.get(t.productId) ?? null) : null;
  }

  for (const t of activeTiers) {
    const ref = tierReferencePrice(t);
    if (ref !== null && ref > 0 && t.unitPrice < ref) {
      savingsSum += Math.round(((ref - t.unitPrice) / ref) * 100);
      savingsCount += 1;
    }
    const cost = t.product?.cost ?? null;
    if (cost !== null && cost > 0 && t.unitPrice > 0) {
      const mPct = Math.round(((t.unitPrice - cost) / t.unitPrice) * 100);
      if (t.unitPrice < cost) belowCostCount += 1;
      else if (mPct < 20) tightMarginCount += 1;
      else healthyCount += 1;
    } else {
      uncostedOrGlobalCount += 1;
    }
  }
  const avgSavingsPct = savingsCount > 0 ? Math.round(savingsSum / savingsCount) : 0;
  const totalMarginAlerts = belowCostCount + tightMarginCount;

  // Producto preseleccionado cuando llegamos desde /admin/productos/[id] con ?q=SKU
  const matchedProductForForm = qLower
    ? products.find((p) => p.sku.toLowerCase() === qLower || p.name.toLowerCase() === qLower)
    : undefined;

  const productOptions = products.map((p) => {
    const allAttrs = p.variants.map((v) => v.attributes);
    const prodCap = maxSelectorUnitsForProduct({
      slug: p.slug,
      personalizationKind: p.personalizationKind,
      personalizationSchema: p.personalizationSchema,
      variantAttrs: p.variants[0]?.attributes,
      allVariantsAttrs: allAttrs,
    });
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      basePrice: p.basePrice,
      referencePrice: refPriceByProductId.get(p.id) ?? p.basePrice,
      cost: p.cost,
      maxMinQty: prodCap.maxUnits,
      unitPlural: prodCap.unitPlural,
      variants: p.variants.map((v) => {
        const varCap = maxSelectorUnitsForProduct({
          slug: p.slug,
          personalizationKind: p.personalizationKind,
          personalizationSchema: p.personalizationSchema,
          variantAttrs: v.attributes,
          allVariantsAttrs: allAttrs,
        });
        return {
          id: v.id,
          name: v.name,
          sku: v.sku,
          price: v.price ?? p.basePrice,
          maxMinQty: varCap.maxUnits,
          unitPlural: varCap.unitPlural,
        };
      }),
      activeTiers: activeTiers
        .filter((t) => t.productId === p.id)
        .map((t) => ({ variantId: t.variantId, minQty: t.minQty, unitPrice: t.unitPrice })),
    };
  });

  // Filtrado por búsqueda y estado/salud
  const filteredTiers = tiers.filter((t) => {
    if (filter === "active" && !t.isActive) return false;
    if (filter === "inactive" && t.isActive) return false;
    if (filter === "global" && t.productId !== null) return false;
    if (filter === "margin-alert") {
      const cost = t.product?.cost ?? null;
      if (cost === null || cost <= 0 || t.unitPrice <= 0) return false;
      const mPct = Math.round(((t.unitPrice - cost) / t.unitPrice) * 100);
      if (t.unitPrice >= cost && mPct >= 20) return false;
    }

    if (!qLower) return true;
    const label = t.product?.name.toLowerCase() ?? "todo el catálogo global";
    const sku = t.product?.sku.toLowerCase() ?? "";
    const note = t.note?.toLowerCase() ?? "";
    return label.includes(qLower) || sku.includes(qLower) || note.includes(qLower);
  });

  // Agrupación por alcance (Global primero, luego alfabético por producto)
  const groups = new Map<
    string,
    {
      label: string;
      productId: string | null;
      sku: string | null;
      slug: string | null;
      referencePrice: number | null;
      unitCost: number | null;
      tiers: typeof filteredTiers;
    }
  >();

  for (const tier of filteredTiers) {
    const key = tier.productId ?? "__catalogo__";
    const existing = groups.get(key);
    if (existing) {
      existing.tiers.push(tier);
    } else {
      groups.set(key, {
        label: tier.product?.name ?? "Todo el catálogo",
        productId: tier.productId,
        sku: tier.product?.sku ?? null,
        slug: tier.product?.slug ?? null,
        referencePrice: tier.productId
          ? (refPriceByProductId.get(tier.productId) ?? tier.product?.basePrice ?? null)
          : null,
        unitCost: tier.product?.cost ?? null,
        tiers: [tier],
      });
    }
  }

  const sortedGroups = [...groups.entries()].sort(([aKey, a], [bKey, b]) => {
    if (aKey === "__catalogo__") return -1;
    if (bKey === "__catalogo__") return 1;
    return a.label.localeCompare(b.label, "es");
  });

  function filterHref(nextFilter: TierFilter): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (nextFilter !== "all") params.set("filter", nextFilter);
    const qs = params.toString();
    return qs ? `/admin/mayorista?${qs}` : "/admin/mayorista";
  }

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Building2 className="h-5 w-5" />}
        title="Precios al por mayor"
        subtitle={
          <>
            Escalas públicas de descuento por volumen aplicadas automáticamente en producto, carrito
            y checkout ·{" "}
            {canEdit ? "Edición habilitada" : "Vista analítica de solo lectura para Finanzas"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Promociones" },
          { label: "Precios al por mayor" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canViewCosts && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/costos">
                  <Calculator className="mr-1.5 h-4 w-4" />
                  Costos y márgenes
                </Link>
              </Button>
            )}
            {canViewCoupons && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/cupones">
                  <Ticket className="mr-1.5 h-4 w-4" />
                  Cupones
                </Link>
              </Button>
            )}
            {canViewB2B && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/oportunidades">
                  <Building2 className="mr-1.5 h-4 w-4" />
                  Oportunidades B2B
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <AdminPageBody>
        {!canEdit && (
          <AdminNotice tone="info">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Eye className="h-4 w-4" />
              Modo solo lectura:
            </span>{" "}
            Tu perfil financiero puede auditar todas las escalas de volumen, ahorros otorgados y
            márgenes contra el costo BOM, sin modificar niveles activos.
          </AdminNotice>
        )}

        {sp.created === "1" && <AdminNotice tone="success">Nivel mayorista creado.</AdminNotice>}
        {sp.updated === "1" && <AdminNotice tone="success">Nivel actualizado.</AdminNotice>}
        {sp.activated === "1" && <AdminNotice tone="success">Nivel activado.</AdminNotice>}
        {sp.deactivated === "1" && (
          <AdminNotice tone="warning">
            Nivel desactivado (ya no se aplica en tienda ni carrito).
          </AdminNotice>
        )}
        {sp.deleted === "1" && <AdminNotice tone="warning">Nivel eliminado.</AdminNotice>}
        {typeof sp.error === "string" && <AdminNotice tone="error">{sp.error}</AdminNotice>}

        {/* KPIs ejecutivos */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-medium">Niveles activos</p>
                <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
                  <CountUp value={activeTiers.length} />
                </p>
                <p className="text-brand-muted mt-1 text-[11px]">
                  {inactiveCount > 0
                    ? `${inactiveCount} en pausa · ${globalActiveTiers.length} globales`
                    : `${globalActiveTiers.length} de alcance global`}
                </p>
              </div>
              <span className="bg-brand-purple/10 text-brand-purple rounded-lg p-2">
                <Layers className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-medium">Productos con escala propia</p>
                <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
                  <CountUp value={distinctProductIds.size} />
                </p>
                <p className="text-brand-muted mt-1 text-[11px]">
                  de {products.length} productos activos en catálogo
                </p>
              </div>
              <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
                <Package className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-medium">Ahorro promedio por volumen</p>
                <p className="font-display mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
                  −<CountUp value={avgSavingsPct} />%
                </p>
                <p className="text-brand-muted mt-1 text-[11px]">
                  sobre el precio base regular del producto
                </p>
              </div>
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                <TrendingDown className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>

          <AdminCard
            className={`p-4 ${belowCostCount > 0 ? "border-rose-200 bg-rose-50/30" : undefined}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-medium">Alertas de margen BOM</p>
                <p
                  className={`font-display mt-1 text-2xl font-bold tabular-nums ${
                    belowCostCount > 0
                      ? "text-rose-700"
                      : tightMarginCount > 0
                        ? "text-amber-700"
                        : "text-brand-purple-dark"
                  }`}
                >
                  <CountUp value={totalMarginAlerts} />
                </p>
                <p className="text-brand-muted mt-1 text-[11px]">
                  {belowCostCount > 0
                    ? `${belowCostCount} bajo costo (< 0%) · ${tightMarginCount} ajustados (< 20%)`
                    : tightMarginCount > 0
                      ? `${tightMarginCount} con margen ajustado (< 20%)`
                      : "0 niveles activos en pérdida"}
                </p>
              </div>
              <span
                className={`rounded-lg p-2 ${
                  belowCostCount > 0
                    ? "bg-rose-100 text-rose-700"
                    : "bg-brand-purple/10 text-brand-purple"
                }`}
              >
                <AlertTriangle className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>
        </section>

        {/* Gráfica ejecutiva de salud de margen + reglas claras del motor */}
        {tiers.length > 0 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr]">
            <AdminCard className="p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                    Salud de margen bruto en escalas mayoristas
                  </h2>
                  <p className="text-brand-muted text-xs">
                    Cruce en tiempo real entre el precio unitario del nivel y el costo de
                    fabricación BOM. Haz clic en un segmento para filtrar.
                  </p>
                </div>
              </div>
              <AdminDonutChart
                ariaLabel="Distribución de salud de margen de los niveles mayoristas"
                centerValue={String(tiers.length)}
                centerLabel={tiers.length === 1 ? "nivel" : "niveles"}
                slices={[
                  {
                    key: "healthy",
                    label: "Margen sano (≥ 20%)",
                    count: healthyCount,
                    tone: "emerald",
                    href: filterHref("active"),
                  },
                  {
                    key: "tight",
                    label: "Margen ajustado (0–19%)",
                    count: tightMarginCount,
                    tone: "amber",
                    href: filterHref("margin-alert"),
                  },
                  {
                    key: "below",
                    label: "Bajo costo BOM (< 0%)",
                    count: belowCostCount,
                    tone: "rose",
                    href: filterHref("margin-alert"),
                  },
                  {
                    key: "uncosted",
                    label: "Global o sin costo BOM",
                    count: uncostedOrGlobalCount,
                    tone: "turquoise",
                    href: filterHref("global"),
                  },
                  {
                    key: "inactive",
                    label: "Desactivados",
                    count: inactiveCount,
                    tone: "slate",
                    href: filterHref("inactive"),
                  },
                ]}
              />
            </AdminCard>

            <AdminCard className="bg-brand-cream/30 flex flex-col justify-between p-5">
              <div className="space-y-2.5 text-xs">
                <h2 className="text-brand-purple-dark font-display text-sm font-bold">
                  Reglas del motor de volumen en tienda
                </h2>
                <ul className="text-brand-purple-dark/85 list-disc space-y-1.5 pl-4 leading-relaxed">
                  <li>
                    <strong>Prioridad por producto:</strong> si un producto tiene niveles propios
                    activos, el carrito ignora los niveles globales de «Todo el catálogo» para ese
                    producto.
                  </li>
                  <li>
                    <strong>Escala estricta:</strong> a mayor cantidad mínima el precio unitario
                    debe bajar y ser siempre menor al precio base de venta.
                  </li>
                  <li>
                    <strong>Familias por packs o presentaciones</strong> (Polaroid, Cuadrados,
                    Separadores): calculan su ahorro directamente desde el precio de cada
                    presentación en{" "}
                    {canViewProducts ? (
                      <Link
                        href="/admin/productos"
                        className="text-brand-purple font-semibold hover:underline"
                      >
                        Productos › Opciones
                      </Link>
                    ) : (
                      <span>Productos › Opciones</span>
                    )}
                    , sin duplicar escalas acá.
                  </li>
                </ul>
              </div>
              <p className="text-brand-muted mt-3 border-t border-slate-200/70 pt-2.5 text-[11px]">
                Eliminar un nivel exige confirmación de segundo factor (TOTP reciente ≤ 10 min) y
                deja rastro en Auditoría.
              </p>
            </AdminCard>
          </div>
        )}

        {/* Formulario de creación (solo roles con catalog:write) */}
        {canEdit && (
          <AdminCard className="p-5">
            <h2 className="text-brand-purple-dark font-display mb-4 flex items-center gap-2 text-base font-bold">
              <Plus className="h-5 w-5" />
              Crear nivel de precio por volumen
            </h2>
            <CreateTierForm
              products={productOptions}
              globalActiveTiers={globalActiveTiers}
              defaultProductId={matchedProductForForm?.id ?? ""}
              canViewCosts={canViewCosts}
            />
          </AdminCard>
        )}

        {/* Barra de búsqueda y filtros */}
        {tiers.length > 0 && (
          <AdminCard className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <form method="GET" action="/admin/mayorista" className="flex flex-1 gap-2">
                {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
                <div className="relative max-w-md flex-1">
                  <Search className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <Input
                    type="search"
                    name="q"
                    defaultValue={q}
                    placeholder="Buscar por producto, SKU o nota…"
                    className="pl-9"
                  />
                </div>
                <Button type="submit" variant="outline" size="sm" className="h-9">
                  Filtrar
                </Button>
                {(q || filter !== "all") && (
                  <Button asChild variant="ghost" size="sm" className="h-9">
                    <Link href="/admin/mayorista">Limpiar</Link>
                  </Button>
                )}
              </form>

              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: "all", label: `Todos (${tiers.length})` },
                    { id: "active", label: `Activos (${activeTiers.length})` },
                    { id: "margin-alert", label: `Alerta margen (${totalMarginAlerts})` },
                    { id: "global", label: "Globales" },
                    { id: "inactive", label: `Pausados (${inactiveCount})` },
                  ] as const
                ).map((pill) => {
                  const active = filter === pill.id;
                  return (
                    <Link
                      key={pill.id}
                      href={filterHref(pill.id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        active
                          ? "bg-brand-purple text-white"
                          : "bg-brand-purple/5 text-brand-purple-dark hover:bg-brand-purple/15"
                      }`}
                    >
                      {pill.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </AdminCard>
        )}

        {tiers.length === 0 ? (
          <AdminEmpty
            icon={<Building2 className="h-5 w-5" />}
            title="No hay niveles mayoristas configurados"
            description={
              canEdit
                ? "Usa el formulario superior para crear el primero: elige el producto (o todo el catálogo), la cantidad mínima y el precio unitario."
                : "Todavía no se han definido escalas de descuento por volumen en el catálogo."
            }
          />
        ) : sortedGroups.length === 0 ? (
          <AdminEmpty
            icon={<Search className="h-5 w-5" />}
            title="Sin resultados para este filtro"
            description="Prueba con otro término de búsqueda o limpia los filtros activos."
          />
        ) : (
          sortedGroups.map(([key, group]) => (
            <section key={key} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-brand-purple-dark font-display text-base font-bold">
                    {group.productId && canViewProducts ? (
                      <Link
                        href={`/admin/productos/${group.productId}`}
                        className="hover:text-brand-purple hover:underline"
                      >
                        {group.label}
                      </Link>
                    ) : (
                      group.label
                    )}
                  </h2>
                  {group.sku && (
                    <code className="bg-brand-purple/5 text-brand-purple-dark rounded px-1.5 py-0.5 font-mono text-[11px]">
                      {group.sku}
                    </code>
                  )}
                  <AdminBadge tone={key === "__catalogo__" ? "turquoise" : "purple"}>
                    {key === "__catalogo__"
                      ? "Global"
                      : `${group.tiers.length} ${group.tiers.length === 1 ? "nivel" : "niveles"}`}
                  </AdminBadge>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {group.referencePrice !== null && (
                    <span className="text-brand-muted">
                      Precio base:{" "}
                      <strong className="text-brand-purple-dark tabular-nums">
                        {formatCOP(group.referencePrice)}
                      </strong>
                    </span>
                  )}
                  {group.unitCost !== null && group.unitCost > 0 ? (
                    <span className="text-brand-muted">
                      Costo BOM:{" "}
                      <strong className="text-brand-purple-dark tabular-nums">
                        {formatCOP(group.unitCost)}
                      </strong>
                    </span>
                  ) : (
                    group.sku &&
                    canViewCosts && (
                      <Link
                        href={`/admin/costos?q=${encodeURIComponent(group.sku)}`}
                        className="text-brand-purple font-semibold hover:underline"
                      >
                        Definir costo BOM →
                      </Link>
                    )
                  )}
                  {group.slug && (
                    <Link
                      href={`/producto/${group.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-muted hover:text-brand-purple-dark font-medium hover:underline"
                    >
                      Ver en tienda ↗
                    </Link>
                  )}
                </div>
              </div>

              <AdminTable>
                <AdminTableHead>
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Cantidad mínima</th>
                    <th className="px-4 py-3 text-right font-semibold">Precio unitario</th>
                    <th className="px-4 py-3 text-left font-semibold">Ahorro vs base</th>
                    <th className="px-4 py-3 text-left font-semibold">Margen BOM</th>
                    <th className="px-4 py-3 text-left font-semibold">Nota / Creado</th>
                    <th className="px-4 py-3 text-center font-semibold">Estado</th>
                    {canEdit && <th className="px-4 py-3 text-right font-semibold">Acciones</th>}
                  </tr>
                </AdminTableHead>
                <AdminTableBody>
                  {group.tiers.map((t) => {
                    const tierCap = t.product
                      ? maxSelectorUnitsForProduct({
                          slug: t.product.slug,
                          personalizationKind: t.product.personalizationKind,
                          personalizationSchema: t.product.personalizationSchema,
                          variantAttrs: t.variant?.attributes ?? t.product.variants[0]?.attributes,
                          allVariantsAttrs: t.product.variants.map((v) => v.attributes),
                        })
                      : {
                          maxUnits: MAX_SELF_SERVICE_PHYSICAL_UNITS,
                          unitPlural: "unidades",
                        };
                    return (
                      <TierRow
                        key={t.id}
                        tier={{
                          id: t.id,
                          minQty: t.minQty,
                          unitPrice: t.unitPrice,
                          variantLabel: t.variant
                            ? t.variant.name === "Default"
                              ? "Única"
                              : t.variant.name
                            : null,
                          note: t.note,
                          isActive: t.isActive,
                          createdLabel: formatDateCO(t.createdAt),
                        }}
                        referencePrice={tierReferencePrice(t) ?? group.referencePrice}
                        unitCost={group.unitCost}
                        maxMinQty={tierCap.maxUnits}
                        unitPlural={tierCap.unitPlural}
                        canEdit={canEdit}
                      />
                    );
                  })}
                </AdminTableBody>
              </AdminTable>
            </section>
          ))
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
