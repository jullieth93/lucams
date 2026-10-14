/*
 * Admin > Carritos abandonados > Configuración (Fase 4, 2026-10-13).
 *
 * Casa de la config del módulo de recuperación: habilitar/apagar (kill-switch),
 * modo manual/automático, horas de inactividad, máximo de recordatorios por
 * carrito e intervalo entre ellos. Los valores viven en settings CmsField kind
 * SETTING (features/cart/recovery-settings.ts, mismo patrón que /admin/envios
 * y /admin/fidelizacion): save = publish y la action invalida el tag "cms"
 * para que el cron (/api/cron/cart-recovery) y el envío manual la vean al
 * instante.
 *
 * SUPERADMIN — habilitar el envío de correos comerciales y sus ritmos es
 * decisión sensible: misma barra que la ruta en lib/admin-rbac.ts
 * (/admin/carritos/configuracion) y que /admin/email-templates.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { AdminNotice, AdminPage, AdminPageBody, AdminPageHeader } from "@/components/admin-page";
import { requireRole } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { getCartRecoverySettings } from "@/features/cart/recovery-settings";
import { ConfigSection } from "./config-section";

export const metadata: Metadata = { title: "Configuración · Carritos abandonados" };
export const dynamic = "force-dynamic";

export default async function CarritosConfiguracionPage() {
  // SUPERADMIN, alineado con la action de la página y con la ruta en
  // lib/admin-rbac.ts (subprefix /admin/carritos/configuracion).
  await requireRole(ADMIN_ROLE_SETS.SUPER);

  const settings = await getCartRecoverySettings();

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Settings className="h-5 w-5" />}
        title="Configuración · Carritos abandonados"
        subtitle="Habilita el módulo y decide si los recordatorios salen solos (automático) o solo a voluntad (manual)."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Marketing" },
          { label: "Carritos abandonados", href: "/admin/carritos" },
          { label: "Configuración" },
        ]}
      />

      <AdminPageBody>
        <Link
          href="/admin/carritos"
          className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-xs font-semibold"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a la bandeja
        </Link>

        <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-brand-muted mb-4 text-xs">
            El cron de recuperación corre periódicamente siempre; acá decides qué hace en cada
            corrida. Con el módulo <strong>apagado</strong> no se envía nada (ni automático ni
            manual). En modo <strong>manual</strong> el cron no envía: los recordatorios salen solo
            cuando los lanzas desde la bandeja. En modo <strong>automático</strong> el cron aplica
            los ritmos de abajo. Los cambios aplican desde la próxima corrida / el próximo envío —
            no reenvían nada retroactivamente.
          </p>
          <ConfigSection initial={settings} />
        </section>

        <AdminNotice tone="info">
          El texto del correo (asunto, titular, botón) se edita aparte en{" "}
          <Link href="/admin/email-templates/cart-recovery" className="font-semibold underline">
            Plantillas de correo › Recuperación de carrito
          </Link>
          .
        </AdminNotice>
      </AdminPageBody>
    </AdminPage>
  );
}
