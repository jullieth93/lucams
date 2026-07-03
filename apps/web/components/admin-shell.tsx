/*
 * <AdminShell /> — Layout shell del panel admin (v3 brand premium 2026-05-18).
 *
 * Inspirado en commerce-ops-platform/phase-0-pre-prod (sidebar dark + topbar
 * verde medio + footer con dropdown user menu). Adaptado a paleta brand
 * Lucams: gradient brand-purple-dark (storefront footer) + acentos
 * brand-pink + brand-turquoise.
 *
 * Componentes:
 *   - Sidebar oscuro premium con blobs decorativos brand
 *   - Topbar minimal con breadcrumb + Live indicator
 *   - Footer sidebar con avatar + dropdown (Cambiar contraseña + Cerrar sesión)
 *   - 11 áreas top-level: Dashboard, Ventas, Catálogo, Comercial, Producción,
 *     Canales, Finanzas, IA y Conocimiento, Analítica, Configuración, Mensajes
 *   - Badges visuales [Próximo / Fase 4 / Fase 5] para items no disponibles
 *
 * Mobile: drawer slide-in con backdrop.
 * A11y: aria-expanded, aria-label, focus rings.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminRoleLabel } from "@/lib/admin-roles";
import { usePathname } from "next/navigation";
import {
  LogOut,
  ExternalLink,
  Menu,
  X,
  ChevronDown,
  KeyRound,
  Crown,
  Sparkles,
} from "lucide-react";
import { adminLogoutAction } from "@/app/auth/logout/actions";
import { ADMIN_NAV, type NavBadge, type NavGroup } from "@/lib/admin-nav";
import { filterNavByRole } from "@/lib/admin-rbac";
import type { AdminRole } from "@lucams/db";

type AdminInfo = {
  email: string;
  role: string;
};

// NAV se importa de @/lib/admin-nav (compartido con la página catch-all
// [...placeholder]/page.tsx para mostrar info contextual cuando el
// cliente clickea un módulo "Próximo").
const NAV = ADMIN_NAV;
// Alias local para compatibilidad con el código que usaba `Badge`.
type Badge = NavBadge;

// ─────────────────── Role badges (sidebar footer) ───────────────────
// Diccionario único compartido (lib/admin-roles) — antes el sidebar usaba
// valores de enum inexistentes y no coincidía con /admin/usuarios.

// ─────────────────── Shell ───────────────────

export function AdminShell({ admin, children }: { admin: AdminInfo; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Cerrar drawer mobile al navegar (defer via microtask para satisfacer
  // react-hooks/set-state-in-effect — el lint rule prefiere setState
  // fuera del cuerpo síncrono del effect).
  useEffect(() => {
    queueMicrotask(() => setMobileOpen(false));
  }, [pathname]);

  return (
    <div className="bg-brand-cream/40 flex min-h-screen">
      {/* Sidebar desktop — gradient morado oscuro premium.
          Lucy 2026-06-27: sticky + h-screen para que NO se escape al hacer scroll.
          SidebarContent ya tiene h-full + overflow-y-auto, así que el menú scrollea
          adentro si es más alto que la pantalla. */}
      <aside className="from-brand-purple-dark via-brand-purple-dark to-brand-purple relative hidden overflow-hidden bg-gradient-to-b text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-shrink-0 lg:flex-col">
        <SidebarDecorations />
        <SidebarContent admin={admin} pathname={pathname} onNavigate={() => {}} />
      </aside>

      {/* Topbar mobile */}
      <div className="from-brand-purple-dark to-brand-purple sticky top-0 z-30 flex items-center justify-between bg-gradient-to-r px-4 py-3 text-white shadow-md lg:hidden">
        <Link href="/admin/dashboard" className="flex items-center gap-2.5">
          <BrandIcon />
          <div>
            <p className="text-[10px] font-semibold tracking-wider text-white/60 uppercase">
              Panel admin
            </p>
            <p className="font-display text-base leading-tight font-bold text-white">
              Lucams<span className="text-brand-pink">_shop</span>
            </p>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-white transition-colors hover:bg-white/10"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Drawer mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="from-brand-purple-dark via-brand-purple-dark to-brand-purple absolute top-0 left-0 flex h-full w-72 flex-col overflow-hidden bg-gradient-to-b text-white shadow-2xl">
            <SidebarDecorations />
            <div className="relative z-10 flex items-center justify-end border-b border-white/10 px-3 py-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1.5 text-white hover:bg-white/10"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent
              admin={admin}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Contenido principal */}
      <div className="flex flex-1 flex-col overflow-x-hidden">
        <AdminTopBar pathname={pathname} />
        <main id="contenido" tabIndex={-1} className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

// ─────────────────── Decoración sidebar ───────────────────

function SidebarDecorations() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="bg-brand-pink/20 absolute -top-24 -right-16 h-64 w-64 rounded-full blur-3xl" />
      <div className="bg-brand-turquoise/15 absolute -bottom-24 -left-16 h-72 w-72 rounded-full blur-3xl" />
    </div>
  );
}

// ─────────────────── TopBar premium ───────────────────

function AdminTopBar({ pathname }: { pathname: string }) {
  const crumb = labelForPath(pathname);
  return (
    <div className="border-brand-purple/10 sticky top-0 z-20 hidden h-14 items-center justify-between border-b bg-white/85 px-6 backdrop-blur-md lg:flex">
      <div className="flex items-center gap-3">
        <span className="text-brand-muted text-[10px] font-semibold tracking-wider uppercase">
          Panel
        </span>
        <span className="text-brand-purple/30">·</span>
        <span className="text-brand-purple-dark text-sm font-semibold">{crumb}</span>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/"
          target="_blank"
          rel="noopener"
          className="text-brand-purple-dark hover:bg-brand-purple/10 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Ver el sitio
        </Link>
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 ring-1 ring-emerald-200/60">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-xs font-semibold text-emerald-700">Live</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Resuelve el label del breadcrumb topbar consultando el NAV compartido.
 * Si la ruta matchea un item del NAV → "{Grupo} · {Item}".
 * Si matchea un top-level leaf → "{Title}".
 * Fallback: "Lucams_shop" (no debería pasar — el catch-all placeholder
 * cubre cualquier ruta admin no implementada).
 */
function labelForPath(p: string): string {
  // Buscar match exacto primero, luego prefix (para nested como /[id])
  for (const group of NAV) {
    if (group.href && (p === group.href || p.startsWith(group.href + "/"))) {
      return group.title;
    }
    if (group.items) {
      for (const item of group.items) {
        if (p === item.href || p.startsWith(item.href + "/")) {
          return `${group.title} · ${item.label}`;
        }
      }
    }
  }
  return "Lucams_shop";
}

// ─────────────────── Brand icon ───────────────────

function BrandIcon() {
  return (
    <div className="from-brand-pink via-brand-coral to-brand-yellow glow-brand flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg ring-2 ring-white/30">
      <Sparkles className="h-[18px] w-[18px] text-white" />
    </div>
  );
}

// ─────────────────── Sidebar interno ───────────────────

function SidebarContent({
  admin,
  pathname,
  onNavigate,
}: {
  admin: AdminInfo;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="relative z-10 flex h-full flex-col overflow-y-auto">
      {/* Header brand */}
      <Link
        href="/admin/dashboard"
        onClick={onNavigate}
        className="block border-b border-white/10 px-5 py-4 transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-3">
          <BrandIcon />
          <div>
            <p className="text-[10px] font-semibold tracking-wider text-white/55 uppercase">
              Panel admin
            </p>
            <p className="font-display text-xl leading-tight font-bold text-white">
              Lucams<span className="text-brand-pink">_shop</span>
            </p>
          </div>
        </div>
      </Link>

      {/* Nav — filtrado por rol (RBAC). SUPERADMIN ve todo; MANAGER/FULFILLMENT
          solo lo que les corresponde (lib/admin-rbac). */}
      <nav className="flex-1 px-3 py-4">
        <ul className="flex flex-col gap-0.5">
          {filterNavByRole(NAV, admin.role as AdminRole).map((group) => (
            <NavGroupItem
              key={group.title}
              group={group}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      </nav>

      {/* Footer: avatar con dropdown menu */}
      <UserFooter admin={admin} onNavigate={onNavigate} />
    </div>
  );
}

// ─────────────────── User footer (dropdown menu) ───────────────────

function UserFooter({ admin, onNavigate }: { admin: AdminInfo; onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const roleLabel = adminRoleLabel(admin.role);
  const initial = admin.email[0].toUpperCase();

  return (
    <div className="border-t border-white/10 p-3">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
            open ? "bg-white/10" : "hover:bg-white/5"
          }`}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          {/* Avatar */}
          <div className="from-brand-turquoise to-brand-pink flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white ring-2 ring-white/30">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-white/85">{admin.email}</p>
            <div className="mt-0.5 flex items-center gap-1">
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/25 px-1.5 text-[10px] font-medium text-amber-100">
                <Crown className="h-2.5 w-2.5" />
                {roleLabel}
              </span>
              <span className="bg-brand-yellow/90 text-brand-purple-dark inline-flex items-center rounded-full px-1.5 text-[10px] font-bold tracking-wide uppercase">
                Free
              </span>
            </div>
          </div>
          <ChevronDown
            className={`h-3 w-3 text-white/60 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {/* Dropdown menu (aparece ARRIBA del trigger) */}
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="from-brand-purple-dark to-brand-purple absolute right-0 bottom-full left-0 z-50 mb-2 overflow-hidden rounded-xl bg-gradient-to-br shadow-2xl ring-1 ring-white/15">
              <div className="p-1">
                <Link
                  href="/admin/password"
                  onClick={() => {
                    setOpen(false);
                    onNavigate();
                  }}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <KeyRound className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
                  Cambiar contraseña
                </Link>
                <div className="mx-2 my-1 border-t border-white/10" />
                <form action={adminLogoutAction}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-rose-200 transition-colors hover:bg-rose-500/20 hover:text-white"
                  >
                    <LogOut className="h-3.5 w-3.5 flex-shrink-0 opacity-80" />
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────── NavGroupItem ───────────────────

function NavGroupItem({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate: () => void;
}) {
  if (!group.items) {
    const isActive = group.href
      ? pathname === group.href || pathname.startsWith(group.href + "/")
      : false;
    const Icon = group.icon;
    const isSoon =
      group.badge?.tone === "soon" ||
      group.badge?.tone === "phase4" ||
      group.badge?.tone === "phase5";

    if (isSoon) {
      return (
        <li>
          <div className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-white/55">
            <Icon className="h-4 w-4" />
            <span className="flex-1">{group.title}</span>
            {group.badge && <BadgePill badge={group.badge} />}
          </div>
        </li>
      );
    }

    return (
      <li>
        <Link
          href={group.href ?? "#"}
          onClick={onNavigate}
          className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-all ${
            isActive
              ? "text-brand-purple-dark bg-white/95 font-semibold shadow-md shadow-black/10"
              : "text-white/85 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Icon className={`h-4 w-4 ${isActive ? "text-brand-purple" : ""}`} />
          <span className="flex-1">{group.title}</span>
          {group.badge && <BadgePill badge={group.badge} />}
        </Link>
      </li>
    );
  }

  return <NavGroupExpandable group={group} pathname={pathname} onNavigate={onNavigate} />;
}

function NavGroupExpandable({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate: () => void;
}) {
  const items = group.items ?? [];
  const hasActive = items.some((it) => pathname === it.href || pathname.startsWith(it.href + "/"));
  const [open, setOpen] = useState(group.defaultOpen ?? hasActive);
  const Icon = group.icon;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
          hasActive
            ? "font-semibold text-white"
            : "text-white/85 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Icon className={`h-4 w-4 ${hasActive ? "text-brand-pink" : ""}`} />
        <span className="flex-1 text-left">{group.title}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-white/20 pl-2">
          {items.map((it) => {
            const isActive = pathname === it.href || pathname.startsWith(it.href + "/");
            const isSoon =
              it.badge?.tone === "soon" ||
              it.badge?.tone === "phase4" ||
              it.badge?.tone === "phase5";
            const ItemIcon = it.icon;
            return (
              <li key={it.href}>
                {isSoon ? (
                  <div
                    className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-white/55"
                    title="Próximamente disponible"
                  >
                    <ItemIcon className="h-3.5 w-3.5" />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.badge && <BadgePill badge={it.badge} />}
                  </div>
                ) : (
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-all ${
                      isActive
                        ? "text-brand-purple-dark bg-white/95 font-semibold shadow-md shadow-black/10"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <ItemIcon className={`h-3.5 w-3.5 ${isActive ? "text-brand-purple" : ""}`} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.badge && <BadgePill badge={it.badge} />}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

// ─────────────────── Badges ───────────────────

function BadgePill({ badge }: { badge: Badge }) {
  const styles = {
    soon: "bg-white/15 text-white/70",
    phase4: "bg-amber-400/25 text-amber-100",
    phase5: "bg-brand-turquoise/25 text-brand-turquoise",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase ${styles[badge.tone]}`}
    >
      {badge.text}
    </span>
  );
}
