/*
 * <AdminShell /> — Layout shell del panel admin con sidebar permanente.
 *
 * PLAN_CATALOG_V2 decisión 8.1 — sidebar agrupado en 5 grupos:
 *   1. Catálogo  (Categorías · Productos · Plantillas · Ocasiones)
 *   2. Comercial (Cupones · Recomendaciones · Mayorista B2B)
 *   3. Operación (Pedidos · Logística · Redirects)
 *   4. Contenido (CMS Blocks · Configuración)
 *   5. Sistema   (Auditoría · Errores · Performance)
 *
 * Mobile: drawer slide-in con mismos grupos.
 * UX no-técnico (memoria feedback_admin_ux_no_tecnico): labels español llano,
 * tuteo, fechas humanas, notices visuales, badges contextuales.
 *
 * El admin.email + role se muestran arriba del sidebar. Logout disponible.
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
  ChevronRight,
  // Catálogo
  Layers,
  Package,
  Sparkles,
  Tag,
  // Comercial
  Ticket,
  Wand2,
  Building2,
  // Operación
  ShoppingCart,
  Truck,
  ArrowRightLeft,
  // Contenido
  FileText,
  Settings,
  // Sistema
  Activity,
  AlertCircle,
  Gauge,
  Home,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/auth/logout/actions";

type AdminInfo = {
  email: string;
  role: string;
};

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: { text: string; tone: "neutral" | "warning" | "soon" };
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Catálogo",
    items: [
      { label: "Categorías", href: "/admin/categorias", icon: Layers },
      { label: "Productos", href: "/admin/productos", icon: Package },
      {
        label: "Plantillas",
        href: "/admin/plantillas",
        icon: Sparkles,
        badge: { text: "Próximo", tone: "soon" },
      },
      { label: "Ocasiones", href: "/admin/ocasiones", icon: Tag },
    ],
  },
  {
    title: "Comercial",
    items: [
      { label: "Cupones", href: "/admin/cupones", icon: Ticket },
      {
        label: "Recomendaciones",
        href: "/admin/recomendaciones",
        icon: Wand2,
        badge: { text: "Próximo", tone: "soon" },
      },
      {
        label: "Mayorista B2B",
        href: "/admin/mayorista",
        icon: Building2,
        badge: { text: "Próximo", tone: "soon" },
      },
    ],
  },
  {
    title: "Operación",
    items: [
      {
        label: "Pedidos",
        href: "/admin/pedidos",
        icon: ShoppingCart,
        badge: { text: "Fase 4", tone: "soon" },
      },
      {
        label: "Logística",
        href: "/admin/logistica",
        icon: Truck,
        badge: { text: "Próximo", tone: "soon" },
      },
      {
        label: "Redirects",
        href: "/admin/redirects",
        icon: ArrowRightLeft,
        badge: { text: "Próximo", tone: "soon" },
      },
    ],
  },
  {
    title: "Contenido",
    items: [
      { label: "Bloques CMS", href: "/admin/contenido", icon: FileText },
      { label: "Configuración", href: "/admin/contenido/configuracion", icon: Settings },
    ],
  },
  {
    title: "Sistema",
    items: [
      { label: "Auditoría", href: "/admin/auditoria", icon: Activity },
      {
        label: "Errores",
        href: "/admin/errores",
        icon: AlertCircle,
        badge: { text: "Próximo", tone: "soon" },
      },
      {
        label: "Performance",
        href: "/admin/performance",
        icon: Gauge,
        badge: { text: "Próximo", tone: "soon" },
      },
    ],
  },
];

export function AdminShell({ admin, children }: { admin: AdminInfo; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="bg-slate-50 lg:flex lg:min-h-screen">
      {/* Sidebar desktop */}
      <aside className="hidden border-r border-slate-200 bg-white lg:flex lg:w-64 lg:flex-shrink-0 lg:flex-col">
        <SidebarContent
          admin={admin}
          pathname={pathname}
          onNavigate={() => {
            /* desktop sin drawer */
          }}
        />
      </aside>

      {/* Topbar mobile */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Link href="/admin/dashboard" className="flex items-center gap-2">
          <div className="bg-brand-purple/10 rounded-md p-1.5">
            <Home className="text-brand-purple h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] tracking-wider text-slate-500 uppercase">Admin</p>
            <p className="text-sm leading-tight font-bold text-slate-900">Lucams</p>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Drawer mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute top-0 left-0 flex h-full w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-end border-b border-slate-200 px-3 py-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
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
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}

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
        className="block border-b border-slate-200 px-5 py-4 transition-colors hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <div className="from-brand-purple to-brand-pink rounded-md bg-gradient-to-br p-1.5">
            <Home className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-[10px] tracking-wider text-slate-500 uppercase">Panel admin</p>
            <p className="font-display text-base leading-tight font-bold text-slate-900">Lucams</p>
          </div>
        </div>
      </Link>

      {/* User info */}
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
        <p className="truncate text-xs text-slate-600">{admin.email}</p>
        <span className="bg-brand-purple/10 text-brand-purple mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase">
          {admin.role}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-5">
            <p className="mb-1.5 px-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              {group.title}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const isSoon = item.badge?.tone === "soon";
                return (
                  <li key={item.href}>
                    {isSoon ? (
                      <div
                        className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-slate-400"
                        title="Próximamente disponible"
                      >
                        <Icon className="h-4 w-4" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
                            {item.badge.text}
                          </span>
                        )}
                      </div>
                    ) : (
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                          isActive
                            ? "bg-brand-purple/10 text-brand-purple-dark font-semibold"
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${isActive ? "text-brand-purple" : "text-slate-500"}`}
                        />
                        <span className="flex-1">{item.label}</span>
                        {isActive && <ChevronRight className="h-3 w-3" />}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer actions */}
      <div className="border-t border-slate-200 px-3 py-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          <ExternalLink className="h-4 w-4 text-slate-500" />
          Ir al sitio
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
