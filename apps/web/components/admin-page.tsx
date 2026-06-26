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
  type LucideIcon,
} from "lucide-react";

// ─────────────────── Layout primitives ───────────────────

type BreadcrumbItem = { label: string; href?: string };

export function AdminPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
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
                  <Link href={b.href} className="hover:text-brand-purple">
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

export function AdminPageBody({ children }: { children: ReactNode }) {
  return <main className="space-y-6 px-4 py-6 sm:px-6 sm:py-8">{children}</main>;
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
    <div
      className={`border-brand-purple/10 overflow-x-auto rounded-xl border bg-white shadow-sm ${className}`}
    >
      <table className="w-full text-sm" style={{ minWidth: `${minWidth}px` }}>
        {children}
      </table>
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
      {description && (
        <p className="text-brand-purple-dark/60 mt-1 max-w-md text-sm">{description}</p>
      )}
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
      <p className={`text-3xl font-bold tabular-nums ${c.text}`}>{value}</p>
      <p className="text-brand-purple-dark mt-1 text-sm font-medium">{label}</p>
      {description && <p className="text-brand-purple-dark/55 text-xs">{description}</p>}
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
      <p className="text-brand-purple-dark/60 text-xs font-semibold tracking-wider uppercase">
        {label}
      </p>
      <p className="text-brand-purple-dark font-display mt-2 text-3xl font-bold tabular-nums">
        {value}
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
        <ArrowRight className="text-brand-purple/50 h-3.5 w-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
      </div>
      <p className="text-brand-purple-dark text-sm font-semibold">{label}</p>
      <p className="text-brand-purple-dark/55 mt-0.5 line-clamp-2 text-xs leading-snug">
        {description}
      </p>
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
}: {
  href?: string;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  children: ReactNode;
  className?: string;
  disabled?: boolean;
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
  return (
    <button type={type ?? "button"} className={cls} disabled={disabled}>
      {children}
    </button>
  );
}
