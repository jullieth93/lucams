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
import { redirect } from "next/navigation";
import {
  Activity,
  Bot,
  ExternalLink,
  Globe,
  Map,
  Package,
  PackageX,
  Plug,
  ShoppingBag,
  Store,
  Wallet,
} from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  QuickLink,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
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
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const siteUrl = getCanonicalSiteUrl();
  const isCatalog = STORE_MODE === "catalog";

  // Pulso del canal (Fase 3D, solo lectura): conteos Prisma en vivo + el
  // ajuste COD_ENABLED con el mismo criterio fail-closed del checkout (solo
  // "true" exacto la habilita). ProductVariant NO tiene minStock: el umbral
  // de stock bajo es el operativo ≤5 (mismo del resumen diario/observability).
  const [codEnabledRaw, productsActive, productsTotal, lowStockVariants, ordersTotal] =
    await Promise.all([
      getSettingValue("COD_ENABLED", "false"),
      prisma.product.count({ where: { isActive: true, deletedAt: null } }),
      prisma.product.count({ where: { deletedAt: null } }),
      prisma.productVariant.count({
        where: {
          stock: { lte: 5 },
          isActive: true,
          deletedAt: null,
          product: { isActive: true, deletedAt: null },
        },
      }),
      prisma.order.count({ where: { deletedAt: null } }),
    ]);
  const codEnabled = codEnabledRaw === "true";

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Store className="h-5 w-5" />}
        title="Canal: Tienda online"
        subtitle="Estado del canal de venta de este sitio (lucamsshop.com)."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
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
          <strong>¿Para qué sirve esta página?</strong> Es el resumen del canal tienda online: su
          dirección pública, el modo en que opera y los accesos rápidos para revisarla. El detalle
          técnico de las integraciones (pagos, envíos) vive en{" "}
          <strong>Configuración › Integraciones</strong>.
        </AdminNotice>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AdminCard className="p-5">
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
              Dominio canónico público (env NEXT_PUBLIC_SITE_URL).
            </p>
          </AdminCard>

          <AdminCard className="p-5">
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
                : "Los clientes pagan en línea (Wompi) y el envío se integra con Aveonline."}
            </p>
          </AdminCard>
        </div>

        {/* Pulso del canal (Fase 3D, solo lectura): números reales del catálogo,
            pedidos y contraentrega, con acceso directo al módulo que los gestiona. */}
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
                  Catálogo
                </h3>
              </div>
              <p className="text-brand-purple-dark font-display mt-3 text-2xl font-bold tabular-nums">
                {productsActive}
                <span className="text-brand-muted text-sm font-normal"> de {productsTotal}</span>
              </p>
              <p className="text-brand-muted mt-1 text-xs">
                productos activos.{" "}
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
                  Pedidos
                </h3>
              </div>
              <p className="text-brand-purple-dark font-display mt-3 text-2xl font-bold tabular-nums">
                {ordersTotal}
              </p>
              <p className="text-brand-muted mt-1 text-xs">
                pedidos en total.{" "}
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
                    lowStockVariants > 0
                      ? "bg-amber-100 text-amber-700"
                      : "bg-brand-purple/10 text-brand-purple"
                  }`}
                >
                  <PackageX className="h-4 w-4" />
                </div>
                <h3 className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                  Stock bajo
                </h3>
              </div>
              <p
                className={`font-display mt-3 text-2xl font-bold tabular-nums ${
                  lowStockVariants > 0 ? "text-amber-700" : "text-brand-purple-dark"
                }`}
              >
                {lowStockVariants}
              </p>
              <p className="text-brand-muted mt-1 text-xs">
                variantes activas con ≤5 unidades.{" "}
                <Link
                  href="/admin/inventario"
                  className="text-brand-purple-dark font-semibold underline"
                >
                  Ver inventario
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
                    : "El checkout no ofrece pago al recibir."}{" "}
                <Link
                  href="/admin/finanzas/conciliacion"
                  className="text-brand-purple-dark font-semibold underline"
                >
                  Conciliación
                </Link>
              </p>
            </AdminCard>
          </div>
        </div>

        <div>
          <h2 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
            Enlaces rápidos
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <QuickLink
              href="/"
              label="Ver tienda"
              description="Abre la página principal de la tienda."
              icon={ExternalLink}
            />
            <QuickLink
              href="/sitemap.xml"
              label="sitemap.xml"
              description="Mapa del sitio que leen Google y otros buscadores."
              icon={Map}
            />
            <QuickLink
              href="/robots.txt"
              label="robots.txt"
              description="Reglas de rastreo para los buscadores."
              icon={Bot}
            />
            <QuickLink
              href="/status"
              label="Estado del sitio"
              description="Página pública de estado y versión del despliegue."
              icon={Activity}
            />
          </div>
        </div>

        <AdminCard className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="from-brand-purple/15 to-brand-pink/15 text-brand-purple flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br">
                <Plug className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-brand-purple-dark font-display text-base font-bold">
                  Salud de integraciones
                </h2>
                <p className="text-brand-purple-dark/75 mt-1 text-sm">
                  El estado de pagos (Wompi) y envíos (Aveonline) de este canal se revisa en el
                  módulo de integraciones.
                </p>
              </div>
            </div>
            <AdminButton href="/admin/integraciones" variant="secondary" size="sm">
              Ir a integraciones
            </AdminButton>
          </div>
        </AdminCard>
      </AdminPageBody>
    </AdminPage>
  );
}
