/*
 * <AdminPage> + <AdminPageHeader> — Standard layout admin con simetría
 * y branding consistente.
 *
 * PLAN_CATALOG_V2 + feedback Lucy 2026-05-16:
 *   - Todas las pantallas admin usan max-w-6xl + px-6 py-8 desktop.
 *   - Header brand: título Fredoka + subtítulo + acciones a la derecha.
 *   - Acento brand-purple en breadcrumbs/acciones.
 *
 * Mobile: padding reducido a px-4 py-6.
 */

import type { ReactNode } from "react";
import Link from "next/link";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function AdminPageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  icon,
}: {
  title: string;
  subtitle?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="border-brand-purple/10 border-b bg-white px-4 py-5 sm:px-6 sm:py-6">
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
            <div className="from-brand-purple/15 to-brand-pink/15 text-brand-purple flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br">
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
    </header>
  );
}

export function AdminPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl">{children}</div>
    </div>
  );
}

/**
 * Contenedor principal de contenido (debajo del header).
 * Padding consistente + space-y-6 entre secciones.
 */
export function AdminPageBody({ children }: { children: ReactNode }) {
  return <main className="space-y-6 px-4 py-6 sm:px-6 sm:py-8">{children}</main>;
}

/**
 * Notice banners con colores brand consistentes.
 * Tonos: success (verde), warning (ámbar), info (morado), error (rojo).
 */
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
    <div className={`rounded-md border px-3 py-2 text-sm ${styles[tone]}`}>
      <span className="mr-1.5">{emoji[tone]}</span>
      {children}
    </div>
  );
}
