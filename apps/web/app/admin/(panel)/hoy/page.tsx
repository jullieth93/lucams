/*
 * Admin > Bandeja Hoy (`/admin/hoy`) — Centro operativo diario por rol (`Fase 11 · S23`).
 *
 * Responde en una sola vista:
 *   - ¿Qué está vencido o en riesgo de SLA legal hoy?
 *   - ¿Qué tareas o casos tengo asignados?
 *   - ¿Qué pedidos o diseños están bloqueados esperando acción humana?
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  HeartPulse,
  LayoutDashboard,
  Scale,
  UserCheck,
} from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminSegmentedBar,
} from "@/components/admin-page";
import { requireCapability } from "@/lib/admin-rbac-guard";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import { getTodayOperationalInbox } from "@/features/crm/today-inbox-service";
import { TodayInboxBoard } from "./today-inbox-board";
import { FiscalWatchCard } from "./fiscal-watch-card";

export const metadata: Metadata = {
  title: "Bandeja Hoy",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminHoyPage() {
  const session = await requireCapability("dashboard:read");
  const inbox = await getTodayOperationalInbox({
    id: session.admin.id,
    role: session.admin.role,
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<HeartPulse className="h-5 w-5" />}
        title="Bandeja Hoy"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>Prioridades accionables filtradas para tu rol operativo</span>
            {inbox.piiMasked && (
              <AdminBadge tone="slate">Vista operativa con PII protegida</AdminBadge>
            )}
          </span>
        }
        breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Bandeja Hoy" }]}
        actions={
          <Link
            href="/admin/dashboard"
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-11 items-center gap-1.5 rounded-xl border bg-white px-3.5 py-2 text-sm font-semibold transition-colors"
          >
            <LayoutDashboard className="h-4 w-4" />
            Panorama general
          </Link>
        }
      />

      <AdminPageBody>
        {/* Resumen ejecutivo de carga operativa del día */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <ClipboardCheck className="text-brand-purple h-4 w-4" />
              Pendientes activos
            </div>
            <div className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
              {inbox.counts.total}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              Acciones operativas abiertas para tu perfil
            </p>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              Vencidos o críticos
            </div>
            <div
              className={`font-display mt-1 text-2xl font-bold tabular-nums ${
                inbox.counts.overdueOrCritical > 0 ? "text-rose-700" : "text-emerald-700"
              }`}
            >
              {inbox.counts.overdueOrCritical}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              {inbox.counts.overdueOrCritical > 0
                ? "Atiende estos primero para proteger SLA y despacho"
                : "Cero vencimientos ni bloqueos críticos"}
            </p>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <UserCheck className="h-4 w-4 text-teal-600" />
              Asignados a ti
            </div>
            <div className="text-brand-purple font-display mt-1 text-2xl font-bold tabular-nums">
              {inbox.counts.assignedToMe}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              Tareas y casos bajo tu responsabilidad directa
            </p>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
              <Scale className="h-4 w-4 text-amber-600" />
              Posventa con SLA legal
            </div>
            <div className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
              {inbox.counts.byCategory.CARE_SLA}
            </div>
            <p className="text-brand-muted mt-1 text-xs">
              Retractos (15d cal.), garantías (15d háb.) y soporte
            </p>
          </AdminCard>
        </div>

        {/* Vigilancia fiscal (ADR-196): solo visible para roles con acceso a
            Métricas y SOLO cuando una regla DIAN está en 70 %+ o la proyección
            anuncia cruce — en rango no agrega ruido a la bandeja. */}
        {canAccessAdminPath(session.admin.role, "/admin/metricas") && <FiscalWatchCard />}

        {/* Distribución visual de la carga por frente operativo */}
        <AdminCard className="p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-brand-purple-dark text-xs font-bold tracking-wide uppercase">
              Composición de carga operativa por carril
            </h2>
            <span className="text-brand-muted text-xs tabular-nums">
              {inbox.counts.total} caso{inbox.counts.total === 1 ? "" : "s"} activo
              {inbox.counts.total === 1 ? "" : "s"}
            </span>
          </div>
          <AdminSegmentedBar
            ariaLabel="Distribución de pendientes activos por carril operativo"
            items={[
              {
                key: "CARE_SLA",
                label: "Posventa SLA",
                count: inbox.counts.byCategory.CARE_SLA,
                tone: "rose",
              },
              {
                key: "WORKSHOP",
                label: "Taller y despacho",
                count: inbox.counts.byCategory.WORKSHOP,
                tone: "purple",
              },
              {
                key: "FINANCE",
                label: "Finanzas y conciliación",
                count: inbox.counts.byCategory.FINANCE,
                tone: "amber",
              },
              {
                key: "TASK",
                label: "Tareas CRM",
                count: inbox.counts.byCategory.TASK,
                tone: "turquoise",
              },
              {
                key: "RECOVERY",
                label: "Recuperación comercial",
                count: inbox.counts.byCategory.RECOVERY,
                tone: "pink",
              },
            ]}
          />
        </AdminCard>

        <TodayInboxBoard items={inbox.items} counts={inbox.counts} />
      </AdminPageBody>
    </AdminPage>
  );
}
