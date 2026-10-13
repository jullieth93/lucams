/*
 * Admin > Fidelización (2026-10-12) — casa de la configuración de los dos
 * programas de lealtad:
 *
 *   1. Puntos Lucams: acumulación (1 punto por cada $X COP pagados al
 *      confirmarse el pago), redención en el checkout (N puntos = $1.000 de
 *      descuento, con mínimo y tope % del subtotal tras cupón) y el toggle del
 *      programa. La expiración queda PREPARADA pero sin efecto (no hay proceso
 *      que venza puntos todavía).
 *   2. Invita y gana (referidos): % OFF y días de vigencia de los cupones
 *      personales (bienvenida del referido + premio del referente) + toggle.
 *
 * Los valores viven en settings CmsField kind SETTING (features/loyalty/
 * settings.ts, mismo patrón que /admin/envios): save = publish y la action
 * invalida el tag "cms" para que el storefront vea el cambio al instante.
 *
 * REGLA DE NEGOCIO (visible en la UI): los cupones de referidos YA EMITIDOS
 * conservan sus términos (cada Coupon persiste su value/validTo) — un cambio
 * de % o de días aplica SOLO a emisiones futuras. No hay vigencias por fecha
 * en el patrón de settings: la promo del 25% se opera cambiando el % a mano y
 * revirtiéndolo al cerrar la campaña.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Award, Sparkles, Gift } from "lucide-react";
import { AdminPage, AdminPageHeader, AdminPageBody, AdminNotice } from "@/components/admin-page";
import { isCatalogMode } from "@/lib/store-mode";
import { requireRole } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { getLoyaltySettings, getReferralSettings } from "@/features/loyalty/settings";
import { LoyaltySection } from "./loyalty-section";
import { ReferralsSection } from "./referrals-section";

export const metadata: Metadata = { title: "Fidelización" };
export const dynamic = "force-dynamic";

export default async function FidelizacionAdminPage() {
  // Config con impacto económico directo (descuentos y puntos = plata): SUPERADMIN,
  // alineado con las actions de la página y con la ruta en lib/admin-rbac.ts
  // (misma barra que Cupones).
  await requireRole(ADMIN_ROLE_SETS.SUPER);
  // Modo catálogo (Etapa 1): no hay pagos en línea — los puntos se ganan al
  // pagar y se redimen en el checkout; nada que configurar acá todavía.
  if (isCatalogMode()) redirect("/admin/dashboard");

  const [loyalty, referral] = await Promise.all([getLoyaltySettings(), getReferralSettings()]);

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Award className="h-5 w-5" />}
        title="Fidelización"
        subtitle="Puntos Lucams y programa de referidos «Invita y gana»"
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Promociones" },
          { label: "Fidelización" },
        ]}
      />

      <AdminPageBody>
        {/* Puntos Lucams */}
        <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="text-brand-purple h-4 w-4" />
            <h2 className="text-brand-purple-dark text-sm font-bold">Puntos Lucams</h2>
          </div>
          <p className="text-brand-muted mb-3 text-xs">
            El cliente gana puntos al confirmarse el pago de su pedido y los redime como descuento
            en el checkout (primero se aplica el cupón, si hay, y luego los puntos sobre el restante
            del subtotal de productos; el envío nunca se paga con puntos). Los puntos se reservan al
            crear el pedido y se devuelven automáticamente si se cancela o se reembolsa. Los puntos
            ya acumulados por los clientes NO cambian si editas las tasas — la nueva config aplica a
            compras y redenciones futuras.
          </p>
          <LoyaltySection initial={loyalty} />
        </section>

        {/* Invita y gana */}
        <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Gift className="text-brand-purple h-4 w-4" />
            <h2 className="text-brand-purple-dark text-sm font-bold">Invita y gana (referidos)</h2>
          </div>
          <p className="text-brand-muted mb-3 text-xs">
            % OFF y vigencia de los cupones personales del programa: el de bienvenida del referido
            (al registrarse) y el premio del referente (cuando el referido paga su primera compra).
            Los cupones <strong>ya emitidos conservan sus condiciones originales</strong> — el nuevo
            % aplica solo a los cupones que se emitan desde el guardado. Si apagas el programa, el
            registro sigue aceptando códigos pero no se emiten cupones (las referencias pendientes
            quedan en espera).
          </p>
          <ReferralsSection initial={referral} />
        </section>

        <AdminNotice tone="info">
          La expiración de puntos está preparada en la configuración pero{" "}
          <strong>sin efecto</strong>: todavía no existe el proceso que los vence. Cuando se
          implemente, los campos de expiración de arriba quedarán operativos sin cambios
          adicionales.
        </AdminNotice>
      </AdminPageBody>
    </AdminPage>
  );
}
