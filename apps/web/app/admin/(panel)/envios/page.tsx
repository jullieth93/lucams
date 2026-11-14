/*
 * Admin > Envíos — casa de la configuración de transporte del checkout.
 *
 * Vive FUERA de /admin/integraciones/aveonline (decisión del owner): el envío
 * propio Lucams no es parte de la integración Aveonline y las transportadoras
 * que el checkout ofrece son configuración de negocio, no plumbing técnico.
 * Acá se gestionan:
 *   - Lista unificada de transportadoras: «Envío Lucams» (propio) + carriers
 *     de la cuenta Aveonline, con toggles on/off.
 *   - Configuración del envío propio: precio, hora límite operativa y
 *     zonas de entrega por ciudad.
 * Lo técnico de Aveonline (webhooks de tracking) quedó en
 * /admin/integraciones/aveonline.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Bike, CheckCircle2, Cog, MapPin, Plug, Truck } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminNotice,
  KpiCard,
} from "@/components/admin-page";
import { getSettingValue } from "@/lib/cms";
import { LUCAMS_ZONE_CITIES } from "@/lib/lucams-zones";
import { isCatalogMode } from "@/lib/store-mode";
import { requireCapability } from "@/lib/admin-rbac-guard";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import { listCarriersForAdmin } from "@/features/shipping/aveonline";
import {
  countEnabledZones,
  getCarrierRules,
  getDisabledCarriersNormalized,
  getLucamsShippingSettings,
  normalizeCarrierKey,
} from "@/features/shipping/settings";
import { CarriersSection } from "./carriers-section";
import { LucamsShippingSection } from "./lucams-shipping-section";

export const metadata: Metadata = {
  title: "Envíos",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function EnviosAdminPage() {
  // B-7 (auditoría 2026-08-24): guard propio alineado con shipping:configure.
  const session = await requireCapability("shipping:configure");
  const role = session.admin.role;
  // Modo catálogo (Etapa 1): no hay checkout con envíos — nada que configurar.
  if (isCatalogMode()) redirect("/admin/dashboard");

  const canEditGlobalSettings = canAccessAdminPath(role, "/admin/contenido/paginas/global");
  const canSeeAveonlineWebhooks = canAccessAdminPath(role, "/admin/integraciones/aveonline");

  // Transportadoras habilitadas en la cuenta Aveonline (para los toggles) +
  // las que el negocio dejó deshabilitadas + config del envío propio + origen de despacho.
  let carriers: Array<{ id: number; text: string }> = [];
  let carriersError: string | null = null;
  try {
    carriers = await listCarriersForAdmin();
  } catch (err) {
    carriersError = err instanceof Error ? err.message : String(err);
  }
  const [
    disabledNormalized,
    carrierRules,
    lucamsSettings,
    pickupCity,
    pickupDepartment,
    pickupAddress,
    pickupPhone,
    pickupContactName,
    businessNit,
  ] = await Promise.all([
    getDisabledCarriersNormalized(),
    getCarrierRules(),
    getLucamsShippingSettings(),
    getSettingValue("PICKUP_CITY", ""),
    getSettingValue("PICKUP_DEPARTMENT", ""),
    getSettingValue("PICKUP_ADDRESS", ""),
    getSettingValue("PICKUP_PHONE", ""),
    getSettingValue("PICKUP_CONTACT_NAME", ""),
    getSettingValue("BUSINESS_NIT", "0000000000"),
  ]);
  const carrierRows = carriers.map((c) => ({
    ...c,
    disabled: disabledNormalized.includes(normalizeCarrierKey(c.text)),
    rule: carrierRules[normalizeCarrierKey(c.text)] ?? null,
  }));

  const activeAveonlineCount = carrierRows.filter((c) => !c.disabled).length;
  const totalActiveMethods = activeAveonlineCount + (lucamsSettings.enabled ? 1 : 0);
  const rulesConfiguredCount = carrierRows.filter(
    (c) => c.rule && (c.rule.minWeightKg !== null || c.rule.maxWeightKg !== null),
  ).length;
  const enabledZonesCount = countEnabledZones(lucamsSettings.zones);
  const totalCatalogZones = LUCAMS_ZONE_CITIES.reduce((acc, c) => acc + c.zones.length, 0);
  const lucamsPricePesos = Math.round(lucamsSettings.priceCop / 100);

  const missingOriginFields: string[] = [];
  if (!pickupCity.trim()) missingOriginFields.push("Ciudad (PICKUP_CITY)");
  if (!pickupDepartment.trim()) missingOriginFields.push("Departamento (PICKUP_DEPARTMENT)");
  if (!pickupAddress.trim()) missingOriginFields.push("Dirección (PICKUP_ADDRESS)");
  if (!pickupPhone.trim()) missingOriginFields.push("Teléfono (PICKUP_PHONE)");
  if (!pickupContactName.trim()) missingOriginFields.push("Contacto (PICKUP_CONTACT_NAME)");
  const originReady = missingOriginFields.length === 0;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Truck className="h-5 w-5" />}
        title="Envíos y Cobertura"
        subtitle="Transportadoras del checkout, reglas de peso, origen de despacho y mensajería propia Lucams"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Configuración" },
          { label: "Envíos" },
        ]}
      />

      <AdminPageBody>
        {/* Alerta crítica si el checkout quedaría sin métodos de envío */}
        {!carriersError && totalActiveMethods === 0 && (
          <AdminNotice tone="error">
            <strong>Atención crítica: el checkout no tiene ninguna transportadora activa.</strong>{" "}
            Tanto «Envío Lucams» como todas las transportadoras de Aveonline están desactivadas (o
            sin configurar). Los clientes no podrán completar el paso de envío hasta que actives al
            menos una opción.
          </AdminNotice>
        )}

        {!originReady && (
          <AdminNotice tone="warning">
            <strong>Faltan datos del remitente para generar guías Aveonline:</strong>{" "}
            {missingOriginFields.join(", ")}.{" "}
            {canEditGlobalSettings ? (
              <Link href="/admin/contenido/paginas/global" className="font-semibold underline">
                Complétalos en Ajustes del sitio →
              </Link>
            ) : (
              "Solicita a un Superadmin completarlos en Ajustes del sitio."
            )}
          </AdminNotice>
        )}

        {/* KPIs operativos de transporte */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Opciones en checkout"
            value={totalActiveMethods}
            trend={totalActiveMethods > 0 ? "up" : "down"}
            trendLabel={`${activeAveonlineCount} vía Aveonline${lucamsSettings.enabled ? " + Envío Lucams" : ""}`}
          />
          <KpiCard
            label="Reglas de peso"
            value={rulesConfiguredCount}
            trend="neutral"
            trendLabel={`De ${carrierRows.length} transportadoras aliadas`}
          />
          <KpiCard
            label="Tarifa Envío Lucams"
            value={`$${lucamsPricePesos.toLocaleString("es-CO")}`}
            trend={lucamsSettings.enabled ? "up" : "neutral"}
            trendLabel={`${lucamsSettings.enabled ? "Activo" : "Pausado"} · corte ${String(lucamsSettings.cutoffHour).padStart(2, "0")}:00 h`}
          />
          <KpiCard
            label="Zonas locales activas"
            value={`${enabledZonesCount}/${totalCatalogZones}`}
            trend={enabledZonesCount > 0 ? "up" : "neutral"}
            trendLabel="Localidades habilitadas para entrega propia"
          />
        </div>

        {/* Tarjeta puente de Punto de Origen (SiteSettings PICKUP_*) */}
        <AdminCard className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                  originReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-brand-purple-dark font-display text-base font-bold">
                    Punto de origen de despacho (Remitente)
                  </h2>
                  {originReady ? (
                    <AdminBadge tone="emerald">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Completo (5/5)
                    </AdminBadge>
                  ) : (
                    <AdminBadge tone="amber">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Incompleto ({5 - missingOriginFields.length}/5)
                    </AdminBadge>
                  )}
                </div>
                <p className="text-brand-muted mt-1 text-xs">
                  Aveonline cotiza desde{" "}
                  <strong className="text-brand-purple-dark">
                    {pickupCity || "Sin ciudad"} ({pickupDepartment || "Sin departamento"})
                  </strong>
                  {pickupContactName ? ` · Remitente: ${pickupContactName}` : ""}
                  {canEditGlobalSettings && pickupAddress
                    ? ` · ${pickupAddress} · NIT ${businessNit}`
                    : ""}
                  .
                </p>
              </div>
            </div>
            {canEditGlobalSettings && (
              <AdminButton href="/admin/contenido/paginas/global" variant="secondary" size="sm">
                <Cog className="h-3.5 w-3.5" />
                Editar origen en Ajustes
              </AdminButton>
            )}
          </div>
        </AdminCard>

        {/* Transportadoras del checkout (lista unificada: propio + Aveonline) */}
        <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Truck className="text-brand-purple h-4 w-4" />
            <h2 className="text-brand-purple-dark text-sm font-bold">Transportadoras</h2>
          </div>
          <p className="text-brand-muted mb-3 text-xs">
            Todo lo que el checkout puede ofrecer: tu envío propio y las transportadoras de tu
            cuenta Aveonline. Si deshabilitas una, el checkout deja de ofrecerla de inmediato (las
            cotizaciones ya selladas de clientes en curso se respetan). Con «Regla de peso» puedes
            fijar el peso mínimo/máximo del paquete con el que cada una opera: fuera de ese rango el
            checkout no la ofrece (evita guías rechazadas al despachar).
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

        {/* Envío propio Lucams — configuración (precio, cutoff, zonas por ciudad) */}
        <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Bike className="text-brand-purple h-4 w-4" />
            <h2 className="text-brand-purple-dark text-sm font-bold">
              Envío propio Lucams — configuración
            </h2>
          </div>
          <p className="text-brand-muted mb-3 text-xs">
            Mensajería interna por zonas de entrega: aparece en el checkout como una opción más. La
            estimación suma la preparación del pedido y la hora límite («Estimado hoy» solo si el
            pedido entra antes de la hora límite y no hay fabricación pendiente; si no, «Alrededor
            de N días hábiles»). Estos pedidos NO generan guía de Aveonline — se despachan a mano y
            tienen su propia guía de entrega imprimible en el detalle del pedido. El encendido o
            apagado general se maneja en la lista de transportadoras de arriba.
          </p>
          <LucamsShippingSection
            initial={{
              pricePesos: lucamsPricePesos,
              cutoffHour: lucamsSettings.cutoffHour,
              zones: lucamsSettings.zones,
            }}
          />
        </section>

        {canSeeAveonlineWebhooks && (
          <AdminNotice tone="info">
            <Plug className="mr-1 inline h-4 w-4" />
            ¿Buscas los webhooks técnicos de seguimiento de Aveonline? Revísalos en{" "}
            <Link href="/admin/integraciones/aveonline" className="font-semibold underline">
              Integraciones › Aveonline →
            </Link>
          </AdminNotice>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
