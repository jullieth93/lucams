/*
 * Admin > Canales > Tienda online — estado del canal storefront (este sitio).
 *
 * Módulo SIN modelo: es una página de ESTADO (solo lectura), no de gestión.
 * La tienda no tiene configuración mutable en DB — su "config" vive en env
 * vars (NEXT_PUBLIC_STORE_MODE, NEXT_PUBLIC_SITE_URL) y en código, así que
 * acá solo se REFLEJA ese estado para que Lucy lo vea sin abrir Vercel, y se
 * concentran los links operativos del canal (tienda, sitemap, robots, status).
 *
 * La salud de Wompi/Aveonline NO se duplica acá: la tarjeta de integraciones
 * enlaza a /admin/integraciones, que es su única fuente de verdad.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Activity, Bot, ExternalLink, Globe, Map, Plug, Store } from "lucide-react";
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
