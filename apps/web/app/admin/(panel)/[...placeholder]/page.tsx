/*
 * Catch-all placeholder para módulos admin todavía no implementados.
 *
 * Match: cualquier ruta bajo /admin/(panel)/* que no tenga page.tsx
 * propia. Sirve como "página en desarrollo" profesional con info
 * contextual (qué módulo es, qué hará, en qué fase llega).
 *
 * Lookup de info: busca en `apps/web/lib/admin-nav.ts` por href.
 * Si el href no está en el NAV → muestra 404 admin estándar.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Construction, ArrowLeft, Sparkles } from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminCard,
  AdminBadge,
  AdminButton,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { findNavItem } from "@/lib/admin-nav";

export const metadata: Metadata = {
  title: "En desarrollo",
  robots: { index: false, follow: false },
};

type RouteParams = Promise<{ placeholder: string[] }>;

export default async function PlaceholderPage({ params }: { params: RouteParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const { placeholder } = await params;
  const fullPath = `/admin/${placeholder.join("/")}`;
  const navInfo = findNavItem(fullPath);

  // Si no está en el NAV → 404 real (es ruta inventada, no placeholder).
  if (!navInfo) notFound();

  const { label, group } = navInfo;
  const description = navInfo.item?.description ?? navInfo.group_obj?.description;
  const badge = navInfo.item?.badge ?? navInfo.group_obj?.badge;

  // Roadmap textual según tono del badge.
  const roadmapText = (() => {
    switch (badge?.tone) {
      case "phase4":
        return "Llega en Fase 4 (post-checkout). Después de habilitar pagos reales con Wompi, esta sección tendrá datos para mostrar.";
      case "phase5":
        return "Llega en Fase 5 (gestión interna). Después de tener operación de pedidos estabilizada.";
      case "soon":
      default:
        return "Está en próxima sub-fase del aterrizaje admin. Si lo necesitas urgente, avisame y se prioriza.";
    }
  })();

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Construction className="h-5 w-5" />}
        title={
          <>
            {label}
            {badge && (
              <span className="ml-3 align-middle">
                <AdminBadge
                  tone={
                    badge.tone === "phase4" ? "amber" : badge.tone === "phase5" ? "blue" : "slate"
                  }
                >
                  {badge.text}
                </AdminBadge>
              </span>
            )}
          </>
        }
        subtitle="Módulo en desarrollo — aún no disponible"
        breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: group }, { label }]}
        actions={
          <AdminButton href="/admin/dashboard" variant="secondary">
            <ArrowLeft className="h-4 w-4" />
            Volver al dashboard
          </AdminButton>
        }
      />

      <AdminPageBody>
        <AdminCard className="p-8">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
            <div className="from-brand-purple/15 to-brand-pink/15 text-brand-purple mb-4 flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br sm:mr-6 sm:mb-0">
              <Sparkles className="h-8 w-8" />
            </div>

            <div className="flex-1">
              <h2 className="font-display text-brand-purple-dark text-xl font-bold">
                Estamos construyendo {label.toLowerCase()}
              </h2>

              {description && (
                <p className="text-brand-purple-dark/75 mt-2 text-sm leading-relaxed">
                  {description}
                </p>
              )}

              <div className="border-brand-purple/10 bg-brand-purple/5 mt-5 rounded-lg border p-3">
                <p className="text-brand-purple-dark/70 text-xs font-semibold tracking-wider uppercase">
                  Cuándo estará disponible
                </p>
                <p className="text-brand-purple-dark/85 mt-1 text-sm">{roadmapText}</p>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <AdminButton href="/admin/dashboard" variant="secondary" size="sm">
                  Ir al dashboard
                </AdminButton>
                <Link
                  href="/admin/auditoria"
                  className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm font-semibold transition-colors"
                >
                  Ver auditoría
                </Link>
              </div>
            </div>
          </div>
        </AdminCard>
      </AdminPageBody>
    </AdminPage>
  );
}
