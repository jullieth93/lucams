"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Palette, Heart, MapPin, Star, ShieldCheck } from "lucide-react";
import type { AccountTexts } from "./account-texts";

/**
 * Navegación del área de cuenta (storefront, NO admin). Barra de pestañas
 * horizontal scrolleable en móvil. Marca la sección activa por pathname:
 * exacta para "Resumen" (/mi-cuenta), por prefijo para el resto (para que el
 * detalle /mi-cuenta/pedidos/[number] mantenga "Pedidos" activo).
 *
 * Las etiquetas vienen del CMS (roadmap B9) — el layout las resuelve en server.
 */
export function AccountNav({ labels }: { labels: AccountTexts["nav"] }) {
  const TABS = [
    { href: "/mi-cuenta", label: labels.resumen, icon: LayoutDashboard, exact: true },
    { href: "/mi-cuenta/pedidos", label: labels.pedidos, icon: Package },
    { href: "/mi-cuenta/disenos", label: labels.disenos, icon: Palette },
    { href: "/mi-cuenta/favoritos", label: labels.favoritos, icon: Heart },
    { href: "/mi-cuenta/direcciones", label: labels.direcciones, icon: MapPin },
    { href: "/mi-cuenta/resenas", label: labels.resenas, icon: Star },
    { href: "/mi-cuenta/seguridad", label: labels.seguridad, icon: ShieldCheck },
  ] as const;
  const pathname = usePathname();

  return (
    <nav
      aria-label={labels.aria}
      className="border-brand-purple/10 border-b bg-white/70 backdrop-blur-sm"
    >
      <div className="mx-auto max-w-4xl px-2">
        <ul className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const active =
              "exact" in t && t.exact ? pathname === t.href : pathname.startsWith(t.href);
            const Icon = t.icon;
            return (
              <li key={t.href} className="flex-shrink-0">
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${
                    active
                      ? "border-brand-purple text-brand-purple-dark"
                      : "text-brand-muted hover:text-brand-purple-dark border-transparent"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
