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
 *   - Topbar minimal con breadcrumb + accesos al Centro de ayuda y al sitio
 *   - Footer sidebar con avatar + dropdown (Cambiar contraseña + Cerrar sesión)
 *   - 11 áreas top-level: Dashboard, Ventas, Catálogo, Comercial, Producción,
 *     Canales, Finanzas, IA y Conocimiento, Analítica, Configuración
 *     (N-09: el área "Mensajes" se eliminó — consolidada en Servicio al cliente > Soporte)
 *   - Badges visuales [Próximo / Fase 4 / Fase 5] para items no disponibles
 *   - Badge numérico de no leídas en el item "Notificaciones" (prop
 *     `unreadNotifications`, la calcula el layout del panel con getUnreadCount)
 *
 * Mobile: topbar fija (logo + sección actual + hamburguesa) + drawer slide-in
 * con backdrop. El layout raíz es flex-col en móvil y flex-row en lg — antes
 * era fila siempre y la topbar quedaba como columna comiéndose ~60% del
 * ancho (auditoría E1 P0, 2026-07-31).
 * A11y: aria-expanded, aria-label, focus rings.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminRoleLabel } from "@/lib/admin-roles";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut,
  ExternalLink,
  Menu,
  X,
  ChevronDown,
  KeyRound,
  Crown,
  Sparkles,
  CircleHelp,
  Search,
  ShieldCheck,
  CornerDownLeft,
  ArrowUpRight,
  Users,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { adminLogoutAction } from "@/app/auth/logout/actions";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Hint } from "@/components/ui/tooltip";
import { getAdminNav, type NavBadge, type NavGroup } from "@/lib/admin-nav";
import { adminHomePath, canAccessAdminPath, filterNavByRole } from "@/lib/admin-rbac";
import { isCatalogMode } from "@/lib/store-mode";
import type { AdminRole } from "@lucams/db";

type AdminInfo = {
  email: string;
  role: string;
};

/** Logo del sitio desde el CMS (setting `site.logo` → Mediateca). null = insignia gradiente actual. */
export type AdminShellLogo = { url: string; alt: string };

// NAV efectivo según el modo de tienda: getAdminNav() filtra "Finanzas" e
// "Integraciones" en modo catálogo (Etapa 1 — lib/store-mode). La data base
// vive en @/lib/admin-nav (compartida con la página catch-all [...placeholder],
// que sigue usando ADMIN_NAV completo para info contextual de módulos "Próximo").
const NAV = getAdminNav();
// Alias local para compatibilidad con el código que usaba `Badge`.
type Badge = NavBadge;

/*
 * Ítem activo = el href MÁS ESPECÍFICO del nav que coincide con el pathname.
 * Antes cada ítem se marcaba con `pathname.startsWith(href + "/")` y, como
 * /admin/finanzas es prefijo de /admin/finanzas/conciliacion (ídem
 * /admin/contenido vs /admin/contenido/paginas/global), quedaban 2-4 filas
 * blancas "activas" a la vez (feedback Lucy 2026-09-18). Ahora se recorren
 * todos los hrefs y solo gana el más largo que matchee.
 */
const ALL_NAV_HREFS: string[] = NAV.flatMap((g) => [
  ...(g.href ? [g.href] : []),
  ...(g.items ?? []).map((it) => it.href),
]);

function activeNavHref(pathname: string): string | null {
  let best: string | null = null;
  for (const href of ALL_NAV_HREFS) {
    if (
      (pathname === href || pathname.startsWith(href + "/")) &&
      (best === null || href.length > best.length)
    ) {
      best = href;
    }
  }
  return best;
}

// ─────────────────── Role badges (sidebar footer) ───────────────────

const FOOTER_ROLE_PILL: Record<string, string> = {
  SUPERADMIN: "bg-amber-400/25 text-amber-100 ring-1 ring-amber-300/30",
  OPERATIONS_MANAGER: "bg-sky-400/25 text-sky-100 ring-1 ring-sky-300/30",
  MANAGER: "bg-sky-400/25 text-sky-100 ring-1 ring-sky-300/30",
  CUSTOMER_SUPPORT: "bg-brand-turquoise/25 text-teal-100 ring-1 ring-brand-turquoise/35",
  PRINT_WORKSHOP: "bg-orange-400/25 text-orange-100 ring-1 ring-orange-300/30",
  FULFILLMENT: "bg-orange-400/25 text-orange-100 ring-1 ring-orange-300/30",
  FINANCE_ANALYST: "bg-emerald-400/25 text-emerald-100 ring-1 ring-emerald-300/30",
  CMS_EDITOR: "bg-brand-pink/30 text-pink-100 ring-1 ring-brand-pink/40",
};

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

type CommandEntry = {
  key: string;
  label: string;
  group: string;
  description?: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
};

// ─────────────────── Shell ───────────────────

export function AdminShell({
  admin,
  unreadNotifications = 0,
  logo = null,
  children,
}: {
  admin: AdminInfo;
  /** No leídas del centro de notificaciones (badge en el item del nav). 0 = sin pill. */
  unreadNotifications?: number;
  /** Fase 3 · 3.9 — logo administrable (CMS `site.logo`); null = estado actual. */
  logo?: AdminShellLogo | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);

  const homeHref = adminHomePath(admin.role as AdminRole);

  const openCommandPalette = () => {
    setPaletteQuery("");
    setPaletteIndex(0);
    setPaletteOpen(true);
  };

  // Cerrar drawer mobile al navegar (defer via microtask para satisfacer
  // react-hooks/set-state-in-effect — el lint rule prefiere setState
  // fuera del cuerpo síncrono del effect).
  useEffect(() => {
    queueMicrotask(() => {
      setMobileOpen(false);
      setPaletteOpen(false);
    });
  }, [pathname]);

  // Atajo global ⌘K / Ctrl+K para saltar a cualquier módulo autorizado.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteQuery("");
        setPaletteIndex(0);
        setPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="bg-brand-cream/40 flex min-h-screen flex-col lg:flex-row">
      {/* Sidebar desktop */}
      <aside className="from-brand-purple-dark via-brand-purple-dark to-brand-purple relative hidden overflow-hidden bg-gradient-to-b text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-shrink-0 lg:flex-col">
        <SidebarDecorations />
        <SidebarContent
          admin={admin}
          homeHref={homeHref}
          pathname={pathname}
          unreadNotifications={unreadNotifications}
          logo={logo}
          onNavigate={() => {}}
          onOpenSearch={openCommandPalette}
        />
      </aside>

      {/* Topbar mobile */}
      <div className="from-brand-purple-dark to-brand-purple sticky top-0 z-30 flex items-center justify-between gap-2 bg-gradient-to-r px-4 py-2 text-white shadow-md sm:py-2.5 lg:hidden">
        <Link href={homeHref} className="flex min-h-11 min-w-0 items-center gap-2.5">
          <BrandIcon logo={logo} />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-wider text-white/60 uppercase">
              Panel admin
            </p>
            <p className="font-display truncate text-base leading-tight font-bold text-white">
              LUCAMS
            </p>
          </div>
        </Link>
        <p className="min-w-0 flex-1 truncate text-right text-xs font-medium text-white/75">
          {labelForPath(pathname)}
        </p>
        <button
          type="button"
          onClick={openCommandPalette}
          className="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-md p-2 text-white transition-colors hover:bg-white/10"
          aria-label="Buscar módulo"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-md p-2 text-white transition-colors hover:bg-white/10"
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
              homeHref={homeHref}
              pathname={pathname}
              unreadNotifications={unreadNotifications}
              logo={logo}
              onNavigate={() => setMobileOpen(false)}
              onOpenSearch={() => {
                setMobileOpen(false);
                openCommandPalette();
              }}
            />
          </aside>
        </div>
      )}

      {/* Contenido principal */}
      <div className="flex flex-1 flex-col overflow-x-clip lg:overflow-x-hidden">
        <AdminTopBar pathname={pathname} onOpenSearch={openCommandPalette} />
        <main id="contenido" data-admin-help="module" tabIndex={-1} className="flex-1">
          {children}
        </main>
      </div>

      <AdminCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        query={paletteQuery}
        onQueryChange={(q) => {
          setPaletteQuery(q);
          setPaletteIndex(0);
        }}
        activeIndex={paletteIndex}
        onActiveIndexChange={setPaletteIndex}
        role={admin.role as AdminRole}
        pathname={pathname}
      />
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

function AdminTopBar({ pathname, onOpenSearch }: { pathname: string; onOpenSearch: () => void }) {
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
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenSearch}
          className="border-brand-purple/15 text-brand-purple-dark/75 hover:border-brand-purple/35 hover:bg-brand-purple/5 hover:text-brand-purple-dark inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium shadow-2xs transition-all"
        >
          <Search className="h-3.5 w-3.5 opacity-70" />
          <span>Ir a módulo…</span>
          <kbd className="bg-brand-purple/8 text-brand-purple-dark/70 ml-2 rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold">
            ⌘K
          </kbd>
        </button>
        <Link
          href="/admin/ayuda"
          className="text-brand-purple-dark hover:bg-brand-purple/10 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
        >
          <CircleHelp className="h-3.5 w-3.5" />
          Centro de ayuda
        </Link>
        <Link
          href="/"
          target="_blank"
          rel="noopener"
          className="text-brand-purple-dark hover:bg-brand-purple/10 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Ver el sitio
        </Link>
      </div>
    </div>
  );
}

/**
 * Resuelve el label del breadcrumb topbar consultando el NAV compartido.
 * Si la ruta matchea un item del NAV → "{Grupo} · {Item}".
 * Si matchea un top-level leaf → "{Title}".
 * Fallback: "LUCAMS" (no debería pasar — el catch-all placeholder
 * cubre cualquier ruta admin no implementada).
 */
function labelForPath(p: string): string {
  if (p === "/admin/clientes/duplicados" || p.startsWith("/admin/clientes/duplicados/")) {
    return "Ventas · Duplicados CRM";
  }
  if (/^\/admin\/cotizaciones\/[^/?]+\/taller(?:$|[/?])/.test(p)) {
    return "Producción · Hoja de taller";
  }
  if (p === "/admin/cotizaciones" || p.startsWith("/admin/cotizaciones/")) {
    return "Ventas · Cotizaciones";
  }
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
  return "LUCAMS";
}

// ─────────────────── Brand icon ───────────────────

function BrandIcon({ logo = null }: { logo?: AdminShellLogo | null }) {
  // Fase 3 · 3.9 — si el negocio configuró un logo en el CMS (Ajustes del
  // sitio › Identidad de marca), se muestra en badge blanco (funciona sobre
  // el gradiente oscuro del sidebar); si no, la insignia gradiente de siempre.
  if (logo) {
    return (
      <div className="glow-brand flex h-9 w-9 items-center justify-center rounded-xl bg-white p-1 shadow-lg ring-2 ring-white/30">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo admin, dimensiones variables */}
        <img src={logo.url} alt={logo.alt} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }
  return (
    <div className="from-brand-pink via-brand-coral to-brand-yellow glow-brand flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg ring-2 ring-white/30">
      <Sparkles className="h-[18px] w-[18px] text-white" />
    </div>
  );
}

// ─────────────────── Sidebar interno ───────────────────

function SidebarContent({
  admin,
  homeHref,
  pathname,
  unreadNotifications,
  logo = null,
  onNavigate,
  onOpenSearch,
}: {
  admin: AdminInfo;
  homeHref: string;
  pathname: string;
  unreadNotifications: number;
  logo?: AdminShellLogo | null;
  onNavigate: () => void;
  onOpenSearch: () => void;
}) {
  const activeHref = activeNavHref(pathname);
  const groups = filterNavByRole(NAV, admin.role as AdminRole);

  /*
   * Acordeón EXCLUSIVO (2026-10-05): un solo grupo expandido a la vez. El estado
   * vive acá (antes cada NavGroupExpandable tenía su propio useState y expandir
   * uno no colapsaba los demás). Inicial: el grupo del item activo; si no hay,
   * el primer grupo con defaultOpen (comportamiento previo).
   * Colapsar el grupo activo a mano es válido (toggle a null).
   */
  const [openGroupTitle, setOpenGroupTitle] = useState<string | null>(() => {
    const withActive = groups.find((g) => g.items?.some((it) => it.href === activeHref));
    if (withActive) return withActive.title;
    return groups.find((g) => g.items && g.defaultOpen)?.title ?? null;
  });

  // Al NAVEGAR, abre el grupo que contiene el item activo (antes hasActive solo
  // se evaluaba en mount: un grupo colapsado con la ruta activa quedaba cerrado
  // para siempre). Depende de pathname — un toggle manual no lo re-dispara.
  // queueMicrotask: react-hooks/set-state-in-effect prefiere setState diferido.
  useEffect(() => {
    const gs = filterNavByRole(NAV, admin.role as AdminRole);
    const withActive = gs.find((g) => g.items?.some((it) => it.href === activeNavHref(pathname)));
    if (withActive) queueMicrotask(() => setOpenGroupTitle(withActive.title));
  }, [pathname, admin.role]);

  return (
    <div className="relative z-10 flex h-full flex-col overflow-y-auto">
      {/* Header brand */}
      <Link
        href={homeHref}
        onClick={onNavigate}
        className="block border-b border-white/10 px-5 py-4 transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-3">
          <BrandIcon logo={logo} />
          <div>
            <p className="text-[10px] font-semibold tracking-wider text-white/55 uppercase">
              Panel admin
            </p>
            <p className="font-display text-xl leading-tight font-bold text-white">LUCAMS</p>
          </div>
        </div>
      </Link>

      {/* Buscador rápido de módulos (⌘K / Ctrl+K) */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex w-full items-center gap-2 rounded-lg border border-white/12 bg-white/8 px-3 py-2 text-left text-xs text-white/75 transition-all hover:border-white/25 hover:bg-white/14 hover:text-white"
        >
          <Search className="h-3.5 w-3.5 flex-shrink-0 opacity-80" />
          <span className="flex-1 truncate">Buscar módulo…</span>
          <kbd className="rounded bg-white/15 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-white/85">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Nav — filtrado por rol (RBAC). */}
      <nav data-admin-help="navigation" className="flex-1 px-3 py-3">
        <ul className="flex flex-col gap-0.5">
          {groups.map((group) => (
            <NavGroupItem
              key={group.title}
              group={group}
              activeHref={activeHref}
              unreadNotifications={unreadNotifications}
              onNavigate={onNavigate}
              open={openGroupTitle === group.title}
              onToggle={() =>
                setOpenGroupTitle((cur) => (cur === group.title ? null : group.title))
              }
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
  const initial = (admin.email[0] ?? "A").toUpperCase();
  const isSuperadmin = admin.role === "SUPERADMIN";
  const pillClass =
    FOOTER_ROLE_PILL[admin.role] ?? "bg-white/15 text-white/90 ring-1 ring-white/20";

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
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${pillClass}`}
              >
                {isSuperadmin ? (
                  <Crown className="h-2.5 w-2.5 flex-shrink-0" />
                ) : (
                  <ShieldCheck className="h-2.5 w-2.5 flex-shrink-0" />
                )}
                <span className="truncate">{roleLabel}</span>
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
                  href="/admin/seguridad"
                  onClick={() => {
                    setOpen(false);
                    onNavigate();
                  }}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <KeyRound className="h-3.5 w-3.5 flex-shrink-0 opacity-75" />
                  Seguridad y clave
                </Link>
                <Link
                  href="/admin/ayuda"
                  onClick={() => {
                    setOpen(false);
                    onNavigate();
                  }}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <CircleHelp className="h-3.5 w-3.5 flex-shrink-0 opacity-75" />
                  Centro de ayuda
                </Link>
                <div className="mx-2 my-1 border-t border-white/10" />
                <form action={adminLogoutAction}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-rose-200 transition-colors hover:bg-rose-500/20 hover:text-white"
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

// Item del nav cuyo badge numérico muestra las notificaciones NO leídas
// (centro de notificaciones 2026-08-05). NavBadge (soon/phase) no sirve para
// esto: esos tonos deshabilitan el link — este pill es informativo, no de estado.
const NOTIFICATIONS_HREF = "/admin/notificaciones";

function UnreadNotificationsPill({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Hint content={`${count} sin leer`}>
      <span
        className="bg-brand-pink min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] leading-none font-bold text-white"
        aria-label={`${count} notificaciones sin leer`}
      >
        {count > 99 ? "99+" : count}
      </span>
    </Hint>
  );
}

function NavGroupItem({
  group,
  activeHref,
  unreadNotifications,
  onNavigate,
  open,
  onToggle,
}: {
  group: NavGroup;
  activeHref: string | null;
  unreadNotifications: number;
  onNavigate: () => void;
  /** Acordeón exclusivo: estado elevado a SidebarContent. */
  open: boolean;
  onToggle: () => void;
}) {
  if (!group.items) {
    const isActive = group.href != null && group.href === activeHref;
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
          {group.href === NOTIFICATIONS_HREF && (
            <UnreadNotificationsPill count={unreadNotifications} />
          )}
        </Link>
      </li>
    );
  }

  return (
    <NavGroupExpandable
      group={group}
      activeHref={activeHref}
      unreadNotifications={unreadNotifications}
      onNavigate={onNavigate}
      open={open}
      onToggle={onToggle}
    />
  );
}

function NavGroupExpandable({
  group,
  activeHref,
  unreadNotifications,
  onNavigate,
  open,
  onToggle,
}: {
  group: NavGroup;
  activeHref: string | null;
  unreadNotifications: number;
  onNavigate: () => void;
  /** Controlado desde SidebarContent (acordeón exclusivo). */
  open: boolean;
  onToggle: () => void;
}) {
  const items = group.items ?? [];
  const hasActive = items.some((it) => it.href === activeHref);
  const Icon = group.icon;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
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
            const isActive = it.href === activeHref;
            const isSoon =
              it.badge?.tone === "soon" ||
              it.badge?.tone === "phase4" ||
              it.badge?.tone === "phase5";
            const ItemIcon = it.icon;
            return (
              <li key={it.href}>
                {isSoon ? (
                  <Hint content="Próximamente disponible">
                    <div
                      tabIndex={0}
                      className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-white/55"
                    >
                      <ItemIcon className="h-3.5 w-3.5" />
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.badge && <BadgePill badge={it.badge} />}
                    </div>
                  </Hint>
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
                    {it.href === NOTIFICATIONS_HREF && (
                      <UnreadNotificationsPill count={unreadNotifications} />
                    )}
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

// ─────────────────── Command Palette (⌘K / Ctrl+K) ───────────────────

function AdminCommandPalette({
  open,
  onOpenChange,
  query,
  onQueryChange,
  activeIndex,
  onActiveIndexChange,
  role,
  pathname,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  query: string;
  onQueryChange: (q: string) => void;
  activeIndex: number;
  onActiveIndexChange: (idx: number) => void;
  role: AdminRole;
  pathname: string;
}) {
  const router = useRouter();

  const allEntries = useMemo<CommandEntry[]>(() => {
    const visibleGroups = filterNavByRole(NAV, role);
    const items: CommandEntry[] = [];
    const seen = new Set<string>();

    for (const g of visibleGroups) {
      const isGroupSoon =
        g.badge?.tone === "soon" || g.badge?.tone === "phase4" || g.badge?.tone === "phase5";
      if (!g.items && g.href && !isGroupSoon) {
        seen.add(g.href);
        items.push({
          key: g.href,
          label: g.title,
          group: "Acceso directo",
          description: g.description,
          href: g.href,
          icon: g.icon,
        });
      }
      if (g.items) {
        for (const it of g.items) {
          const isSoon =
            it.badge?.tone === "soon" || it.badge?.tone === "phase4" || it.badge?.tone === "phase5";
          if (isSoon || seen.has(it.href)) continue;
          seen.add(it.href);
          items.push({
            key: it.href,
            label: it.label,
            group: g.title,
            description: it.description,
            href: it.href,
            icon: it.icon,
          });
        }
      }
    }

    if (
      !seen.has("/admin/clientes/duplicados") &&
      canAccessAdminPath(role, "/admin/clientes/duplicados")
    ) {
      seen.add("/admin/clientes/duplicados");
      items.push({
        key: "/admin/clientes/duplicados",
        label: "Fusión de contactos duplicados",
        group: "Ventas · CRM",
        description:
          "Cola de posibles duplicados de Contact 360 con confirmación MFA para fusionar o descartar.",
        href: "/admin/clientes/duplicados",
        icon: Users,
      });
    }
    if (
      isCatalogMode() &&
      !seen.has("/admin/cotizaciones") &&
      canAccessAdminPath(role, "/admin/cotizaciones")
    ) {
      seen.add("/admin/cotizaciones");
      items.push({
        key: "/admin/cotizaciones",
        label: "Cotizaciones WhatsApp",
        group: "Ventas · CRM",
        description:
          "Bandeja consultiva e histórico Etapa 1: seguimiento comercial y conversión a pedido u oportunidad B2B.",
        href: "/admin/cotizaciones",
        icon: FileText,
      });
    }
    if (!seen.has("/admin/ayuda")) {
      items.push({
        key: "/admin/ayuda",
        label: "Centro de ayuda",
        group: "Soporte interno",
        description: "Guías operativas y flujos paso a paso para tu rol.",
        href: "/admin/ayuda",
        icon: CircleHelp,
      });
    }
    items.push({
      key: "ext-storefront",
      label: "Ver tienda pública",
      group: "Tienda",
      description: "Abre el escaparate público de Lucams Shop en una nueva pestaña.",
      href: "/",
      icon: ExternalLink,
      external: true,
    });

    return items;
  }, [role]);

  const filtered = useMemo(() => {
    const q = normalizeSearchText(query);
    if (!q) return allEntries;
    const tokens = q.split(/\s+/).filter(Boolean);
    return allEntries.filter((entry) => {
      const haystack = normalizeSearchText(
        `${entry.label} ${entry.group} ${entry.description ?? ""} ${entry.href}`,
      );
      return tokens.every((t) => haystack.includes(t));
    });
  }, [allEntries, query]);

  const safeIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  function executeEntry(entry: CommandEntry | undefined) {
    if (!entry) return;
    onOpenChange(false);
    if (entry.external) {
      window.open(entry.href, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(entry.href);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="border-brand-purple/20 max-w-xl gap-0 overflow-hidden rounded-2xl border bg-white p-0 shadow-2xl sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Buscador rápido del panel admin</DialogTitle>
        <DialogDescription className="sr-only">
          Busca y salta a cualquier módulo autorizado de tu rol usando el teclado.
        </DialogDescription>

        {/* Barra de entrada */}
        <div className="border-brand-purple/10 flex items-center gap-3 border-b px-4 py-3">
          <Search className="text-brand-purple h-4 w-4 flex-shrink-0" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (filtered.length > 0) {
                  onActiveIndexChange((safeIndex + 1) % filtered.length);
                }
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (filtered.length > 0) {
                  onActiveIndexChange((safeIndex - 1 + filtered.length) % filtered.length);
                }
              } else if (e.key === "Enter") {
                e.preventDefault();
                executeEntry(filtered[safeIndex]);
              }
            }}
            placeholder="Ir a pedidos, seguridad, inventario, auditoría…"
            className="text-brand-purple-dark h-7 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100"
          >
            ESC
          </button>
        </div>

        {/* Lista de resultados */}
        <div className="max-h-80 overflow-y-auto p-2" role="listbox" aria-label="Módulos">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-500">
              No hay módulos autorizados que coincidan con{" "}
              <strong className="text-brand-purple-dark">«{query}»</strong>.
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((entry, idx) => {
                const Icon = entry.icon;
                const isSelected = idx === safeIndex;
                const isCurrent = !entry.external && pathname === entry.href;
                return (
                  <li key={entry.key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => onActiveIndexChange(idx)}
                      onClick={() => executeEntry(entry)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        isSelected
                          ? "bg-brand-purple/10 text-brand-purple-dark"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                          isSelected
                            ? "bg-brand-purple text-white shadow-xs"
                            : "bg-brand-purple/8 text-brand-purple"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold">{entry.label}</span>
                          <span className="text-brand-muted truncate text-[10px] font-medium">
                            · {entry.group}
                          </span>
                          {isCurrent && (
                            <span className="bg-brand-purple/15 text-brand-purple-dark rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                              Actual
                            </span>
                          )}
                        </div>
                        {entry.description && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                            {entry.description}
                          </p>
                        )}
                      </div>
                      {entry.external ? (
                        <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                      ) : (
                        <CornerDownLeft
                          className={`h-3.5 w-3.5 flex-shrink-0 transition-opacity ${
                            isSelected ? "text-brand-purple opacity-100" : "opacity-0"
                          }`}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Leyenda inferior */}
        <div className="border-brand-purple/10 flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50/70 px-4 py-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-sans text-[10px] font-semibold">
                ↑↓
              </kbd>{" "}
              navegar
            </span>
            <span>
              <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-sans text-[10px] font-semibold">
                ↵
              </kbd>{" "}
              abrir
            </span>
          </div>
          <span className="text-brand-purple-dark/70 font-medium">
            Vista filtrada para {adminRoleLabel(role)}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
