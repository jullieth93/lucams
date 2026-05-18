/*
 * <AdminShell /> — Layout shell del panel admin con sidebar permanente.
 *
 * PLAN_CATALOG_V2 8.1 + redesign 2026-05-18 (basado en commerce-ops-platform
 * patrón sidebar v2 — 11 áreas top-level con grupos colapsables).
 *
 * Filosofía:
 *   - Items leaf (sin sub-items) vs grupos colapsables (con 2+ sub-items).
 *   - Badges visuales [Próximo], [Fase 4], [Fase 5], [Fase 5+] para roadmap honesto.
 *   - Paleta brand Lucams (morado/rosa/turquesa), no slate genérico.
 *   - Top bar con indicador "Live" del sistema.
 *   - Footer con avatar + email + rol + plan + dropdown.
 *
 * Mobile: drawer slide-in + topbar siempre visible.
 * UX no-técnico aplicado: labels español llano, tuteo, fechas humanas.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LogOut,
  ExternalLink,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Circle,
  // Áreas top-level
  LayoutDashboard,
  ShoppingCart,
  Package,
  Ticket,
  Factory,
  Globe,
  DollarSign,
  BrainCircuit,
  BarChart2,
  Settings,
  MessageSquare,
  // Sub-items
  Box,
  Users,
  AlertCircle,
  Star,
  Layers,
  Tag,
  Sparkles,
  Wand2,
  Building2,
  ArrowRightLeft,
  Boxes,
  Calculator,
  Store,
  ShoppingBag,
  BookOpen,
  Bot,
  TrendingUp,
  Gauge,
  Activity,
  Cog,
  UserPlus,
  Plug,
  Mail,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/auth/logout/actions";

type AdminInfo = {
  email: string;
  role: string;
};

type Badge = { text: string; tone: "soon" | "phase4" | "phase5" };

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: Badge;
};

type NavGroup = {
  title: string;
  icon: LucideIcon;
  items?: NavItem[]; // si está → es grupo colapsable
  href?: string; // si está y no hay items → es leaf
  badge?: Badge;
  defaultOpen?: boolean;
};

const NAV: NavGroup[] = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    href: "/admin/dashboard",
  },
  {
    title: "Ventas",
    icon: ShoppingCart,
    defaultOpen: true,
    items: [
      {
        label: "Pedidos",
        href: "/admin/pedidos",
        icon: Box,
        badge: { text: "Fase 4", tone: "phase4" },
      },
      {
        label: "Clientes",
        href: "/admin/clientes",
        icon: Users,
        badge: { text: "Próximo", tone: "soon" },
      },
      {
        label: "Reclamos",
        href: "/admin/reclamos",
        icon: AlertCircle,
        badge: { text: "Fase 4", tone: "phase4" },
      },
      {
        label: "Reseñas",
        href: "/admin/resenas",
        icon: Star,
        badge: { text: "Próximo", tone: "soon" },
      },
    ],
  },
  {
    title: "Catálogo",
    icon: Package,
    defaultOpen: true,
    items: [
      { label: "Productos", href: "/admin/productos", icon: ShoppingBag },
      { label: "Categorías", href: "/admin/categorias", icon: Layers },
      { label: "Ocasiones", href: "/admin/ocasiones", icon: Tag },
      {
        label: "Plantillas",
        href: "/admin/plantillas",
        icon: Sparkles,
        badge: { text: "Próximo", tone: "soon" },
      },
      {
        label: "Recomendaciones",
        href: "/admin/recomendaciones",
        icon: Wand2,
        badge: { text: "Fase 4", tone: "phase4" },
      },
    ],
  },
  {
    title: "Comercial",
    icon: Ticket,
    items: [
      { label: "Cupones", href: "/admin/cupones", icon: Ticket },
      {
        label: "Mayorista B2B",
        href: "/admin/mayorista",
        icon: Building2,
        badge: { text: "Próximo", tone: "soon" },
      },
      {
        label: "Redirects 301",
        href: "/admin/redirects",
        icon: ArrowRightLeft,
        badge: { text: "Próximo", tone: "soon" },
      },
    ],
  },
  {
    title: "Producción",
    icon: Factory,
    items: [
      {
        label: "Materiales e Insumos",
        href: "/admin/materiales",
        icon: Boxes,
        badge: { text: "Fase 5", tone: "phase5" },
      },
      {
        label: "Costos de fabricación",
        href: "/admin/costos",
        icon: Calculator,
        badge: { text: "Fase 5", tone: "phase5" },
      },
    ],
  },
  {
    title: "Canales",
    icon: Globe,
    items: [
      {
        label: "Tienda Lucams",
        href: "/admin/canales/tienda",
        icon: Store,
        badge: { text: "Próximo", tone: "soon" },
      },
      {
        label: "Mercado Libre",
        href: "/admin/canales/mercadolibre",
        icon: ShoppingBag,
        badge: { text: "Próximo", tone: "soon" },
      },
    ],
  },
  {
    title: "Finanzas",
    icon: DollarSign,
    href: "/admin/finanzas",
    badge: { text: "Próximo", tone: "soon" },
  },
  {
    title: "IA y Conocimiento",
    icon: BrainCircuit,
    items: [
      { label: "Base de conocimiento", href: "/admin/contenido/bloques", icon: BookOpen },
      {
        label: "Bot WhatsApp",
        href: "/admin/bot",
        icon: Bot,
        badge: { text: "Fase 5+", tone: "phase5" },
      },
    ],
  },
  {
    title: "Analítica",
    icon: BarChart2,
    items: [
      {
        label: "Métricas",
        href: "/admin/metricas",
        icon: TrendingUp,
        badge: { text: "Fase 4", tone: "phase4" },
      },
      {
        label: "Performance",
        href: "/admin/performance",
        icon: Gauge,
        badge: { text: "Próximo", tone: "soon" },
      },
      { label: "Auditoría", href: "/admin/auditoria", icon: Activity },
    ],
  },
  {
    title: "Configuración",
    icon: Settings,
    items: [
      { label: "General", href: "/admin/contenido/configuracion", icon: Cog },
      {
        label: "Usuarios y acceso",
        href: "/admin/usuarios",
        icon: UserPlus,
        badge: { text: "Próximo", tone: "soon" },
      },
      {
        label: "Integraciones",
        href: "/admin/integraciones",
        icon: Plug,
        badge: { text: "Próximo", tone: "soon" },
      },
      {
        label: "Plantillas de correo",
        href: "/admin/email-templates",
        icon: Mail,
        badge: { text: "Próximo", tone: "soon" },
      },
    ],
  },
  {
    title: "Mensajes",
    icon: MessageSquare,
    href: "/admin/mensajes",
    badge: { text: "Opcional", tone: "soon" },
  },
];

// ─────────────────── Shell ───────────────────

export function AdminShell({ admin, children }: { admin: AdminInfo; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="bg-brand-cream/40 lg:flex lg:min-h-screen">
      {/* Sidebar desktop */}
      <aside className="border-brand-purple/15 hidden bg-white lg:flex lg:w-64 lg:flex-shrink-0 lg:flex-col lg:border-r">
        <SidebarContent admin={admin} pathname={pathname} onNavigate={() => {}} />
      </aside>

      {/* Topbar mobile */}
      <div className="border-brand-purple/15 sticky top-0 z-30 flex items-center justify-between border-b bg-white px-4 py-3 lg:hidden">
        <Link href="/admin/dashboard" className="flex items-center gap-2">
          <BrandIcon />
          <div>
            <p className="text-brand-purple-dark/50 text-[10px] font-semibold tracking-wider uppercase">
              Admin
            </p>
            <p className="font-display text-brand-purple-dark text-sm leading-tight font-bold">
              Lucams
            </p>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="text-brand-purple-dark hover:bg-brand-purple/10 rounded-md p-2"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Drawer mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute top-0 left-0 flex h-full w-72 flex-col bg-white shadow-xl">
            <div className="border-brand-purple/10 flex items-center justify-end border-b px-3 py-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="text-brand-purple-dark hover:bg-brand-purple/10 rounded-md p-1.5"
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
        <AdminTopBar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

// ─────────────────── TopBar con indicador Live ───────────────────

function AdminTopBar() {
  return (
    <div className="border-brand-purple/10 sticky top-0 z-20 hidden h-12 items-center justify-between border-b bg-white/90 px-6 backdrop-blur lg:flex">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="font-semibold tracking-wider uppercase">Panel</span>
        <span className="text-brand-purple/40">·</span>
        <span>Lucams_shop</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-medium text-emerald-700">Live</span>
      </div>
    </div>
  );
}

// ─────────────────── Brand icon ───────────────────

function BrandIcon() {
  return (
    <div className="from-brand-purple via-brand-pink to-brand-coral flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm">
      <Sparkles className="h-4 w-4 text-white" />
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
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header brand */}
      <Link
        href="/admin/dashboard"
        onClick={onNavigate}
        className="border-brand-purple/10 hover:bg-brand-purple/5 block border-b px-5 py-4 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <BrandIcon />
          <div>
            <p className="text-brand-purple-dark/50 text-[10px] font-semibold tracking-wider uppercase">
              Panel admin
            </p>
            <p className="font-display text-brand-purple-dark text-lg leading-tight font-bold">
              Lucams
            </p>
          </div>
        </div>
      </Link>

      {/* User info */}
      <div className="border-brand-purple/10 from-brand-purple/5 to-brand-pink/5 border-b bg-gradient-to-br px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="from-brand-turquoise to-brand-purple flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white">
            {admin.email[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-brand-purple-dark truncate text-xs font-semibold">
              {admin.email.split("@")[0]}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="bg-brand-purple/15 text-brand-purple-dark rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase">
                {admin.role}
              </span>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-amber-700 uppercase">
                Free
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3">
        <ul className="flex flex-col gap-0.5">
          {NAV.map((group) => (
            <NavGroupItem
              key={group.title}
              group={group}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      </nav>

      {/* Footer actions */}
      <div className="border-brand-purple/10 bg-brand-cream/30 border-t px-3 py-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="text-brand-purple-dark hover:bg-brand-purple/10 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Ver el sitio
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-rose-600 transition-colors hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────── NavGroupItem (leaf O grupo colapsable) ───────────────────

function NavGroupItem({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate: () => void;
}) {
  // Leaf: sin items
  if (!group.items) {
    const isActive = group.href
      ? pathname === group.href || pathname.startsWith(group.href + "/")
      : false;
    const Icon = group.icon;
    return (
      <li>
        <Link
          href={group.href ?? "#"}
          onClick={onNavigate}
          className={`flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors ${
            isActive
              ? "bg-brand-purple/12 text-brand-purple-dark font-semibold"
              : "text-brand-purple-dark/85 hover:bg-brand-purple/8"
          }`}
        >
          <Icon className={`h-4 w-4 ${isActive ? "text-brand-purple" : "text-brand-purple/65"}`} />
          <span className="flex-1">{group.title}</span>
          {group.badge && <BadgePill badge={group.badge} />}
        </Link>
      </li>
    );
  }

  // Grupo colapsable: con items
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
        className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors ${
          hasActive
            ? "text-brand-purple-dark font-semibold"
            : "text-brand-purple-dark/85 hover:bg-brand-purple/8"
        }`}
      >
        <Icon className={`h-4 w-4 ${hasActive ? "text-brand-purple" : "text-brand-purple/65"}`} />
        <span className="flex-1 text-left">{group.title}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="border-brand-purple/15 mt-0.5 ml-3 flex flex-col gap-0.5 border-l pl-2">
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
                    className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-slate-400"
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
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                      isActive
                        ? "bg-brand-purple/12 text-brand-purple-dark font-semibold"
                        : "text-brand-purple-dark/80 hover:bg-brand-purple/8"
                    }`}
                  >
                    <ItemIcon
                      className={`h-3.5 w-3.5 ${isActive ? "text-brand-purple" : "text-brand-purple/55"}`}
                    />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.badge && <BadgePill badge={it.badge} />}
                    {isActive && <ChevronRight className="h-3 w-3" />}
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
    soon: "bg-slate-100 text-slate-500",
    phase4: "bg-amber-100 text-amber-700",
    phase5: "bg-indigo-100 text-indigo-700",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase ${styles[badge.tone]}`}
    >
      {badge.text}
    </span>
  );
}

// Suppress unused import warning (kept for future "live status" expansion)
void Circle;
