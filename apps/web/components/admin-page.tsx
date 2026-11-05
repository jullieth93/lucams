/*
 * Admin primitives — Componentes reutilizables del panel admin.
 *
 * Inspirados en commerce-ops-platform (Kaiu Organic) adaptados a paleta
 * brand Lucams (purple / pink / turquoise / coral / cream).
 *
 * Filosofía:
 *   - Simetría: max-w-7xl + px-6 py-8 desktop, px-4 py-6 mobile.
 *   - Cards con `card-hover` (elevación 2px + sombra brand-purple sutil).
 *   - Bordes brand-purple/10 (no slate genérico).
 *   - Tipografía Fredoka (font-display) en títulos.
 *   - Tablas con header brand-purple/5 + foreground brand-purple-dark.
 *
 * Exports:
 *   <AdminPage>             — contenedor outer (bg-cream + max-w)
 *   <AdminPageHeader>       — header con icon brand + title + subtitle + breadcrumbs + actions
 *   <AdminPageBody>         — main con space-y-6
 *   <AdminNotice>           — banner success/warning/info/error
 *   <AdminCard>             — card con border brand
 *   <AdminTable>            — wrapper para <table>
 *   <AdminBadge>            — badge con tono semántico
 *   <AdminEmpty>            — empty state con personalidad
 *   <OpsCard>               — métrica clickeable con urgent state
 *   <KpiCard>               — KPI simple con trend
 *   <QuickLink>             — card de acceso rápido (sidebar dashboard)
 */

import type { ReactNode } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  Sparkles,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  type LucideIcon,
} from "lucide-react";
import { AdminSubmitButton } from "@/components/admin-submit-button";
import { AdminTableAutoCards } from "@/components/admin-table-auto-cards";
import { CountUp } from "@/components/admin/count-up";
import { Hint } from "@/components/ui/tooltip";

// ─────────────────── Layout primitives ───────────────────

type BreadcrumbItem = { label: string; href?: string };

export function AdminPage({ children }: { children: ReactNode }) {
  // admin-fade-in: entrada suave de página (fade + rise 4px, 300ms). La clase
  // existía en globals.css desde la v3 del shell pero NINGÚN componente la
  // usaba — cableada acá la heredan todas las páginas del panel.
  return (
    <div className="admin-fade-in min-h-[calc(100vh-3.5rem)]">
      <div className="mx-auto max-w-7xl">{children}</div>
    </div>
  );
}

export function AdminPageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="border-brand-purple/10 border-b bg-white/60 backdrop-blur-sm">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 text-xs text-slate-500">
            {breadcrumbs.map((b, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1.5 text-slate-300">›</span>}
                {b.href ? (
                  <Link
                    href={b.href}
                    className="hover:text-brand-purple -my-2 inline-flex min-h-10 items-center"
                  >
                    {b.label}
                  </Link>
                ) : (
                  <span>{b.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {icon && (
              <div className="from-brand-purple via-brand-pink to-brand-coral flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ring-2 ring-white/50">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-display text-brand-purple-dark text-2xl leading-tight font-bold sm:text-3xl">
                {title}
              </h1>
              {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
        </div>
      </div>
    </header>
  );
}

export function AdminPageBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  // <div>, no <main>: el <main id="contenido"> único de la página lo renderiza
  // AdminShell — un <main> anidado es HTML inválido (a11y: dos landmarks).
  // admin-stagger: entrada escalonada de las secciones (globals.css).
  return (
    <div className={`admin-stagger space-y-6 px-4 py-6 sm:px-6 sm:py-8 ${className}`}>
      {children}
    </div>
  );
}

// ─────────────────── Notice banners ───────────────────

export function AdminNotice({
  tone,
  children,
}: {
  tone: "success" | "warning" | "info" | "error";
  children: ReactNode;
}) {
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    info: "border-brand-purple/20 bg-brand-purple/5 text-brand-purple-dark",
    error: "border-red-200 bg-red-50 text-red-700",
  };
  const emoji = { success: "🟢", warning: "🟡", info: "💡", error: "🔴" };
  return (
    <div className={`rounded-lg border px-3.5 py-2.5 text-sm ${styles[tone]}`}>
      <span className="mr-1.5">{emoji[tone]}</span>
      {children}
    </div>
  );
}

// ─────────────────── Card ───────────────────

export function AdminCard({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`border-brand-purple/10 rounded-xl border bg-white shadow-sm ${hover ? "card-hover" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

// ─────────────────── Table ───────────────────

export function AdminTable({
  children,
  className = "",
  minWidth = 640,
}: {
  children: ReactNode;
  className?: string;
  /**
   * Ancho mínimo de la tabla en px antes de activar scroll horizontal.
   * Hotfix P0-14: subir a 800 en tablas de 6+ columnas (ej. /admin/inventario)
   * donde 640px hacía las columnas muy estrechas y el editor de stock
   * se pegaba al borde.
   */
  minWidth?: number;
}) {
  return (
    <div data-admin-table="">
      <div className="relative">
        <div
          className={`admin-table-scroll border-brand-purple/10 overflow-x-auto rounded-xl border bg-white shadow-sm ${className}`}
        >
          <table className="w-full text-sm" style={{ minWidth: `${minWidth}px` }}>
            {children}
          </table>
        </div>
        {/* Indicación de scroll horizontal en móvil/tablet (roadmap E2,
            auditoría E1 P1): las tablas tienen minWidth ≥ 640 → bajo lg
            SIEMPRE hay más columnas a la derecha, pero nada lo decía.
            Degradado de borde como affordance + pista textual. Solo visible
            < lg y solo mientras no estén activas las tarjetas
            (AdminTableAutoCards — en el mismo rango <lg). */}
        <div
          aria-hidden
          className="admin-table-scroll-affordance pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-xl bg-gradient-to-l from-white to-transparent lg:hidden"
        />
      </div>
      <p
        aria-hidden
        className="admin-table-hint text-brand-muted mt-1 text-right text-[11px] italic lg:hidden"
      >
        Desliza para ver más columnas →
      </p>
      <AdminTableAutoCards />
    </div>
  );
}

export function AdminTableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-brand-purple/5 text-brand-purple-dark/70 text-xs tracking-wider uppercase">
      {children}
    </thead>
  );
}

export function AdminTableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-brand-purple/8 divide-y">{children}</tbody>;
}

export function AdminTableRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={`hover:bg-brand-purple/[0.03] transition-colors ${className}`}>{children}</tr>
  );
}

/**
 * <SortableHeader> — encabezado de columna clickeable que ordena la tabla
 * (Lucy 2026-06-27, punto #1: "más fácil con clic en la columna" en vez del
 * dropdown "Ordenar por"). RSC puro: renderiza un <th> con un <Link> que sólo
 * cambia el searchParam de orden — sin JS de cliente.
 *
 * Basado en VALORES (no en key+dir) para no romper los `sort` ad-hoc que ya
 * usan los services (ej. "price-asc", "recent", "stock-desc"). La columna sabe
 * sus valores asc/desc; al clickear alterna entre ellos y preserva los demás
 * filtros (q, status…) reseteando la paginación.
 */
export function SortableHeader({
  label,
  ascValue,
  descValue,
  currentSort,
  basePath,
  paramName = "sort",
  preserve = {},
  align = "left",
}: {
  label: string;
  /** Valor de `sort` para orden ascendente (ej. "price-asc"). */
  ascValue: string;
  /** Valor para descendente. Si se omite, la columna sólo ordena en un sentido. */
  descValue?: string;
  /** Valor actual del searchParam de orden. */
  currentSort?: string;
  basePath: string;
  paramName?: string;
  /** Otros searchParams a conservar al ordenar (q, status, categoria…). */
  preserve?: Record<string, string | undefined>;
  align?: "left" | "center" | "right";
}) {
  const isAsc = currentSort === ascValue;
  const isDesc = descValue !== undefined && currentSort === descValue;
  const isActive = isAsc || isDesc;
  // Si está asc y existe desc → siguiente click invierte; si no → asc.
  const nextValue = isAsc && descValue ? descValue : ascValue;

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(preserve)) {
    if (v) params.set(k, v);
  }
  params.set(paramName, nextValue);
  params.set("page", "1");
  const href = `${basePath}?${params.toString()}`;

  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const justifyClass =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  const Icon = isAsc ? ChevronUp : isDesc ? ChevronDown : ChevronsUpDown;

  return (
    <th
      className={`px-4 py-3 font-semibold ${alignClass}`}
      aria-sort={isAsc ? "ascending" : isDesc ? "descending" : "none"}
    >
      <Hint content={`Ordenar por ${label.toLowerCase()}`}>
        <Link
          href={href}
          className={`group hover:text-brand-purple-dark inline-flex items-center gap-1 ${justifyClass}`}
        >
          <span>{label}</span>
          <Icon
            className={`h-3.5 w-3.5 transition-colors ${
              isActive
                ? "text-brand-purple"
                : "text-brand-purple-dark/25 group-hover:text-brand-muted"
            }`}
          />
        </Link>
      </Hint>
    </th>
  );
}

// ─────────────────── Badges ───────────────────

type BadgeTone = "purple" | "emerald" | "amber" | "rose" | "blue" | "slate" | "pink" | "turquoise";

export function AdminBadge({
  tone = "purple",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  const styles: Record<BadgeTone, string> = {
    purple: "bg-brand-purple/10 text-brand-purple-dark",
    pink: "bg-brand-pink/10 text-brand-pink",
    turquoise: "bg-brand-turquoise/15 text-cyan-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    blue: "bg-blue-50 text-blue-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

// ─────────────────── Empty state ───────────────────

export function AdminEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-brand-purple/10 flex flex-col items-center rounded-xl border-2 border-dashed bg-white px-6 py-12 text-center">
      <div className="from-brand-purple/15 to-brand-pink/15 text-brand-purple mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br">
        {icon ?? <Sparkles className="h-5 w-5" />}
      </div>
      <p className="text-brand-purple-dark font-display text-lg font-semibold">{title}</p>
      {description && <p className="text-brand-muted mt-1 max-w-md text-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─────────────────── OpsCard (alerta operacional clickeable) ───────────────────

export function OpsCard({
  href,
  label,
  value,
  icon: Icon,
  description,
  tone = "purple",
  urgent = false,
}: {
  href: string;
  label: string;
  value: number | string;
  icon: LucideIcon;
  description?: string;
  tone?: "purple" | "pink" | "turquoise" | "coral" | "amber";
  urgent?: boolean;
}) {
  const colors: Record<typeof tone, { text: string; bg: string; ring: string }> = {
    purple: { text: "text-brand-purple", bg: "bg-brand-purple/10", ring: "ring-brand-purple/30" },
    pink: { text: "text-brand-pink", bg: "bg-brand-pink/10", ring: "ring-brand-pink/30" },
    turquoise: {
      text: "text-cyan-600",
      bg: "bg-brand-turquoise/15",
      ring: "ring-brand-turquoise/30",
    },
    coral: { text: "text-orange-600", bg: "bg-brand-coral/15", ring: "ring-brand-coral/30" },
    amber: { text: "text-amber-600", bg: "bg-amber-100", ring: "ring-amber-300" },
  };
  const c = colors[tone];
  return (
    <Link
      href={href}
      className={`card-hover border-brand-purple/10 group block rounded-xl border bg-white p-5 shadow-sm transition-all ${
        urgent ? `${c.bg} ${c.ring} ring-2` : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.bg}`}>
          <Icon className={`h-4 w-4 ${c.text}`} />
        </div>
        {urgent && (
          <span className="bg-brand-coral inline-flex h-2.5 w-2.5 animate-pulse rounded-full" />
        )}
      </div>
      <p className={`text-3xl font-bold tabular-nums ${c.text}`}>
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </p>
      <p className="text-brand-purple-dark mt-1 text-sm font-medium">{label}</p>
      {description && <p className="text-brand-muted text-xs">{description}</p>}
    </Link>
  );
}

// ─────────────────── KpiCard (KPI con trend) ───────────────────

export function KpiCard({
  label,
  value,
  trend = "neutral",
  trendLabel,
}: {
  label: string;
  value: number | string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up" ? "text-emerald-600" : trend === "down" ? "text-rose-600" : "text-slate-500";
  return (
    <div className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
      <p className="text-brand-muted text-xs font-semibold tracking-wider uppercase">{label}</p>
      <p className="text-brand-purple-dark font-display mt-2 text-3xl font-bold tabular-nums">
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </p>
      <p className={`mt-1.5 flex items-center gap-1 text-xs ${trendColor}`}>
        <TrendIcon className="h-3 w-3" />
        {trendLabel ?? "Total acumulado"}
      </p>
    </div>
  );
}

// ─────────────────── QuickLink (card de acceso rápido) ───────────────────

export function QuickLink({
  href,
  label,
  description,
  icon: Icon,
  badge,
}: {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: { text: string; tone: BadgeTone };
}) {
  return (
    <Link
      href={href}
      className="card-hover border-brand-purple/10 group relative block rounded-xl border bg-white p-4 shadow-sm"
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="from-brand-purple/15 to-brand-pink/15 group-hover:from-brand-purple/25 group-hover:to-brand-pink/25 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br transition-colors">
          <Icon className="text-brand-purple h-4 w-4" />
        </div>
        <ArrowRight className="text-brand-muted h-3.5 w-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
      </div>
      <p className="text-brand-purple-dark text-sm font-semibold">{label}</p>
      <p className="text-brand-muted mt-0.5 line-clamp-2 text-xs leading-snug">{description}</p>
      {badge && (
        <div className="mt-2.5">
          <AdminBadge tone={badge.tone}>{badge.text}</AdminBadge>
        </div>
      )}
    </Link>
  );
}

// ─────────────────── Button primitives ───────────────────

export function AdminButton({
  href,
  type,
  variant = "primary",
  size = "md",
  children,
  className = "",
  disabled,
  pendingLabel,
}: {
  href?: string;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  /** Texto a mostrar mientras la acción corre (solo aplica a type="submit"). */
  pendingLabel?: string;
}) {
  const sizes = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3.5 py-2 text-sm",
  };
  const variants = {
    primary:
      "bg-gradient-brand text-white shadow-md hover:shadow-lg disabled:opacity-60 hover:brightness-110",
    secondary:
      "bg-white border border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5",
    ghost: "text-brand-purple-dark hover:bg-brand-purple/8",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
  };
  const cls = `inline-flex items-center gap-1.5 rounded-md font-semibold transition-all ${sizes[size]} ${variants[variant]} ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  // Los submits delegan en la variante CLIENTE: solo ella puede leer `useFormStatus()` del form
  // ancestro y mostrar que la acción está en vuelo. Así el feedback llega gratis a todo el panel,
  // sin cablear un `loading` en cada sitio ni recordarlo en los botones que se agreguen después.
  if ((type ?? "button") === "submit") {
    return (
      <AdminSubmitButton className={cls} disabled={disabled} pendingLabel={pendingLabel}>
        {children}
      </AdminSubmitButton>
    );
  }
  return (
    <button type="button" className={cls} disabled={disabled}>
      {children}
    </button>
  );
}

// ─────────────────── Visual Analytics Primitives (SVG, zero-deps) ───────────────────

const CHART_PALETTE: Record<
  "purple" | "pink" | "turquoise" | "coral" | "emerald" | "amber" | "rose" | "slate" | "blue",
  string
> = {
  purple: "#7C6AAD",
  pink: "#E85B9F",
  turquoise: "#2BB8AF",
  coral: "#F58A6F",
  emerald: "#10B981",
  amber: "#F59E0B",
  rose: "#F43F5E",
  slate: "#94A3B8",
  blue: "#3B82F6",
};

export type ChartTone = keyof typeof CHART_PALETTE;

export function AdminDeltaPill({
  deltaPct,
  comparisonLabel,
  invertGood = false,
}: {
  deltaPct: number | null;
  comparisonLabel?: string;
  invertGood?: boolean;
}) {
  if (deltaPct === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
        <Minus className="h-3 w-3" aria-hidden />
        {comparisonLabel ? `Sin base en ${comparisonLabel}` : "Sin comparativa previa"}
      </span>
    );
  }
  const isPositive = deltaPct > 0;
  const isNegative = deltaPct < 0;
  const good = invertGood ? isNegative : isPositive;
  const bad = invertGood ? isPositive : isNegative;
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const cls = good
    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80"
    : bad
      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200/80"
      : "bg-slate-100 text-slate-600";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${cls}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`}
      {comparisonLabel ? (
        <span className="font-normal opacity-80">vs {comparisonLabel}</span>
      ) : null}
    </span>
  );
}

export interface ComboChartDatum {
  key: string;
  /** Etiqueta completa para el tooltip ("18 oct"). */
  label: string;
  /** Etiqueta corta para el eje X ("18" o "18/10"). */
  tickLabel: string;
  /** Serie principal en barras (ej. ingresos en centavos o pesos). */
  barValue: number;
  /** Texto ya formateado de la barra para el tooltip (ej. "$120.000"). */
  barFormatted: string;
  /** Serie secundaria opcional en línea (ej. cantidad de pedidos). */
  lineValue?: number;
  lineFormatted?: string;
}

function decimateTickIndices(total: number, maxTicks: number): Set<number> {
  const result = new Set<number>();
  if (total <= 0) return result;
  if (total <= maxTicks) {
    for (let i = 0; i < total; i++) result.add(i);
    return result;
  }
  result.add(0);
  result.add(total - 1);
  const innerSlots = Math.max(0, maxTicks - 2);
  for (let s = 1; s <= innerSlots; s++) {
    const idx = Math.round((s * (total - 1)) / (innerSlots + 1));
    result.add(idx);
  }
  return result;
}

export function AdminComboBarLineChart({
  data,
  ariaLabel,
  barLegend,
  lineLegend,
  maxAxisFormatted,
  midAxisFormatted,
  maxTicks = 7,
}: {
  data: ComboChartDatum[];
  ariaLabel: string;
  barLegend: string;
  lineLegend?: string;
  maxAxisFormatted?: string;
  midAxisFormatted?: string;
  maxTicks?: number;
}) {
  const n = data.length;
  const hasLine = Boolean(lineLegend) && data.some((d) => typeof d.lineValue === "number");
  const maxBar = Math.max(0, ...data.map((d) => d.barValue));
  const maxLine = hasLine ? Math.max(0, ...data.map((d) => d.lineValue ?? 0)) : 0;

  const width = 640;
  const height = 216;
  const padLeft = maxAxisFormatted ? 66 : 16;
  const padRight = 14;
  const padTop = 16;
  const padBottom = 30;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const slotW = n > 0 ? plotW / n : plotW;
  const barW = Math.max(4, Math.min(28, slotW * 0.62));
  const visibleTicks = decimateTickIndices(n, maxTicks);

  const linePoints =
    hasLine && n > 0
      ? data.map((d, i) => {
          const cx = padLeft + i * slotW + slotW / 2;
          const val = d.lineValue ?? 0;
          const cy = maxLine > 0 ? padTop + plotH - (val / maxLine) * (plotH - 8) : padTop + plotH;
          return { cx, cy, val, d };
        })
      : [];

  const polylineAttr = linePoints.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(" ");

  return (
    <div className="w-full">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-brand-purple-dark inline-flex items-center gap-1.5 font-medium">
            <span
              className="inline-block h-2.5 w-2.5 rounded-xs"
              style={{ backgroundColor: CHART_PALETTE.purple }}
              aria-hidden
            />
            {barLegend}
          </span>
          {hasLine && lineLegend ? (
            <span className="text-brand-purple-dark inline-flex items-center gap-1.5 font-medium">
              <span
                className="inline-block h-0.5 w-3.5 rounded-full"
                style={{ backgroundColor: CHART_PALETTE.pink }}
                aria-hidden
              />
              {lineLegend}
            </span>
          ) : null}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        className="h-48 w-full overflow-visible select-none sm:h-56"
      >
        <title>{ariaLabel}</title>
        <defs>
          <linearGradient id="lucamsBarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C6AAD" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#5E4B8B" stopOpacity="0.72" />
          </linearGradient>
        </defs>

        {/* Líneas guía horizontales */}
        {[0, 0.5, 1].map((ratio) => {
          const y = padTop + plotH * (1 - ratio);
          return (
            <line
              key={ratio}
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke="#7C6AAD"
              strokeOpacity={ratio === 0 ? 0.22 : 0.12}
              strokeDasharray={ratio === 0 ? undefined : "4 4"}
              strokeWidth={1}
            />
          );
        })}

        {/* Etiquetas del eje Y */}
        {maxAxisFormatted ? (
          <>
            <text
              x={padLeft - 8}
              y={padTop + 4}
              textAnchor="end"
              className="fill-slate-500 text-[10px] tabular-nums"
            >
              {maxAxisFormatted}
            </text>
            {midAxisFormatted ? (
              <text
                x={padLeft - 8}
                y={padTop + plotH * 0.5 + 3}
                textAnchor="end"
                className="fill-slate-400 text-[10px] tabular-nums"
              >
                {midAxisFormatted}
              </text>
            ) : null}
            <text
              x={padLeft - 8}
              y={padTop + plotH + 3}
              textAnchor="end"
              className="fill-slate-400 text-[10px] tabular-nums"
            >
              $0
            </text>
          </>
        ) : null}

        {/* Barras */}
        {data.map((d, i) => {
          const cx = padLeft + i * slotW + slotW / 2;
          const barH =
            maxBar > 0 && d.barValue > 0 ? Math.max(4, (d.barValue / maxBar) * (plotH - 4)) : 2;
          const x = cx - barW / 2;
          const y = padTop + plotH - barH;
          const tip = d.lineFormatted
            ? `${d.label}: ${d.barFormatted} · ${d.lineFormatted}`
            : `${d.label}: ${d.barFormatted}`;
          return (
            <g key={d.key}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={Math.min(4, barW / 2)}
                fill={d.barValue > 0 ? "url(#lucamsBarGrad)" : "#E2E8F0"}
                className="transition-opacity hover:opacity-85"
              >
                <title>{tip}</title>
              </rect>
              {visibleTicks.has(i) ? (
                <text
                  x={cx}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px] font-medium tabular-nums"
                >
                  {d.tickLabel}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* Línea secundaria superpuesta */}
        {linePoints.length > 1 && maxLine > 0 ? (
          <polyline
            fill="none"
            stroke={CHART_PALETTE.pink}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylineAttr}
          />
        ) : null}
        {maxLine > 0
          ? linePoints.map((p) => (
              <circle
                key={`pt-${p.d.key}`}
                cx={p.cx}
                cy={p.cy}
                r={p.val > 0 ? 3.5 : 2}
                fill={p.val > 0 ? CHART_PALETTE.pink : "#CBD5E1"}
                stroke="#FFFFFF"
                strokeWidth={1.5}
              >
                <title>
                  {p.d.label}: {p.d.lineFormatted ?? p.val}
                </title>
              </circle>
            ))
          : null}
      </svg>
    </div>
  );
}

export interface DonutSlice {
  key: string;
  label: string;
  count: number;
  formattedValue?: string;
  tone: ChartTone;
  href?: string;
  hint?: string;
}

export function AdminDonutChart({
  slices,
  centerValue,
  centerLabel,
  ariaLabel,
}: {
  slices: DonutSlice[];
  centerValue: string;
  centerLabel: string;
  ariaLabel: string;
}) {
  const total = slices.reduce((acc, s) => acc + Math.max(0, s.count), 0);
  const radius = 50;
  const circumference = 2 * Math.PI * radius;

  const computedSlices = slices.reduce<{
    offset: number;
    items: Array<DonutSlice & { pct: number; dash: number; offset: number }>;
  }>(
    (acc, s) => {
      const val = Math.max(0, s.count);
      const ratio = total > 0 ? val / total : 0;
      const dash = ratio * circumference;
      const pct = total > 0 ? Math.round(ratio * 100) : 0;
      acc.items.push({ ...s, pct, dash, offset: acc.offset });
      acc.offset += dash;
      return acc;
    },
    { offset: 0, items: [] },
  ).items;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
      <div className="relative h-36 w-36 flex-shrink-0">
        <svg viewBox="0 0 140 140" role="img" aria-label={ariaLabel} className="h-full w-full">
          <title>{ariaLabel}</title>
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="16" />
          {total > 0 &&
            computedSlices
              .filter((s) => s.count > 0)
              .map((s) => (
                <circle
                  key={s.key}
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke={CHART_PALETTE[s.tone]}
                  strokeWidth="16"
                  strokeDasharray={`${Math.max(1.5, s.dash)} ${circumference}`}
                  strokeDashoffset={-s.offset}
                  transform="rotate(-90 70 70)"
                  className="transition-all duration-300"
                >
                  <title>
                    {s.label}: {s.formattedValue ?? s.count.toLocaleString("es-CO")} ({s.pct}%)
                  </title>
                </circle>
              ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <span className="text-brand-purple-dark font-display text-lg leading-tight font-bold tabular-nums">
            {centerValue}
          </span>
          <span className="text-brand-muted mt-0.5 text-[10px] font-medium uppercase">
            {centerLabel}
          </span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2">
        {computedSlices.map((s) => {
          const inner = (
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: CHART_PALETTE[s.tone] }}
                  aria-hidden
                />
                <span className="text-brand-purple-dark truncate text-xs font-medium">
                  {s.label}
                </span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5 text-xs tabular-nums">
                <span className="text-brand-purple-dark font-semibold">
                  {s.formattedValue ?? s.count.toLocaleString("es-CO")}
                </span>
                <span className="text-brand-muted text-[11px]">({s.pct}%)</span>
              </div>
            </div>
          );

          return (
            <li key={s.key}>
              {s.href ? (
                <Link
                  href={s.href}
                  className="hover:bg-brand-purple/5 -mx-2 block rounded-lg px-2 py-1 transition-colors"
                >
                  {inner}
                  {s.hint ? (
                    <p className="text-brand-muted mt-0.5 pl-4 text-[11px]">{s.hint}</p>
                  ) : null}
                </Link>
              ) : (
                <div className="py-0.5">
                  {inner}
                  {s.hint ? (
                    <p className="text-brand-muted mt-0.5 pl-4 text-[11px]">{s.hint}</p>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface SegmentedBarItem {
  key: string;
  label: string;
  count: number;
  tone: ChartTone;
  href?: string;
  sublabel?: string;
}

export function AdminSegmentedBar({
  items,
  ariaLabel,
}: {
  items: SegmentedBarItem[];
  ariaLabel: string;
}) {
  const total = items.reduce((acc, i) => acc + Math.max(0, i.count), 0);
  return (
    <div className="space-y-2.5">
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100"
      >
        {total > 0 ? (
          items
            .filter((i) => i.count > 0)
            .map((item) => {
              const pct = Math.max(2, (item.count / total) * 100);
              return (
                <div
                  key={item.key}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: CHART_PALETTE[item.tone],
                  }}
                  title={`${item.label}: ${item.count.toLocaleString("es-CO")} (${Math.round((item.count / total) * 100)}%)`}
                  className="h-full border-r border-white/60 last:border-r-0"
                />
              );
            })
        ) : (
          <div className="h-full w-full bg-slate-200/70" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        {items.map((item) => {
          const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
          const content = (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: CHART_PALETTE[item.tone] }}
                aria-hidden
              />
              <span className="text-brand-purple-dark font-medium">{item.label}:</span>
              <strong className="text-brand-purple-dark tabular-nums">
                {item.count.toLocaleString("es-CO")}
              </strong>
              {total > 0 ? <span className="text-brand-muted tabular-nums">({pct}%)</span> : null}
              {item.sublabel ? (
                <span className="text-brand-muted text-[11px]">· {item.sublabel}</span>
              ) : null}
            </span>
          );
          return item.href ? (
            <Link
              key={item.key}
              href={item.href}
              className="hover:text-brand-purple rounded-md py-0.5 transition-colors hover:underline"
            >
              {content}
            </Link>
          ) : (
            <span key={item.key} className="py-0.5">
              {content}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export interface HorizontalBarItem {
  key: string;
  label: string;
  sublabel?: string;
  badgeText?: string;
  value: number;
  formattedValue: string;
  secondaryText?: string;
  tone?: ChartTone;
  href?: string;
}

export function AdminHorizontalBars({ items }: { items: HorizontalBarItem[] }) {
  const maxVal = Math.max(1, ...items.map((i) => i.value));
  const totalVal = items.reduce((acc, i) => acc + Math.max(0, i.value), 0);

  return (
    <ol className="space-y-2.5">
      {items.map((item, idx) => {
        const widthPct = item.value > 0 ? Math.max(3, (item.value / maxVal) * 100) : 0;
        const sharePct = totalVal > 0 ? Math.round((item.value / totalVal) * 100) : 0;
        const color = CHART_PALETTE[item.tone ?? "purple"];

        return (
          <li
            key={item.key}
            className="border-brand-purple/10 rounded-xl border bg-slate-50/50 p-3 transition-colors hover:bg-white"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="bg-brand-purple/10 text-brand-purple-dark inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="text-brand-purple-dark hover:text-brand-purple block truncate text-xs font-semibold hover:underline sm:text-sm"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <p className="text-brand-purple-dark truncate text-xs font-semibold sm:text-sm">
                      {item.label}
                    </p>
                  )}
                  {(item.sublabel || item.badgeText) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      {item.sublabel ? <span>{item.sublabel}</span> : null}
                      {item.badgeText ? (
                        <code className="bg-brand-purple/5 text-brand-purple-dark rounded px-1.5 py-0.5 font-mono text-[10px]">
                          {item.badgeText}
                        </code>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right tabular-nums">
                <span className="text-brand-purple-dark text-sm font-bold">
                  {item.formattedValue}
                </span>
                {totalVal > 0 ? (
                  <span className="text-brand-muted ml-1.5 text-xs">({sharePct}%)</span>
                ) : null}
                {item.secondaryText ? (
                  <p className="text-[11px] text-emerald-700">{item.secondaryText}</p>
                ) : null}
              </div>
            </div>

            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200/70">
              <div
                className="admin-bar-grow-x h-full rounded-full"
                style={{ width: `${widthPct}%`, backgroundColor: color }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
