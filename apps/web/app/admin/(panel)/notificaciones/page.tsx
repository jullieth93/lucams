/*
 * Admin — Centro de notificaciones (2026-08-05 — docs/PLAN_CENTRO_NOTIFICACIONES.md).
 *
 * Feed in-app de eventos del sistema: alertas que disparan (ALERT), crons que
 * fallan (CRON), cotizaciones nuevas (QUOTE) y el resumen diario (SYSTEM).
 * Reemplaza el spam de email operativo: acá queda el registro duradero con
 * estado leída/no leída; el email solo sobrevive para alertas críticas y para
 * el aviso de cotización (canal de venta). Solo SUPERADMIN (como observability).
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Clock,
  Info,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { requireRole } from "@/lib/admin-rbac-guard";
import {
  listNotifications,
  getUnreadCount,
  type NotificationType,
  type NotificationSeverity,
} from "@/features/notifications/service";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminButton,
  AdminEmpty,
} from "@/components/admin-page";
import { markReadAction, markAllReadAction } from "./actions";

export const metadata: Metadata = { title: "Notificaciones" };

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

// Icono + color por tipo (Bell como fallback defensivo: la columna es String,
// mañana puede llegar un tipo nuevo sin tocar esta pantalla).
const TYPE_META: Record<NotificationType, { label: string; Icon: LucideIcon; iconClass: string }> =
  {
    ALERT: { label: "Alerta", Icon: AlertTriangle, iconClass: "bg-amber-100 text-amber-600" },
    CRON: { label: "Cron", Icon: Clock, iconClass: "bg-brand-purple/10 text-brand-purple" },
    QUOTE: {
      label: "Cotización",
      Icon: ShoppingBag,
      iconClass: "bg-brand-turquoise/15 text-cyan-700",
    },
    SYSTEM: { label: "Sistema", Icon: Info, iconClass: "bg-slate-100 text-slate-500" },
  };
const TYPE_FALLBACK = { label: "Aviso", Icon: Bell, iconClass: "bg-slate-100 text-slate-500" };

// Badge de severidad: crítica en rosa brand, warning en ámbar, info en gris.
const SEVERITY_META: Record<NotificationSeverity, { label: string; classes: string }> = {
  critical: { label: "Crítica", classes: "bg-brand-pink/10 text-brand-pink-ink" },
  warning: { label: "Atención", classes: "bg-amber-50 text-amber-700" },
  info: { label: "Info", classes: "bg-slate-100 text-brand-muted" },
};
const SEVERITY_FALLBACK = SEVERITY_META.info;

const TYPE_FILTERS: Array<{ key: NotificationType | null; label: string }> = [
  { key: null, label: "Todos" },
  { key: "ALERT", label: "Alertas" },
  { key: "CRON", label: "Crons" },
  { key: "QUOTE", label: "Cotizaciones" },
  { key: "SYSTEM", label: "Sistema" },
];

/** Arma el href preservando el otro filtro (vista=no leídas es el default → sin param). */
function filterHref(view: "unread" | "all", type: NotificationType | null): string {
  const params = new URLSearchParams();
  if (view !== "unread") params.set("vista", view);
  if (type) params.set("tipo", type);
  const qs = params.toString();
  return qs ? `/admin/notificaciones?${qs}` : "/admin/notificaciones";
}

export default async function AdminNotificacionesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole(["SUPERADMIN"]);

  const sp = await searchParams;
  const view = pickString(sp, "vista") === "all" ? "all" : "unread";
  const typeRaw = pickString(sp, "tipo");
  const type = (["ALERT", "CRON", "QUOTE", "SYSTEM"] as const).find((t) => t === typeRaw) ?? null;

  const [notifications, unreadCount] = await Promise.all([
    listNotifications({ unreadOnly: view === "unread", type: type ?? undefined, limit: 100 }),
    getUnreadCount(),
  ]);

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Bell className="h-5 w-5" />}
        title="Notificaciones"
        subtitle="Todo lo que pasa en el sistema llega acá: alertas, crons que fallan, cotizaciones nuevas y tu resumen diario — sin llenar tu correo."
        actions={
          unreadCount > 0 ? (
            <form action={markAllReadAction}>
              <AdminButton type="submit" variant="secondary" size="sm" pendingLabel="Marcando…">
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todas como leídas ({unreadCount})
              </AdminButton>
            </form>
          ) : undefined
        }
      />
      <AdminPageBody>
        {/* Filtros: vista (No leídas/Todas) + tipo. Links RSC (mismo patrón que SortableHeader). */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {(
              [
                { key: "unread", label: "No leídas" },
                { key: "all", label: "Todas" },
              ] as const
            ).map((v) => (
              <Link
                key={v.key}
                href={filterHref(v.key, type)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  view === v.key
                    ? "bg-brand-purple text-white shadow-sm"
                    : "text-brand-purple-dark hover:bg-brand-purple/10 bg-white"
                }`}
              >
                {v.label}
                {v.key === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
              </Link>
            ))}
          </div>
          <span className="text-brand-purple/30">·</span>
          <div className="flex flex-wrap items-center gap-1">
            {TYPE_FILTERS.map((t) => (
              <Link
                key={t.label}
                href={filterHref(view, t.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  type === t.key
                    ? "bg-brand-pink text-white shadow-sm"
                    : "text-brand-purple-dark hover:bg-brand-pink/10 bg-white"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>

        {notifications.length === 0 ? (
          <AdminEmpty
            icon={<span className="text-2xl">🦝</span>}
            title={view === "unread" ? "Nada pendiente por leer" : "Sin notificaciones por ahora"}
            description={
              view === "unread"
                ? "Ya estás al día: no queda nada sin leer. Cuando algo necesite tu atención va a aparecer acá."
                : "Cuando algo necesite tu atención (una alerta, un cron que falle, una cotización nueva o tu resumen diario), va a aparecer acá — sin llenar tu correo."
            }
          />
        ) : (
          <ul className="space-y-3">
            {notifications.map((n) => {
              const typeMeta = TYPE_META[n.type as NotificationType] ?? TYPE_FALLBACK;
              const sev = SEVERITY_META[n.severity as NotificationSeverity] ?? SEVERITY_FALLBACK;
              const unread = n.readAt === null;
              return (
                <li
                  key={n.id}
                  className={`border-brand-purple/10 rounded-xl border bg-white p-4 shadow-sm transition-colors ${
                    unread ? "border-l-brand-pink border-l-4" : "opacity-75"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${typeMeta.iconClass}`}
                    >
                      <typeMeta.Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${sev.classes}`}
                        >
                          {sev.label}
                        </span>
                        <span className="text-brand-muted text-xs">{typeMeta.label}</span>
                        <span className="text-brand-muted text-xs">
                          {dateFmt.format(n.createdAt)}
                        </span>
                      </div>
                      <p
                        className={`text-brand-purple-dark mt-1.5 text-sm ${
                          unread ? "font-bold" : "font-medium"
                        }`}
                      >
                        {n.title}
                      </p>
                      <p className="text-brand-muted mt-1 text-sm break-words whitespace-pre-line">
                        {n.detail}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {n.actionUrl && (
                          <Link
                            href={n.actionUrl}
                            className="text-brand-pink-ink hover:bg-brand-pink/10 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
                          >
                            {n.actionLabel ?? "Ver detalle"} →
                          </Link>
                        )}
                        {unread && (
                          <form action={markReadAction}>
                            <input type="hidden" name="id" value={n.id} />
                            <AdminButton type="submit" variant="ghost" size="sm" pendingLabel="…">
                              <Check className="h-3.5 w-3.5" />
                              Marcar leída
                            </AdminButton>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
