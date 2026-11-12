/*
 * /admin/auditoria — Centro forense de auditoría y eventos de seguridad (SUPERADMIN / audit:read).
 *
 * Vistas integradas:
 *   - vista=equipo (default): tabla paginada + pulso 14 días de `AdminActionLog`,
 *     con presets de cumplimiento, fechas en `America/Bogota` (-05:00) y deep-links
 *     directos a cada entidad del panel.
 *   - vista=seguridad: tabla paginada + pulso 14 días de `SecurityEvent`
 *     (intentos fallidos de login admin/cliente y firmas inválidas de webhook,
 *     agregados con `count` y correlación por `ipHash` sin exponer IP en claro).
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/admin-rbac-guard";
import { SECURITY_EVENT } from "@/lib/security-events";
import { formatDateTimeCO, formatDayMonthCO, formatIsoDateCO } from "@/lib/datetime";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminComboBarLineChart,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  type ComboChartDatum,
} from "@/components/admin-page";
import { CountUp } from "@/components/admin/count-up";

export const metadata: Metadata = {
  title: "Auditoría y seguridad",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;
const CHART_DAYS = 14;

type AuditView = "equipo" | "seguridad";
type AuditPresetKey = "all" | "pii" | "finance" | "staff" | "crm";

const AUDIT_PRESETS: ReadonlyArray<{
  key: AuditPresetKey;
  label: string;
  description: string;
  prefixes: readonly string[];
}> = [
  {
    key: "all",
    label: "Todos",
    description: "Todas las acciones administrativas registradas.",
    prefixes: [],
  },
  {
    key: "pii",
    label: "Accesos y exportaciones PII",
    description:
      "Vistas de Contacto 360, hojas de taller, impresión de guías, descargas ZIP 300 DPI y exportaciones CSV.",
    prefixes: [
      "contact.view_360",
      "quote.production_sheet_view",
      "order.print_shipping_guide",
      "order.design_zip_download",
      "newsletter.export_csv",
      "marketing.export_segment_csv",
      "finance.export_orders_csv",
    ],
  },
  {
    key: "finance",
    label: "Reembolsos y finanzas",
    description: "Reembolsos de pedidos, retractos, garantías, conciliación COD y costos.",
    prefixes: ["order.refund", "retract.", "warranty.", "finance.", "cod.", "cost."],
  },
  {
    key: "staff",
    label: "Usuarios, roles y MFA",
    description:
      "Altas de equipo, cambios de rol, desactivaciones, rotación de contraseña y segundo factor MFA.",
    prefixes: ["admin.", "mfa.", "security."],
  },
  {
    key: "crm",
    label: "CRM, fusiones y B2B",
    description:
      "Fusiones, descartes y reaperturas de duplicados de Contact, actividades/tareas CRM, oportunidades B2B y cotizaciones.",
    prefixes: ["contact.merge", "crm.", "opportunity.", "quote."],
  },
];

const SECURITY_EVENT_FILTERS: ReadonlyArray<{
  key: string;
  label: string;
  description: string;
}> = [
  {
    key: "all",
    label: "Todos los eventos",
    description:
      "Intentos rechazados de autenticación y firmas inválidas de webhooks agregados por minuto.",
  },
  {
    key: SECURITY_EVENT.ADMIN_LOGIN_FAIL,
    label: "Login / MFA admin fallido",
    description:
      "Credenciales inválidas en /admin/login, cuentas no-admin intentando entrar al panel, códigos de respaldo inválidos y fallos de contraseña actual.",
  },
  {
    key: SECURITY_EVENT.WEBHOOK_INVALID_SIGNATURE,
    label: "Webhooks rechazados",
    description: "Solicitudes a endpoints de webhook con firma HMAC o secreto inválido.",
  },
  {
    key: SECURITY_EVENT.LOGIN_FAIL,
    label: "Login tienda fallido",
    description: "Intentos fallidos de inicio de sesión en la tienda pública (/login).",
  },
];

const SECURITY_EVENT_LABEL: Record<string, { label: string; tone: "rose" | "amber" | "purple" }> = {
  [SECURITY_EVENT.ADMIN_LOGIN_FAIL]: { label: "Fallo acceso admin", tone: "rose" },
  [SECURITY_EVENT.WEBHOOK_INVALID_SIGNATURE]: { label: "Firma webhook inválida", tone: "amber" },
  [SECURITY_EVENT.LOGIN_FAIL]: { label: "Fallo login cliente", tone: "purple" },
};

function isAuditPresetKey(value: string | undefined): value is AuditPresetKey {
  return AUDIT_PRESETS.some((p) => p.key === value);
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Convierte `YYYY-MM-DD` del input date al instante exacto en hora Colombia (`-05:00`),
 * evitando el desfase de 5 horas que ocurría al parsear en UTC en Vercel.
 */
function parseBogotaDateBound(raw: string | undefined, endOfDay: boolean): Date | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const suffix = endOfDay ? "T23:59:59.999-05:00" : "T00:00:00.000-05:00";
  const parsed = new Date(`${raw}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function buildLastDaysWindow(days: number): {
  since: Date;
  buckets: Array<{ key: string; label: string; tickLabel: string }>;
} {
  const todayIso = formatIsoDateCO(new Date());
  const noonToday = new Date(`${todayIso}T12:00:00.000-05:00`);
  const buckets: Array<{ key: string; label: string; tickLabel: string }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(noonToday.getTime() - i * 86_400_000);
    const key = formatIsoDateCO(d);
    buckets.push({
      key,
      label: formatDayMonthCO(d),
      tickLabel: `${key.slice(8)}/${key.slice(5, 7)}`,
    });
  }
  const firstKey = buckets[0]?.key ?? todayIso;
  return {
    since: new Date(`${firstKey}T00:00:00.000-05:00`),
    buckets,
  };
}

/**
 * Conecta cada fila del `AdminActionLog` con la vista viva de la entidad en el panel.
 * Usa únicamente rutas verificadas en `app/admin/(panel)`.
 */
function resolveAuditEntityHref(
  entityType: string,
  entityId: string,
  metadata: unknown,
): string | null {
  if (!entityId) return null;
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;

  switch (entityType) {
    case "Order": {
      const orderNum =
        typeof meta?.orderNumber === "string" && meta.orderNumber.trim()
          ? meta.orderNumber.trim()
          : entityId;
      // getOrder resuelve tanto Order.number ("LCM-…") como Order.id (cuid) con OR directo.
      return `/admin/pedidos/${encodeURIComponent(orderNum)}`;
    }
    case "Product":
      return `/admin/productos/${encodeURIComponent(entityId)}`;
    case "ProductVariant":
      return "/admin/inventario";
    case "Category":
      return `/admin/categorias/${encodeURIComponent(entityId)}`;
    case "Occasion":
      return `/admin/ocasiones/${encodeURIComponent(entityId)}`;
    case "Contact":
    case "Customer":
      return `/admin/clientes/${encodeURIComponent(entityId)}`;
    case "IdentityMergeCandidate": {
      if (typeof meta?.survivorContactId === "string" && meta.survivorContactId) {
        return `/admin/clientes/${encodeURIComponent(meta.survivorContactId)}`;
      }
      if (meta?.reopened === true) {
        return "/admin/clientes/duplicados?status=PENDING";
      }
      return "/admin/clientes/duplicados?status=ALL";
    }
    case "ContactActivity":
    case "Task": {
      if (typeof meta?.opportunityId === "string" && meta.opportunityId) {
        return `/admin/oportunidades/${encodeURIComponent(meta.opportunityId)}`;
      }
      if (typeof meta?.contactId === "string" && meta.contactId) {
        return `/admin/clientes/${encodeURIComponent(meta.contactId)}`;
      }
      if (typeof meta?.supportTicketId === "string" && meta.supportTicketId) {
        return `/admin/soporte/${encodeURIComponent(meta.supportTicketId)}`;
      }
      if (typeof meta?.orderNumber === "string" && meta.orderNumber) {
        return `/admin/pedidos/${encodeURIComponent(meta.orderNumber)}`;
      }
      return null;
    }
    case "Opportunity":
      return `/admin/oportunidades/${encodeURIComponent(entityId)}`;
    case "Quote":
      return `/admin/cotizaciones/${encodeURIComponent(entityId)}`;
    case "Coupon":
      return `/admin/cupones/${encodeURIComponent(entityId)}`;
    case "SupportTicket":
      return `/admin/soporte/${encodeURIComponent(entityId)}`;
    case "WarrantyClaim":
      return "/admin/garantias";
    case "RetractRequest":
      return "/admin/retractos";
    case "Review":
      return "/admin/resenas";
    case "Design": {
      if (typeof meta?.orderNumber === "string" && meta.orderNumber.trim()) {
        return `/admin/pedidos/${encodeURIComponent(meta.orderNumber.trim())}`;
      }
      return "/admin/moderacion?vista=historial";
    }
    case "PersonalizationTemplate":
      return "/admin/plantillas";
    case "Cart":
      return `/admin/carritos/${encodeURIComponent(entityId)}`;
    case "LifecycleJourney":
      return `/admin/lifecycle/${encodeURIComponent(entityId)}`;
    case "EmailTemplate":
      return `/admin/email-templates/${encodeURIComponent(entityId)}`;
    case "CmsBlock":
      return `/admin/contenido/bloques/${encodeURIComponent(entityId)}`;
    case "CmsField":
      return `/admin/contenido/campos/${encodeURIComponent(entityId)}`;
    case "CmsPage":
      return "/admin/contenido";
    case "AdminUser":
      return "/admin/usuarios";
    case "Material":
      return "/admin/materiales";
    case "UrlRedirect":
    case "Redirect":
      return "/admin/redirects";
    case "Notification":
      return "/admin/notificaciones";
    case "CodBlocklist":
      return "/admin/finanzas/bloqueos";
    case "ShippingZone":
    case "CarrierConfig":
      return "/admin/envios";
    case "WholesaleTier":
      return "/admin/mayorista";
    case "Setting":
      if (entityId === "loyalty" || entityId === "referrals") {
        return "/admin/fidelizacion";
      }
      return "/admin/contenido/paginas/global";
    default:
      return null;
  }
}

export default async function AuditoriaPage({ searchParams }: { searchParams: SearchParams }) {
  await requireCapability("audit:read");

  const sp = await searchParams;
  const viewRaw = pickString(sp, "vista");
  const view: AuditView = viewRaw === "seguridad" ? "seguridad" : "equipo";
  const fromDate = pickString(sp, "from");
  const toDate = pickString(sp, "to");
  const fromBound = parseBogotaDateBound(fromDate, false);
  const toBound = parseBogotaDateBound(toDate, true);
  const page = Math.max(1, Number.parseInt(pickString(sp, "page") ?? "1", 10) || 1);

  const window14d = buildLastDaysWindow(CHART_DAYS);

  const [admins, totalTeamActions14d, securitySum14d] = await Promise.all([
    prisma.adminUser.findMany({
      where: { deletedAt: null },
      orderBy: { email: "asc" },
      select: { id: true, email: true },
    }),
    prisma.adminActionLog.count({
      where: { createdAt: { gte: window14d.since } },
    }),
    prisma.securityEvent.aggregate({
      where: { createdAt: { gte: window14d.since } },
      _sum: { count: true },
    }),
  ]);

  const adminMap = new Map(admins.map((a) => [a.id, a.email]));
  const totalSec14d = securitySum14d._sum.count ?? 0;

  if (view === "seguridad") {
    const filterSecEventRaw = pickString(sp, "evento");
    const filterSecEvent = SECURITY_EVENT_FILTERS.some(
      (f) => f.key !== "all" && f.key === filterSecEventRaw,
    )
      ? filterSecEventRaw!
      : "all";
    const activeSecPreset =
      SECURITY_EVENT_FILTERS.find((f) => f.key === filterSecEvent) ?? SECURITY_EVENT_FILTERS[0]!;
    const filterIpHash = pickString(sp, "ip")?.trim();

    const secWhere: Prisma.SecurityEventWhereInput = {
      ...(filterSecEvent !== "all" ? { event: filterSecEvent } : {}),
      ...(filterIpHash ? { ipHash: { startsWith: filterIpHash } } : {}),
      ...(fromBound || toBound
        ? {
            createdAt: {
              ...(fromBound ? { gte: fromBound } : {}),
              ...(toBound ? { lte: toBound } : {}),
            },
          }
        : {}),
    };

    const [
      secTotalRows,
      secFilteredAgg,
      secRows,
      secSeriesRows,
      adminFails14dAgg,
      webhookFails14dAgg,
    ] = await Promise.all([
      prisma.securityEvent.count({ where: secWhere }),
      prisma.securityEvent.aggregate({ where: secWhere, _sum: { count: true } }),
      prisma.securityEvent.findMany({
        where: secWhere,
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.securityEvent.findMany({
        where: {
          ...(filterSecEvent !== "all" ? { event: filterSecEvent } : {}),
          ...(filterIpHash ? { ipHash: { startsWith: filterIpHash } } : {}),
          createdAt: { gte: window14d.since },
        },
        select: { createdAt: true, count: true, ipHash: true },
      }),
      prisma.securityEvent.aggregate({
        where: {
          event: SECURITY_EVENT.ADMIN_LOGIN_FAIL,
          createdAt: { gte: window14d.since },
        },
        _sum: { count: true },
      }),
      prisma.securityEvent.aggregate({
        where: {
          event: SECURITY_EVENT.WEBHOOK_INVALID_SIGNATURE,
          createdAt: { gte: window14d.since },
        },
        _sum: { count: true },
      }),
    ]);

    const secTotalPages = Math.max(1, Math.ceil(secTotalRows / PAGE_SIZE));
    const secTotalOccurrences = secFilteredAgg._sum.count ?? 0;
    const adminFails14d = adminFails14dAgg._sum.count ?? 0;
    const webhookFails14d = webhookFails14dAgg._sum.count ?? 0;

    const countsByDay = new Map<string, number>();
    const ipsByDay = new Map<string, Set<string>>();
    for (const r of secSeriesRows) {
      const k = formatIsoDateCO(r.createdAt);
      countsByDay.set(k, (countsByDay.get(k) ?? 0) + r.count);
      if (r.ipHash) {
        const set = ipsByDay.get(k) ?? new Set<string>();
        set.add(r.ipHash);
        ipsByDay.set(k, set);
      }
    }

    const secChartData: ComboChartDatum[] = window14d.buckets.map((b) => {
      const occurrences = countsByDay.get(b.key) ?? 0;
      const uniqueIps = ipsByDay.get(b.key)?.size ?? 0;
      return {
        key: b.key,
        label: b.label,
        tickLabel: b.tickLabel,
        barValue: occurrences,
        barFormatted: `${occurrences.toLocaleString("es-CO")} ${occurrences === 1 ? "intento" : "intentos"}`,
        lineValue: uniqueIps,
        lineFormatted: `${uniqueIps} ${uniqueIps === 1 ? "origen IP" : "orígenes IP"}`,
      };
    });

    return (
      <AdminPage>
        <AdminPageHeader
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Auditoría y seguridad"
          subtitle={
            <>
              Rastro forense de eventos de seguridad rechazados y firmas inválidas (hora Colombia).
            </>
          }
          breadcrumbs={[
            { label: "Admin", href: "/admin" },
            { label: "Analítica" },
            { label: "Auditoría" },
          ]}
          actions={
            <>
              <AdminButton href="/admin/usuarios" variant="ghost" size="sm">
                <UserPlus className="h-3.5 w-3.5" />
                Usuarios
              </AdminButton>
              <AdminButton href="/admin/observability" variant="secondary" size="sm">
                <HeartPulse className="h-3.5 w-3.5" />
                Salud técnica
              </AdminButton>
            </>
          }
        />

        <AdminPageBody>
          <AuditViewTabs
            activeView="seguridad"
            teamCount14d={totalTeamActions14d}
            secCount14d={totalSec14d}
          />

          {/* KPIs de eventos de seguridad */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <AdminCard className="p-5">
              <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                Ocurrencias en vista
              </p>
              <p className="text-brand-purple-dark font-display mt-1.5 text-3xl font-bold tabular-nums">
                <CountUp value={secTotalOccurrences} />
              </p>
              <p className="mt-2 text-xs text-slate-600">
                Agrupadas en {secTotalRows.toLocaleString("es-CO")}{" "}
                {secTotalRows === 1 ? "ventana" : "ventanas"} anti-amplificación.
              </p>
            </AdminCard>

            <AdminCard className="p-5">
              <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                Fallos acceso admin (14 días)
              </p>
              <p
                className={`font-display mt-1.5 text-3xl font-bold tabular-nums ${
                  adminFails14d > 0 ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                <CountUp value={adminFails14d} />
              </p>
              <p className="mt-2 text-xs text-slate-600">
                Login admin, no-admins bloqueados y códigos MFA de respaldo rechazados.
              </p>
            </AdminCard>

            <AdminCard className="p-5">
              <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                Webhooks rechazados (14 días)
              </p>
              <p
                className={`font-display mt-1.5 text-3xl font-bold tabular-nums ${
                  webhookFails14d > 0 ? "text-amber-600" : "text-emerald-600"
                }`}
              >
                <CountUp value={webhookFails14d} />
              </p>
              <p className="mt-2 text-xs text-slate-600">
                Solicitudes descartadas por firma criptográfica o secreto inválido.
              </p>
            </AdminCard>
          </div>

          {/* Pulso visual 14 días */}
          <AdminCard className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-brand-purple-dark font-display text-base font-bold">
                  Pulso de intentos bloqueados (últimos 14 días · hora Colombia)
                </h2>
                <p className="text-brand-muted text-xs">
                  Correlación diaria entre volumen de intentos rechazados y orígenes distintos (hash
                  SHA-256 truncado, sin almacenar IP en claro).
                </p>
              </div>
            </div>
            <AdminComboBarLineChart
              data={secChartData}
              ariaLabel="Intentos de seguridad rechazados en los últimos 14 días"
              barLegend="Intentos rechazados"
              lineLegend="Orígenes IP únicos"
            />
          </AdminCard>

          {/* Presets de tipo de evento */}
          <div className="border-brand-purple/10 rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <ShieldAlert className="text-brand-purple h-4 w-4" />
              <span className="text-brand-purple-dark text-xs font-bold tracking-wide uppercase">
                Tipo de evento de seguridad
              </span>
            </div>
            <div className="flex flex-wrap gap-2" role="navigation" aria-label="Tipo de evento">
              {SECURITY_EVENT_FILTERS.map((item) => {
                const isSelected = item.key === filterSecEvent;
                const nextParams = new URLSearchParams(buildParamsObject(sp));
                nextParams.set("vista", "seguridad");
                nextParams.delete("page");
                if (item.key === "all") {
                  nextParams.delete("evento");
                } else {
                  nextParams.set("evento", item.key);
                }
                return (
                  <Link
                    key={item.key}
                    href={`/admin/auditoria?${nextParams.toString()}`}
                    aria-current={isSelected ? "page" : undefined}
                    className={
                      isSelected
                        ? "bg-brand-purple inline-flex min-h-9 items-center rounded-full px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors"
                        : "border-brand-purple/20 text-brand-purple-dark hover:border-brand-purple/50 hover:bg-brand-purple/5 inline-flex min-h-9 items-center rounded-full border bg-white px-3.5 py-1.5 text-xs font-semibold transition-colors"
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <p className="text-brand-muted mt-2 text-xs">{activeSecPreset.description}</p>
          </div>

          {/* Filtros de fecha y hash IP */}
          <form
            method="GET"
            className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
          >
            <input type="hidden" name="vista" value="seguridad" />
            {filterSecEvent !== "all" && (
              <input type="hidden" name="evento" value={filterSecEvent} />
            )}
            <div>
              <label
                htmlFor="f-ip"
                className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
              >
                Hash de origen (IP)
              </label>
              <input
                id="f-ip"
                name="ip"
                defaultValue={filterIpHash ?? ""}
                placeholder="ej. a4f91c…"
                className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2.5 py-1.5 font-mono text-sm focus:ring-2 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="f-sec-from"
                className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
              >
                Desde (hora CO)
              </label>
              <input
                id="f-sec-from"
                name="from"
                type="date"
                defaultValue={fromDate ?? ""}
                className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="f-sec-to"
                className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
              >
                Hasta (hora CO)
              </label>
              <input
                id="f-sec-to"
                name="to"
                type="date"
                defaultValue={toDate ?? ""}
                className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
              />
            </div>
            <div className="flex items-end gap-2">
              <AdminButton type="submit" variant="primary" size="sm">
                Aplicar filtros
              </AdminButton>
              <Link
                href="/admin/auditoria?vista=seguridad"
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar
              </Link>
            </div>
          </form>

          {/* Tabla forense SecurityEvent */}
          <AdminCard className="overflow-x-auto p-0">
            <AdminTable className="border-0 shadow-none" minWidth={820}>
              <AdminTableHead>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Cuándo (CO)</th>
                  <th className="px-4 py-3 text-left font-semibold">Evento</th>
                  <th className="px-4 py-3 text-left font-semibold">Resultado</th>
                  <th className="px-4 py-3 text-left font-semibold">Ocurrencias</th>
                  <th className="px-4 py-3 text-left font-semibold">Origen (hash IP)</th>
                  <th className="px-4 py-3 text-left font-semibold">Actor</th>
                  <th className="px-4 py-3 text-left font-semibold">Detalle</th>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {secRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-brand-muted px-4 py-10 text-center">
                      Sin eventos de seguridad rechazados para este rango.
                    </td>
                  </tr>
                ) : (
                  secRows.map((row) => {
                    const evMeta = SECURITY_EVENT_LABEL[row.event];
                    const knownAdminEmail = row.actorId ? adminMap.get(row.actorId) : undefined;
                    return (
                      <AdminTableRow key={row.id}>
                        <td className="text-brand-purple-dark/75 px-4 py-2.5 text-xs whitespace-nowrap">
                          {formatDateTimeCO(row.createdAt)}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <div className="flex flex-col items-start gap-0.5">
                            <AdminBadge tone={evMeta?.tone ?? "slate"}>
                              {evMeta?.label ?? row.event}
                            </AdminBadge>
                            <span className="font-mono text-[10px] text-slate-400">
                              {row.event}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <AdminBadge tone={row.outcome === "rejected" ? "amber" : "rose"}>
                            {row.outcome === "rejected" ? "Firma rechazada" : "Auth fallida"}
                          </AdminBadge>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-bold tabular-nums">
                          <span
                            className={
                              row.count >= 5
                                ? "rounded-full bg-rose-50 px-2 py-0.5 text-rose-700"
                                : "text-brand-purple-dark"
                            }
                          >
                            {row.count.toLocaleString("es-CO")}×
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">
                          {row.ipHash ? (
                            <Link
                              href={`/admin/auditoria?vista=seguridad&ip=${encodeURIComponent(row.ipHash)}`}
                              title="Filtrar campaña por este origen"
                              className="text-brand-purple hover:text-brand-purple-dark hover:underline"
                            >
                              {row.ipHash}
                            </Link>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {knownAdminEmail && row.actorId ? (
                            <Link
                              href={`/admin/auditoria?admin=${encodeURIComponent(row.actorId)}`}
                              className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-0.5 font-medium hover:underline"
                            >
                              {knownAdminEmail}
                              <ArrowUpRight className="h-3 w-3" />
                            </Link>
                          ) : row.actorId ? (
                            <span className="font-mono text-slate-500">
                              {row.actorId.slice(0, 8)}
                            </span>
                          ) : (
                            <span className="text-slate-400">Anónimo</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {Object.keys((row.metadata as Record<string, unknown>) ?? {}).length >
                          0 ? (
                            <details className="cursor-pointer">
                              <summary className="text-brand-muted hover:text-brand-purple-dark">
                                {
                                  Object.keys((row.metadata as Record<string, unknown>) ?? {})
                                    .length
                                }{" "}
                                campos
                              </summary>
                              <pre className="bg-brand-purple/5 mt-1 max-w-md overflow-x-auto rounded p-2 text-[10px] leading-tight">
                                {JSON.stringify(row.metadata, null, 2)}
                              </pre>
                            </details>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </AdminTableRow>
                    );
                  })
                )}
              </AdminTableBody>
            </AdminTable>
          </AdminCard>

          {secTotalPages > 1 && <AuditPagination sp={sp} page={page} totalPages={secTotalPages} />}
        </AdminPageBody>
      </AdminPage>
    );
  }

  // ── Vista default: Acciones del equipo (AdminActionLog) ───────────────────

  const presetRaw = pickString(sp, "preset");
  const preset: AuditPresetKey = isAuditPresetKey(presetRaw) ? presetRaw : "all";
  const activePreset = AUDIT_PRESETS.find((p) => p.key === preset) ?? AUDIT_PRESETS[0]!;
  const filterAdmin = pickString(sp, "admin");
  const filterAction = pickString(sp, "action")?.trim();
  const filterEntity = pickString(sp, "entity")?.trim();

  const andConditions: Prisma.AdminActionLogWhereInput[] = [];
  if (activePreset.prefixes.length > 0) {
    andConditions.push({
      OR: activePreset.prefixes.map((prefix) => ({
        action: { startsWith: prefix },
      })),
    });
  }
  if (filterAction) {
    andConditions.push({ action: { startsWith: filterAction } });
  }

  const where: Prisma.AdminActionLogWhereInput = {
    ...(filterAdmin ? { actorId: filterAdmin } : {}),
    ...(filterEntity ? { entityType: filterEntity } : {}),
    ...(andConditions.length > 0 ? { AND: andConditions } : {}),
    ...(fromBound || toBound
      ? {
          createdAt: {
            ...(fromBound ? { gte: fromBound } : {}),
            ...(toBound ? { lte: toBound } : {}),
          },
        }
      : {}),
  };

  const chartWhere: Prisma.AdminActionLogWhereInput = {
    ...(filterAdmin ? { actorId: filterAdmin } : {}),
    ...(filterEntity ? { entityType: filterEntity } : {}),
    ...(andConditions.length > 0 ? { AND: andConditions } : {}),
    createdAt: { gte: window14d.since },
  };

  const [total, logs, seriesRows, selfDealingCount14d] = await Promise.all([
    prisma.adminActionLog.count({ where }),
    prisma.adminActionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.adminActionLog.findMany({
      where: chartWhere,
      select: { createdAt: true, actorId: true, action: true },
    }),
    prisma.adminActionLog.count({
      where: {
        createdAt: { gte: window14d.since },
        metadata: { path: ["selfDealing"], equals: true },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const actionsByDay = new Map<string, number>();
  const sensitiveByDay = new Map<string, number>();
  const activeActors14d = new Set<string>();
  for (const r of seriesRows) {
    activeActors14d.add(r.actorId);
    const k = formatIsoDateCO(r.createdAt);
    actionsByDay.set(k, (actionsByDay.get(k) ?? 0) + 1);
    if (
      r.action.startsWith("admin.") ||
      r.action.startsWith("mfa.") ||
      r.action.startsWith("order.refund") ||
      r.action.includes("export")
    ) {
      sensitiveByDay.set(k, (sensitiveByDay.get(k) ?? 0) + 1);
    }
  }

  const teamChartData: ComboChartDatum[] = window14d.buckets.map((b) => {
    const count = actionsByDay.get(b.key) ?? 0;
    const sensitive = sensitiveByDay.get(b.key) ?? 0;
    return {
      key: b.key,
      label: b.label,
      tickLabel: b.tickLabel,
      barValue: count,
      barFormatted: `${count.toLocaleString("es-CO")} ${count === 1 ? "acción" : "acciones"}`,
      lineValue: sensitive,
      lineFormatted: `${sensitive} sensibles (equipo/MFA/finanzas/export)`,
    };
  });

  const filteredAdminEmail = filterAdmin ? adminMap.get(filterAdmin) : undefined;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Activity className="h-5 w-5" />}
        title="Auditoría y seguridad"
        subtitle={
          <>
            Registro inmutable de acciones administrativas y postura forense.{" "}
            <strong className="text-brand-purple">{total.toLocaleString("es-CO")}</strong>{" "}
            {total === 1 ? "evento en vista" : "eventos en vista"}
            {filteredAdminEmail ? ` · filtrado por ${filteredAdminEmail}` : ""}.
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Analítica" },
          { label: "Auditoría" },
        ]}
        actions={
          <>
            <AdminButton href="/admin/usuarios" variant="ghost" size="sm">
              <UserPlus className="h-3.5 w-3.5" />
              Usuarios
            </AdminButton>
            <AdminButton href="/admin/observability" variant="secondary" size="sm">
              <HeartPulse className="h-3.5 w-3.5" />
              Salud técnica
            </AdminButton>
          </>
        }
      />

      <AdminPageBody>
        <AuditViewTabs
          activeView="equipo"
          teamCount14d={totalTeamActions14d}
          secCount14d={totalSec14d}
        />

        {/* KPIs rápidos */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <AdminCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                  Eventos en consulta
                </p>
                <p className="text-brand-purple-dark font-display mt-1.5 text-3xl font-bold tabular-nums">
                  <CountUp value={total} />
                </p>
              </div>
              <div className="bg-brand-purple/10 text-brand-purple flex h-10 w-10 items-center justify-center rounded-xl">
                <Activity className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              {activePreset.key === "all"
                ? "Bitácora inmutable completa con fechas en hora Colombia."
                : `Vista activa: ${activePreset.label}.`}
            </p>
          </AdminCard>

          <AdminCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                  Actores activos (14 días)
                </p>
                <p className="text-brand-purple-dark font-display mt-1.5 text-3xl font-bold tabular-nums">
                  <CountUp value={activeActors14d.size} />
                </p>
              </div>
              <div className="bg-brand-turquoise/15 flex h-10 w-10 items-center justify-center rounded-xl text-cyan-700">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              {filteredAdminEmail
                ? `Mostrando actividad de ${filteredAdminEmail}.`
                : `De ${admins.length} ${admins.length === 1 ? "cuenta registrada" : "cuentas registradas"} en el equipo.`}
            </p>
          </AdminCard>

          <AdminCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">
                  Auto-gestión staff (14 días)
                </p>
                <p
                  className={`font-display mt-1.5 text-3xl font-bold tabular-nums ${
                    selfDealingCount14d > 0 ? "text-amber-600" : "text-emerald-600"
                  }`}
                >
                  <CountUp value={selfDealingCount14d} />
                </p>
              </div>
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  selfDealingCount14d > 0
                    ? "bg-amber-50 text-amber-600"
                    : "bg-emerald-50 text-emerald-600"
                }`}
              >
                {selfDealingCount14d > 0 ? (
                  <ShieldAlert className="h-5 w-5" />
                ) : (
                  <ShieldCheck className="h-5 w-5" />
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              {selfDealingCount14d > 0
                ? "Operaciones de un miembro sobre pedidos asociados a su propio correo."
                : "Sin operaciones de auto-gestión sobre pedidos propios."}
            </p>
          </AdminCard>
        </div>

        {/* Pulso visual de actividad 14 días */}
        <AdminCard className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-brand-purple-dark font-display text-base font-bold">
                Pulso operativo del equipo (últimos 14 días · hora Colombia)
              </h2>
              <p className="text-brand-muted text-xs">
                Volumen diario de mutaciones auditadas frente a operaciones sensibles (equipo, MFA,
                reembolsos y exportaciones).
              </p>
            </div>
          </div>
          <AdminComboBarLineChart
            data={teamChartData}
            ariaLabel="Actividad administrativa en los últimos 14 días"
            barLegend="Acciones totales"
            lineLegend="Acciones sensibles"
          />
        </AdminCard>

        {/* Filtros rápidos por familia de cumplimiento */}
        <div className="border-brand-purple/10 rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <ShieldAlert className="text-brand-purple h-4 w-4" />
            <span className="text-brand-purple-dark text-xs font-bold tracking-wide uppercase">
              Vistas rápidas de cumplimiento y seguridad
            </span>
          </div>
          <div className="flex flex-wrap gap-2" role="navigation" aria-label="Filtros rápidos">
            {AUDIT_PRESETS.map((item) => {
              const isSelected = item.key === preset;
              const nextParams = new URLSearchParams(buildParamsObject(sp));
              nextParams.delete("page");
              nextParams.delete("vista");
              if (item.key === "all") {
                nextParams.delete("preset");
              } else {
                nextParams.set("preset", item.key);
              }
              const href = nextParams.toString()
                ? `/admin/auditoria?${nextParams.toString()}`
                : "/admin/auditoria";
              return (
                <Link
                  key={item.key}
                  href={href}
                  aria-current={isSelected ? "page" : undefined}
                  className={
                    isSelected
                      ? "bg-brand-purple inline-flex min-h-9 items-center rounded-full px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors"
                      : "border-brand-purple/20 text-brand-purple-dark hover:border-brand-purple/50 hover:bg-brand-purple/5 inline-flex min-h-9 items-center rounded-full border bg-white px-3.5 py-1.5 text-xs font-semibold transition-colors"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <p className="text-brand-muted mt-2 text-xs">{activePreset.description}</p>
        </div>

        {/* Filtros detallados */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
        >
          {preset !== "all" && <input type="hidden" name="preset" value={preset} />}
          <div>
            <label
              htmlFor="f-admin"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Miembro del equipo
            </label>
            <select
              id="f-admin"
              name="admin"
              defaultValue={filterAdmin ?? ""}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="">Todos</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="f-action"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Acción (prefijo)
            </label>
            <input
              id="f-action"
              name="action"
              defaultValue={filterAction ?? ""}
              placeholder="ej. admin.role_change"
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="f-entity"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Tipo de entidad
            </label>
            <input
              id="f-entity"
              name="entity"
              defaultValue={filterEntity ?? ""}
              placeholder="ej. Order, AdminUser"
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="f-from"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Desde (hora CO)
            </label>
            <input
              id="f-from"
              name="from"
              type="date"
              defaultValue={fromDate ?? ""}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="f-to"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Hasta (hora CO)
            </label>
            <input
              id="f-to"
              name="to"
              type="date"
              defaultValue={toDate ?? ""}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <AdminButton type="submit" variant="primary" size="sm">
              Aplicar filtros
            </AdminButton>
            <Link
              href="/admin/auditoria"
              className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
            >
              Limpiar
            </Link>
          </div>
        </form>

        {/* Tabla AdminActionLog con deep-links */}
        <AdminCard className="overflow-x-auto p-0">
          <AdminTable className="border-0 shadow-none" minWidth={820}>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Cuándo (CO)</th>
                <th className="px-4 py-3 text-left font-semibold">Miembro</th>
                <th className="px-4 py-3 text-left font-semibold">Acción</th>
                <th className="px-4 py-3 text-left font-semibold">Entidad</th>
                <th className="px-4 py-3 text-left font-semibold">Metadata</th>
                <th className="px-4 py-3 text-left font-semibold">IP</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-brand-muted px-4 py-10 text-center">
                    Sin eventos registrados con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                logs.map((row) => {
                  const actorEmail = adminMap.get(row.actorId);
                  const entityHref = resolveAuditEntityHref(
                    row.entityType,
                    row.entityId,
                    row.metadata,
                  );
                  const metaKeysCount = Object.keys(
                    (row.metadata as Record<string, unknown>) ?? {},
                  ).length;

                  return (
                    <AdminTableRow key={row.id}>
                      <td className="text-brand-purple-dark/75 px-4 py-2.5 text-xs whitespace-nowrap">
                        {formatDateTimeCO(row.createdAt)}
                      </td>
                      <td className="text-brand-purple-dark px-4 py-2.5 text-xs">
                        {actorEmail ? (
                          <Link
                            href={`/admin/auditoria?admin=${encodeURIComponent(row.actorId)}`}
                            title="Filtrar rastro de este miembro"
                            className="hover:text-brand-purple font-medium hover:underline"
                          >
                            {actorEmail}
                          </Link>
                        ) : (
                          <span className="text-brand-muted font-mono">
                            {row.actorId.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        <span className="bg-brand-purple/10 text-brand-purple-dark rounded px-1.5 py-0.5">
                          {row.action}
                        </span>
                        {(row.metadata as Record<string, unknown> | null)?.selfDealing === true && (
                          <span className="ml-1.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-sans text-[10px] font-bold text-amber-800">
                            auto-gestión staff
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {entityHref ? (
                          <Link
                            href={entityHref}
                            className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 font-medium hover:underline"
                          >
                            <span>{row.entityType}</span>
                            <span className="font-mono text-[11px] opacity-75">
                              {row.entityId.slice(0, 8)}
                            </span>
                            <ArrowUpRight className="h-3 w-3 flex-shrink-0" />
                          </Link>
                        ) : (
                          <>
                            <span className="text-brand-purple-dark/85">{row.entityType}</span>
                            <span className="text-brand-muted ml-1 font-mono">
                              {row.entityId.slice(0, 8)}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {metaKeysCount > 0 ? (
                          <details className="cursor-pointer">
                            <summary className="text-brand-muted hover:text-brand-purple-dark">
                              {metaKeysCount} {metaKeysCount === 1 ? "campo" : "campos"}
                            </summary>
                            <pre className="bg-brand-purple/5 mt-1 max-w-md overflow-x-auto rounded p-2 text-[10px] leading-tight">
                              {JSON.stringify(row.metadata, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="text-brand-muted px-4 py-2.5 font-mono text-xs">
                        {row.ip ?? "—"}
                      </td>
                    </AdminTableRow>
                  );
                })
              )}
            </AdminTableBody>
          </AdminTable>
        </AdminCard>

        {totalPages > 1 && <AuditPagination sp={sp} page={page} totalPages={totalPages} />}
      </AdminPageBody>
    </AdminPage>
  );
}

function AuditViewTabs({
  activeView,
  teamCount14d,
  secCount14d,
}: {
  activeView: AuditView;
  teamCount14d: number;
  secCount14d: number;
}) {
  return (
    <div
      role="navigation"
      aria-label="Fuente de auditoría"
      className="border-brand-purple/10 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-1.5 shadow-xs"
    >
      <Link
        href="/admin/auditoria"
        aria-current={activeView === "equipo" ? "page" : undefined}
        className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-all sm:flex-initial ${
          activeView === "equipo"
            ? "bg-gradient-brand text-white shadow-sm"
            : "text-brand-purple-dark hover:bg-brand-purple/5"
        }`}
      >
        <Activity className="h-4 w-4" />
        <span>Acciones del equipo</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
            activeView === "equipo"
              ? "bg-white/20 text-white"
              : "bg-brand-purple/10 text-brand-purple-dark"
          }`}
        >
          {teamCount14d.toLocaleString("es-CO")} (14 d)
        </span>
      </Link>

      <Link
        href="/admin/auditoria?vista=seguridad"
        aria-current={activeView === "seguridad" ? "page" : undefined}
        className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-all sm:flex-initial ${
          activeView === "seguridad"
            ? "bg-gradient-brand text-white shadow-sm"
            : "text-brand-purple-dark hover:bg-brand-purple/5"
        }`}
      >
        <ShieldAlert className="h-4 w-4" />
        <span>Eventos de seguridad bloqueados</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
            activeView === "seguridad"
              ? "bg-white/20 text-white"
              : secCount14d > 0
                ? "bg-rose-50 text-rose-700"
                : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {secCount14d.toLocaleString("es-CO")} (14 d)
        </span>
      </Link>
    </div>
  );
}

function AuditPagination({
  sp,
  page,
  totalPages,
}: {
  sp: Record<string, string | string[] | undefined>;
  page: number;
  totalPages: number;
}) {
  return (
    <nav className="flex items-center justify-between" aria-label="Paginación">
      <p className="text-brand-purple-dark/70 text-xs">
        Página {page} de {totalPages}
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            href={`?${new URLSearchParams({ ...buildParamsObject(sp), page: String(page - 1) }).toString()}`}
            className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold"
          >
            <ChevronLeft className="h-3 w-3" />
            Anterior
          </Link>
        )}
        {page < totalPages && (
          <Link
            href={`?${new URLSearchParams({ ...buildParamsObject(sp), page: String(page + 1) }).toString()}`}
            className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold"
          >
            Siguiente
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </nav>
  );
}

function buildParamsObject(sp: Record<string, string | string[] | undefined>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
