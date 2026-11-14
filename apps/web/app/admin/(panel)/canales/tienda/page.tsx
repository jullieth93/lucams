/*
 * Admin > Canales > Tienda online — estado del canal storefront (este sitio).
 *
 * Módulo SIN modelo: es una página de ESTADO (solo lectura), no de gestión.
 * La tienda no tiene configuración mutable en DB — su "config" vive en env
 * vars (NEXT_PUBLIC_STORE_MODE, NEXT_PUBLIC_SITE_URL) y en código, así que
 * acá solo se REFLEJA ese estado para que Lucy lo vea sin abrir Vercel, y se
 * concentran los links operativos del canal (tienda, sitemap, robots, status).
 *
 * Fase 3D (feedback Lucy 2026-09-18): la página ya no es solo "la URL y los
 * links" — suma pulso real del canal (solo lectura): estado de la contraentrega
 * (COD_ENABLED, fail-closed como el checkout), productos activos vs total,
 * variantes con stock bajo y pedidos totales (conteos Prisma en vivo).
 *
 * La salud de Wompi/Aveonline NO se duplica acá: la tarjeta de integraciones
 * enlaza a /admin/integraciones, que es su única fuente de verdad.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  Bot,
  ExternalLink,
  Globe,
  Map,
  Package,
  PackageX,
  Plug,
  Rss,
  ShoppingBag,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminDonutChart,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  QuickLink,
} from "@/components/admin-page";
import { CountUp } from "@/components/admin/count-up";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import { requireCapability } from "@/lib/admin-rbac-guard";
import { getSettingValue } from "@/lib/cms";
import { prisma } from "@/lib/db";
import { getCanonicalSiteUrl } from "@/lib/public-url";
import { STORE_MODE } from "@/lib/store-mode";

export const metadata: Metadata = {
  title: "Canal: Tienda online",
  robots: { index: false, follow: false },
};

// Mismo criterio fail-closed de lib/store-mode: solo el valor exacto "catalog"
// activa el modo catálogo; cualquier otra cosa se muestra como tienda full.
const MODE_LABEL: Record<typeof STORE_MODE, string> = {
  catalog: "Catálogo (sin pagos en línea)",
  full: "Tienda completa (con pagos)",
};

export default async function AdminCanalTiendaPage() {
  const session = await requireCapability("catalog:write");
  const role = session.admin.role;

  const siteUrl = getCanonicalSiteUrl();
  const isCatalog = STORE_MODE === "catalog";
  const canSeeConciliacion = canAccessAdminPath(role, "/admin/finanzas/conciliacion");
  const canSeeIntegraciones = canAccessAdminPath(role, "/admin/integraciones");
  const canSeeGlobalSettings = canAccessAdminPath(role, "/admin/contenido/paginas/global");
  const canSeeEnvios = canAccessAdminPath(role, "/admin/envios");

  // Pulso del canal (Fase 3D, solo lectura): conteos Prisma en vivo + el
  // ajuste COD_ENABLED con el mismo criterio fail-closed del checkout (solo
  // "true" exacto la habilita). ProductVariant NO tiene minStock: el umbral
  // de stock bajo es el operativo ≤5 (mismo del resumen diario/observability).
  const [
    codEnabledRaw,
    productsActive,
    productsTotal,
    healthyVariants,
    lowStockVariants,
    outOfStockVariants,
    ordersTotal,
  ] = await Promise.all([
    getSettingValue("COD_ENABLED", "false"),
    prisma.product.count({ where: { isActive: true, deletedAt: null } }),
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.productVariant.count({
      where: {
        stock: { gt: 5 },
        isActive: true,
        deletedAt: null,
        product: { isActive: true, deletedAt: null },
      },
    }),
    prisma.productVariant.count({
      where: {
        stock: { gt: 0, lte: 5 },
        isActive: true,
        deletedAt: null,
        product: { isActive: true, deletedAt: null },
      },
    }),
    prisma.productVariant.count({
      where: {
        stock: { lte: 0 },
        isActive: true,
        deletedAt: null,
        product: { isActive: true, deletedAt: null },
      },
    }),
    prisma.order.count({ where: { deletedAt: null } }),
  ]);
  const codEnabled = codEnabledRaw === "true";
  const productsInactive = Math.max(0, productsTotal - productsActive);
  const criticalOrOutVariants = lowStockVariants + outOfStockVariants;
  const totalActiveVariants = healthyVariants + criticalOrOutVariants;
  const catalogCoveragePct =
    productsTotal > 0 ? Math.round((productsActive / productsTotal) * 100) : 0;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Store className="h-5 w-5" />}
        title="Canal: Tienda online"
        subtitle="Estado operativo, cobertura de catálogo y feeds públicos de Lucams Shop."
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Canales" },
          { label: "Tienda online" },
        ]}
        actions={
          <AdminButton href="/" variant="secondary">
            <ExternalLink className="h-4 w-4" />
            Ver tienda
          </AdminButton>
        }
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Para qué sirve esta página?</strong> Es el centro de mando del canal tienda
          online: muestra su dominio canónico, el modo de operación, la salud de stock expuesto al
          cliente y los feeds de indexación (Google Search y Merchant Center).
        </AdminNotice>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AdminCard className="p-5" hover>
            <div className="flex items-center gap-2">
              <div className="bg-brand-purple/10 text-brand-purple flex h-8 w-8 items-center justify-center rounded-lg">
                <Globe className="h-4 w-4" />
              </div>
              <h2 className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                URL de la tienda
              </h2>
            </div>
            <p className="mt-3">
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-purple-dark hover:text-brand-purple font-mono text-sm font-semibold break-all underline"
              >
                {siteUrl}
              </a>
            </p>
            <p className="text-brand-muted mt-1 text-xs">
              Dominio canónico público (env <code>NEXT_PUBLIC_SITE_URL</code>).
            </p>
          </AdminCard>

          <AdminCard className="p-5" hover>
            <div className="flex items-center gap-2">
              <div className="bg-brand-purple/10 text-brand-purple flex h-8 w-8 items-center justify-center rounded-lg">
                <Store className="h-4 w-4" />
              </div>
              <h2 className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                Modo de tienda
              </h2>
            </div>
            <p className="mt-3">
              <AdminBadge tone={isCatalog ? "blue" : "emerald"}>
                {MODE_LABEL[STORE_MODE]}
              </AdminBadge>
            </p>
            <p className="text-brand-muted mt-2 text-xs">
              {isCatalog
                ? "Los clientes cotizan por WhatsApp; no hay pagos en línea ni envíos integrados."
                : "Los clientes pagan en línea (Wompi) y el envío cotiza en tiempo real con Aveonline y Envío Lucams."}
            </p>
          </AdminCard>
        </div>

        {/* Pulso del canal */}
        <div>
          <h2 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
            Pulso del canal
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AdminCard className="p-5">
              <div className="flex items-center gap-2">
                <div className="bg-brand-purple/10 text-brand-purple flex h-8 w-8 items-center justify-center rounded-lg">
                  <Package className="h-4 w-4" />
                </div>
                <h3 className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                  Catálogo publicado
                </h3>
              </div>
              <p className="text-brand-purple-dark font-display mt-3 text-2xl font-bold tabular-nums">
                <CountUp value={productsActive} />
                <span className="text-brand-muted text-sm font-normal"> de {productsTotal}</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="admin-bar-grow-x bg-brand-purple h-full rounded-full"
                  style={{ width: `${catalogCoveragePct}%` }}
                />
              </div>
              <p className="text-brand-muted mt-2 text-xs">
                {catalogCoveragePct}% activo en vitrina.{" "}
                <Link
                  href="/admin/productos"
                  className="text-brand-purple-dark font-semibold underline"
                >
                  Gestionar
                </Link>
              </p>
            </AdminCard>

            <AdminCard className="p-5">
              <div className="flex items-center gap-2">
                <div className="bg-brand-purple/10 text-brand-purple flex h-8 w-8 items-center justify-center rounded-lg">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <h3 className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                  Pedidos históricos
                </h3>
              </div>
              <p className="text-brand-purple-dark font-display mt-3 text-2xl font-bold tabular-nums">
                <CountUp value={ordersTotal} />
              </p>
              <p className="text-brand-muted mt-2 text-xs">
                órdenes registradas en el canal.{" "}
                <Link
                  href="/admin/pedidos"
                  className="text-brand-purple-dark font-semibold underline"
                >
                  Ver pedidos
                </Link>
              </p>
            </AdminCard>

            <AdminCard className="p-5">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    criticalOrOutVariants > 0
                      ? "bg-amber-100 text-amber-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  <PackageX className="h-4 w-4" />
                </div>
                <h3 className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                  Riesgo de stock
                </h3>
              </div>
              <p
                className={`font-display mt-3 text-2xl font-bold tabular-nums ${
                  criticalOrOutVariants > 0 ? "text-amber-700" : "text-emerald-700"
                }`}
              >
                <CountUp value={criticalOrOutVariants} />
              </p>
              <p className="text-brand-muted mt-2 text-xs">
                {outOfStockVariants > 0
                  ? `${outOfStockVariants} agotadas · ${lowStockVariants} con ≤5 uds.`
                  : "variantes activas con ≤5 unidades."}{" "}
                <Link
                  href="/admin/inventario"
                  className="text-brand-purple-dark font-semibold underline"
                >
                  Inventario
                </Link>
              </p>
            </AdminCard>

            <AdminCard className="p-5">
              <div className="flex items-center gap-2">
                <div className="bg-brand-purple/10 text-brand-purple flex h-8 w-8 items-center justify-center rounded-lg">
                  <Wallet className="h-4 w-4" />
                </div>
                <h3 className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                  Contraentrega
                </h3>
              </div>
              <p className="mt-3">
                <AdminBadge tone={codEnabled ? "emerald" : "amber"}>
                  {codEnabled ? "Activa (COD_ENABLED)" : "Desactivada"}
                </AdminBadge>
              </p>
              <p className="text-brand-muted mt-2 text-xs">
                {isCatalog
                  ? "Sin checkout de pagos en modo catálogo."
                  : codEnabled
                    ? "Los clientes pueden pagar al recibir."
                    : "El checkout exige pago electrónico."}{" "}
                {canSeeConciliacion && (
                  <Link
                    href="/admin/finanzas/conciliacion"
                    className="text-brand-purple-dark font-semibold underline"
                  >
                    Conciliación
                  </Link>
                )}
                {!canSeeConciliacion && canSeeGlobalSettings && (
                  <Link
                    href="/admin/contenido/paginas/global"
                    className="text-brand-purple-dark font-semibold underline"
                  >
                    Ajustes
                  </Link>
                )}
              </p>
            </AdminCard>
          </div>
        </div>

        {/* Visualización ejecutiva de cobertura de catálogo y variantes */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminCard className="p-5">
            <h3 className="text-brand-purple-dark font-display mb-1 text-base font-bold">
              Disponibilidad del catálogo
            </h3>
            <p className="text-brand-muted mb-4 text-xs">
              Proporción de productos visibles en la tienda frente a pausados o en preparación.
            </p>
            <AdminDonutChart
              ariaLabel="Proporción de productos activos e inactivos"
              centerValue={`${catalogCoveragePct}%`}
              centerLabel="Activos"
              slices={[
                {
                  key: "active",
                  label: "Publicados en tienda",
                  count: productsActive,
                  tone: "emerald",
                  href: "/admin/productos",
                },
                {
                  key: "inactive",
                  label: "Ocultos o pausados",
                  count: productsInactive,
                  tone: "slate",
                  href: "/admin/productos",
                },
              ]}
            />
          </AdminCard>

          <AdminCard className="p-5">
            <h3 className="text-brand-purple-dark font-display mb-1 text-base font-bold">
              Salud de variantes en vitrina
            </h3>
            <p className="text-brand-muted mb-4 text-xs">
              Estado de inventario de las {totalActiveVariants} variantes activas expuestas al
              comprador.
            </p>
            <AdminDonutChart
              ariaLabel="Distribución de stock en variantes activas"
              centerValue={String(totalActiveVariants)}
              centerLabel="Variantes"
              slices={[
                {
                  key: "healthy",
                  label: "Stock saludable (> 5 uds)",
                  count: healthyVariants,
                  tone: "purple",
                  href: "/admin/inventario",
                },
                {
                  key: "low",
                  label: "Stock bajo (1 a 5 uds)",
                  count: lowStockVariants,
                  tone: "amber",
                  href: "/admin/inventario",
                },
                {
                  key: "out",
                  label: "Agotadas (0 uds)",
                  count: outOfStockVariants,
                  tone: "rose",
                  href: "/admin/inventario",
                },
              ]}
            />
          </AdminCard>
        </div>

        <div>
          <h2 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
            Superficies públicas y feeds del canal
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <QuickLink
              href="/"
              label="Ver tienda"
              description="Abre la portada pública de Lucams Shop."
              icon={ExternalLink}
            />
            <QuickLink
              href="/sitemap.xml"
              label="sitemap.xml"
              description="Índice XML de URLs vivas para Google Search Console."
              icon={Map}
            />
            <QuickLink
              href="/feeds/google-merchant.xml"
              label="Google Merchant"
              description="Feed XML de catálogo y precios para Google Shopping."
              icon={Rss}
            />
            <QuickLink
              href="/robots.txt"
              label="robots.txt"
              description="Directivas de rastreo para buscadores."
              icon={Bot}
            />
            <QuickLink
              href="/status"
              label="Estado del sitio"
              description="Página pública de disponibilidad y versión desplegada."
              icon={Activity}
            />
          </div>
        </div>

        {(canSeeIntegraciones || canSeeEnvios) && (
          <AdminCard className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="from-brand-purple/15 to-brand-pink/15 text-brand-purple flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br">
                  {canSeeIntegraciones ? (
                    <Plug className="h-5 w-5" />
                  ) : (
                    <Truck className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h2 className="text-brand-purple-dark font-display text-base font-bold">
                    {canSeeIntegraciones
                      ? "Conectores técnicos y transporte del canal"
                      : "Transporte y cobertura del checkout"}
                  </h2>
                  <p className="text-brand-purple-dark/75 mt-1 text-sm">
                    {canSeeIntegraciones
                      ? "Revisa la salud en tiempo real de Wompi, Aveonline y Resend o ajusta las transportadoras habilitadas."
                      : "Configura las transportadoras aliadas, reglas de peso y zonas locales de Envío Lucams ofrecidas al comprador."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canSeeEnvios && (
                  <AdminButton href="/admin/envios" variant="secondary" size="sm">
                    Configurar envíos
                  </AdminButton>
                )}
                {canSeeIntegraciones && (
                  <AdminButton href="/admin/integraciones" variant="primary" size="sm">
                    Ir a integraciones
                  </AdminButton>
                )}
              </div>
            </div>
          </AdminCard>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
