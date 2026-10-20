"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Package,
  Palette,
  Heart,
  MapPin,
  Star,
  Ticket,
  User,
  LifeBuoy,
  ShieldCheck,
} from "lucide-react";
import type { AccountTexts } from "./account-texts";

/**
 * Navegación del área de cuenta (storefront, NO admin). Barra de pestañas
 * horizontal scrolleable en móvil. Marca la sección activa por pathname:
 * exacta para "Resumen" (/mi-cuenta), por prefijo para el resto (para que el
 * detalle /mi-cuenta/pedidos/[number] mantenga "Pedidos" activo).
 *
 * Las etiquetas vienen del CMS (roadmap B9) — el layout las resuelve en server;
 * su largo es desconocido, así que nada acá depende de medidas fijas.
 *
 * 2026-10-20 — affordances de overflow en móvil (antes la barra scrolleaba
 * "a ciegas"): máscara con fade en el borde que tiene más contenido (solo
 * cuando HAY overflow real en esa dirección), scroll suave + snap por pestaña,
 * scrollbar oculta y la pestaña activa se auto-centra al entrar/cambiar de
 * sección (un deep-link ya no deja la activa fuera de pantalla).
 */
export function AccountNav({ labels }: { labels: AccountTexts["nav"] }) {
  const TABS = [
    { href: "/mi-cuenta", label: labels.resumen, icon: LayoutDashboard, exact: true },
    { href: "/mi-cuenta/pedidos", label: labels.pedidos, icon: Package },
    { href: "/mi-cuenta/disenos", label: labels.disenos, icon: Palette },
    { href: "/mi-cuenta/favoritos", label: labels.favoritos, icon: Heart },
    { href: "/mi-cuenta/direcciones", label: labels.direcciones, icon: MapPin },
    { href: "/mi-cuenta/resenas", label: labels.resenas, icon: Star },
    { href: "/mi-cuenta/cupones", label: labels.cupones, icon: Ticket },
    { href: "/mi-cuenta/perfil", label: labels.perfil, icon: User },
    { href: "/mi-cuenta/soporte", label: labels.soporte, icon: LifeBuoy },
    { href: "/mi-cuenta/seguridad", label: labels.seguridad, icon: ShieldCheck },
  ] as const;
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  // Bordes con más contenido scrolleable (alimentan el fade). Estado, no valor
  // derivado del render: scrollWidth/scrollLeft solo existen post-mount.
  const [edges, setEdges] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => {
      setEdges({
        left: list.scrollLeft > 1,
        right: list.scrollLeft + list.clientWidth < list.scrollWidth - 1,
      });
    };
    update();
    list.addEventListener("scroll", update, { passive: true });
    // ResizeObserver cubre rotación del teléfono, zoom del navegador y el
    // cambio de largo de las etiquetas CMS; el resize de ventana es el
    // fallback donde no exista (jsdom, navegadores muy viejos).
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(list);
      return () => {
        list.removeEventListener("scroll", update);
        ro.disconnect();
      };
    }
    window.addEventListener("resize", update);
    return () => {
      list.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // Auto-centrar la pestaña activa al montar y al cambiar de sección. El
  // scroll-smooth del contenedor anima el salto; block:"nearest" evita
  // mover el scroll vertical de la página.
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [pathname]);

  // Máscara de fade por borde: transparente donde hay más contenido. Se aplica
  // al <ul> (la máscara es fija respecto al viewport del scroll, el contenido
  // se desvanece al salir) — sin overlays que tapen el fondo translúcido.
  const maskImage =
    edges.left && edges.right
      ? "linear-gradient(to right, transparent, black 2rem, black calc(100% - 2rem), transparent)"
      : edges.left
        ? "linear-gradient(to right, transparent, black 2rem)"
        : edges.right
          ? "linear-gradient(to right, black calc(100% - 2rem), transparent)"
          : undefined;

  return (
    <nav
      aria-label={labels.aria}
      className="border-brand-purple/10 border-b bg-white/70 backdrop-blur-sm"
    >
      <div className="mx-auto max-w-4xl px-2">
        <ul
          ref={listRef}
          className="flex snap-x snap-proximity [scrollbar-width:none] gap-1 overflow-x-auto scroll-smooth [&::-webkit-scrollbar]:hidden"
          style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
        >
          {TABS.map((t) => {
            const active =
              "exact" in t && t.exact ? pathname === t.href : pathname.startsWith(t.href);
            const Icon = t.icon;
            return (
              <li key={t.href} className="flex-shrink-0 snap-start">
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
