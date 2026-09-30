/*
 * Admin > Envíos — casa de la configuración de transporte del checkout.
 *
 * Vive FUERA de /admin/integraciones/aveonline (decisión del owner): el envío
 * propio Lucam's no es parte de la integración Aveonline y las transportadoras
 * que el checkout ofrece son configuración de negocio, no plumbing técnico.
 * Acá se gestionan:
 *   - Lista unificada de transportadoras: «Envío Lucam's» (propio) + carriers
 *     de la cuenta Aveonline, con toggles on/off.
 *   - Configuración del envío propio: precio, hora límite «entrega hoy» y
 *     zonas de entrega por ciudad.
 * Lo técnico de Aveonline (webhooks de tracking) quedó en
 * /admin/integraciones/aveonline.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bike, Truck } from "lucide-react";
import { AdminPage, AdminPageHeader, AdminPageBody, AdminNotice } from "@/components/admin-page";
import { isCatalogMode } from "@/lib/store-mode";
import { requireRole } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { listCarriersForAdmin } from "@/features/shipping/aveonline";
import {
  getDisabledCarriersNormalized,
  getLucamsShippingSettings,
  normalizeCarrierKey,
} from "@/features/shipping/settings";
import { CarriersSection } from "./carriers-section";
import { LucamsShippingSection } from "./lucams-shipping-section";

export const metadata: Metadata = { title: "Envíos" };
export const dynamic = "force-dynamic";

export default async function EnviosAdminPage() {
  // B-7 (auditoría 2026-08-24): guard propio — el layout no se re-ejecuta en
  // navegaciones soft. Mismo set que las actions de la página (MANAGER_UP) y
  // que la ruta en lib/admin-rbac.ts (CATALOG).
  await requireRole(ADMIN_ROLE_SETS.MANAGER_UP);
  // Modo catálogo (Etapa 1): no hay checkout con envíos — nada que configurar
  // (mismo criterio que /admin/integraciones).
  if (isCatalogMode()) redirect("/admin/dashboard");

  // Transportadoras habilitadas en la cuenta Aveonline (para los toggles) +
  // las que el negocio dejó deshabilitadas + config del envío propio.
  let carriers: Array<{ id: number; text: string }> = [];
  let carriersError: string | null = null;
  try {
    carriers = await listCarriersForAdmin();
  } catch (err) {
    carriersError = err instanceof Error ? err.message : String(err);
  }
  const [disabledNormalized, lucamsSettings] = await Promise.all([
    getDisabledCarriersNormalized(),
    getLucamsShippingSettings(),
  ]);
  const carrierRows = carriers.map((c) => ({
    ...c,
    disabled: disabledNormalized.includes(normalizeCarrierKey(c.text)),
  }));

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Truck className="h-5 w-5" />}
        title="Envíos"
        subtitle="Transportadoras del checkout y envío propio Lucam's"
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Configuración" },
          { label: "Envíos" },
        ]}
      />

      <AdminPageBody>
        {/* Transportadoras del checkout (lista unificada: propio + Aveonline) */}
        <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Truck className="text-brand-purple h-4 w-4" />
            <h2 className="text-brand-purple-dark text-sm font-bold">Transportadoras</h2>
          </div>
          <p className="text-brand-muted mb-3 text-xs">
            Todo lo que el checkout puede ofrecer: tu envío propio y las transportadoras de tu
            cuenta Aveonline. Si deshabilitas una, el checkout deja de ofrecerla de inmediato (las
            cotizaciones ya selladas de clientes en curso se respetan).
          </p>
          {carriersError && (
            <AdminNotice tone="warning">
              <strong>No pudimos cargar las transportadoras desde Aveonline.</strong>{" "}
              {carriersError}. Si Aveonline está caído, vuelve a intentar en unos minutos; el
              checkout sigue operando con la configuración actual.
              {disabledNormalized.length > 0 && (
                <>
                  {" "}
                  Tienes {disabledNormalized.length} transportadora(s) deshabilitada(s) guardada(s).
                </>
              )}
            </AdminNotice>
          )}
          {!carriersError && carrierRows.length === 0 && (
            <AdminNotice tone="info">
              La cuenta Aveonline no reporta transportadoras habilitadas. Actívalas desde el panel
              de Aveonline o escríbele a tu asesor logístico.
            </AdminNotice>
          )}
          <CarriersSection carriers={carrierRows} lucamsEnabled={lucamsSettings.enabled} />
        </section>

        {/* Envío propio Lucam's — configuración (precio, cutoff, zonas por ciudad) */}
        <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Bike className="text-brand-purple h-4 w-4" />
            <h2 className="text-brand-purple-dark text-sm font-bold">
              Envío propio Lucam&apos;s — configuración
            </h2>
          </div>
          <p className="text-brand-muted mb-3 text-xs">
            Mensajería interna por zonas de entrega: aparece en el checkout como una opción más. La
            promesa suma la fabricación a mano del pedido y la hora límite («Entrega hoy» solo si el
            pedido entra antes de la hora límite y no hay fabricación pendiente; si no, «Entrega en
            N días hábiles»). Estos pedidos NO generan guía de Aveonline — se despachan a mano y
            tienen su propia guía de entrega imprimible en el detalle del pedido. El on/off se
            maneja en la lista de transportadoras de arriba.
          </p>
          <LucamsShippingSection
            initial={{
              pricePesos: Math.round(lucamsSettings.priceCop / 100),
              cutoffHour: lucamsSettings.cutoffHour,
              zones: lucamsSettings.zones,
            }}
          />
        </section>

        <AdminNotice tone="info">
          ¿Buscas los webhooks de tracking de Aveonline? Eso es configuración técnica de la
          integración y quedó en{" "}
          <Link href="/admin/integraciones/aveonline" className="font-semibold underline">
            Integraciones › Aveonline
          </Link>
          .
        </AdminNotice>
      </AdminPageBody>
    </AdminPage>
  );
}
