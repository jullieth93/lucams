/*
 * <ShopMegaMenu /> — Mega-menú jerárquico del header (PLAN_CATALOG_V2 1.4).
 *
 * Desktop: NavigationMenu Radix con grid 3 columnas mostrando categorías raíz
 *   + sub-categorías agrupadas debajo de cada padre + chip "Por ocasión" al pie.
 * Mobile: Sheet drawer slide-in con expansión por categoría (acordeón).
 *
 * Consume CategoryNode tree (server-side fetch).
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Camera,
  PartyPopper,
  Calendar,
  ClipboardList,
  Bookmark,
  Frame,
  Gift,
  Snowflake,
  Sparkles,
  GraduationCap,
  Briefcase,
  Menu,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { CategoryNode } from "@/lib/catalog";

const ICONS: Record<string, LucideIcon> = {
  "foto-imanes": Camera,
  recuerdos: PartyPopper,
  calendarios: Calendar,
  publicitarios: Briefcase,
  organizate: ClipboardList,
  "regalos-personalizados": Gift,
  "de-temporada": Snowflake,
  "cuadros-decoracion": Frame,
  separadores: Bookmark,
  coleccionables: Sparkles,
  "juegos-aprendizaje": GraduationCap,
};

const TOP_OCASIONES = [
  { slug: "cumpleanos", label: "Cumpleaños" },
  { slug: "matrimonio", label: "Matrimonio" },
  { slug: "dia-madre", label: "Día Madre" },
  { slug: "dia-padre", label: "Día Padre" },
  { slug: "navidad", label: "Navidad" },
  { slug: "empresarial", label: "Empresarial" },
];

export function ShopMegaMenu({ tree }: { tree: CategoryNode[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleCategories = tree.filter((c) => c.isActive);

  return (
    <>
      {/* Desktop */}
      <div className="hidden sm:block">
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger className="text-brand-purple-dark data-[active]:text-brand-purple-dark data-[state=open]:text-brand-purple-dark hover:text-brand-purple bg-transparent text-sm font-medium hover:bg-transparent">
                Tienda
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="w-[820px] p-5">
                  <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                    {visibleCategories.map((cat) => {
                      const Icon = ICONS[cat.slug] ?? Camera;
                      const activeSubCats = cat.children.filter((s) => s.isActive);
                      return (
                        <div key={cat.slug} className="flex flex-col">
                          <Link
                            href={`/productos?categoria=${cat.slug}`}
                            className="group hover:bg-brand-purple/5 flex items-start gap-2 rounded-lg p-2 transition-colors"
                          >
                            <span className="bg-brand-purple/10 group-hover:bg-brand-purple/20 rounded-md p-1.5 transition-colors">
                              <Icon className="text-brand-purple h-4 w-4" />
                            </span>
                            <span className="flex flex-1 flex-col">
                              <span className="text-brand-purple-dark text-sm font-bold">
                                {cat.name}
                              </span>
                              <span className="text-brand-purple-dark/55 text-[10px]">
                                {cat.productCount}{" "}
                                {cat.productCount === 1 ? "producto" : "productos"}
                              </span>
                            </span>
                          </Link>
                          {activeSubCats.length > 0 && (
                            <ul className="mt-1 ml-9 flex flex-col gap-0.5">
                              {activeSubCats.slice(0, 6).map((sub) => (
                                <li key={sub.slug}>
                                  <Link
                                    href={`/productos/${cat.slug}/${sub.slug}`}
                                    className="text-brand-purple-dark/75 hover:text-brand-purple block text-xs"
                                  >
                                    {sub.name}
                                  </Link>
                                </li>
                              ))}
                              {activeSubCats.length > 6 && (
                                <li>
                                  <Link
                                    href={`/productos?categoria=${cat.slug}`}
                                    className="text-brand-purple block text-xs font-semibold"
                                  >
                                    +{activeSubCats.length - 6} más →
                                  </Link>
                                </li>
                              )}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-brand-purple/10 mt-4 border-t pt-4">
                    <p className="text-brand-purple/60 mb-2 text-[10px] font-bold tracking-wider uppercase">
                      Por ocasión
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {TOP_OCASIONES.map((o) => (
                        <Link
                          key={o.slug}
                          href={`/ocasion/${o.slug}`}
                          className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/10 rounded-full border bg-white px-2.5 py-0.5 text-xs"
                        >
                          {o.label}
                        </Link>
                      ))}
                      <Link
                        href="/recomendador"
                        className="bg-brand-purple inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                      >
                        <Sparkles className="h-3 w-3" /> ¿Te ayudamos?
                      </Link>
                    </div>
                  </div>

                  <Link
                    href="/productos"
                    className="text-brand-purple hover:text-brand-purple-dark mt-4 block text-center text-sm font-semibold"
                  >
                    Ver todo el catálogo →
                  </Link>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Abrir menú"
            className="text-brand-purple-dark hover:text-brand-purple hover:bg-brand-purple/5 inline-flex items-center justify-center rounded-md p-1.5 sm:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[300px] overflow-y-auto sm:w-[340px]">
          <SheetHeader>
            <SheetTitle className="font-display text-brand-purple-dark text-2xl">Tienda</SheetTitle>
          </SheetHeader>
          <nav className="mt-3 flex flex-col gap-0.5 px-3 pb-6">
            {visibleCategories.map((cat) => {
              const Icon = ICONS[cat.slug] ?? Camera;
              return (
                <MobileCategoryAccordion
                  key={cat.slug}
                  cat={cat}
                  Icon={Icon}
                  onNavigate={() => setMobileOpen(false)}
                />
              );
            })}
            <div className="border-brand-purple/10 mt-4 border-t pt-3">
              <p className="text-brand-purple/60 mb-2 px-2 text-[10px] font-bold tracking-wider uppercase">
                Por ocasión
              </p>
              <div className="flex flex-wrap gap-1.5 px-2">
                {TOP_OCASIONES.map((o) => (
                  <Link
                    key={o.slug}
                    href={`/ocasion/${o.slug}`}
                    onClick={() => setMobileOpen(false)}
                    className="border-brand-purple/20 text-brand-purple-dark rounded-full border bg-white px-2.5 py-1 text-xs"
                  >
                    {o.label}
                  </Link>
                ))}
              </div>
            </div>
            <Link
              href="/recomendador"
              onClick={() => setMobileOpen(false)}
              className="bg-brand-purple mt-3 inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold text-white"
            >
              <Sparkles className="h-4 w-4" /> ¿Te ayudamos a elegir?
            </Link>
            <Link
              href="/productos"
              onClick={() => setMobileOpen(false)}
              className="border-brand-purple/30 text-brand-purple-dark mt-2 rounded-md border bg-white py-2 text-center text-sm font-semibold"
            >
              Ver todo el catálogo
            </Link>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

function MobileCategoryAccordion({
  cat,
  Icon,
  onNavigate,
}: {
  cat: CategoryNode;
  Icon: LucideIcon;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeSubCats = cat.children.filter((s) => s.isActive);

  return (
    <div className="flex flex-col">
      <div className="hover:bg-brand-purple/5 flex items-center gap-2 rounded-md p-2">
        <Link
          href={`/productos?categoria=${cat.slug}`}
          onClick={onNavigate}
          className="flex flex-1 items-center gap-2"
        >
          <span className="bg-brand-purple/10 rounded-md p-1.5">
            <Icon className="text-brand-purple h-4 w-4" />
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-brand-purple-dark text-sm font-medium">{cat.name}</span>
            <span className="text-brand-purple-dark/50 text-[10px]">
              {cat.productCount} {cat.productCount === 1 ? "producto" : "productos"}
            </span>
          </span>
        </Link>
        {activeSubCats.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={`Expandir sub-categorías de ${cat.name}`}
            className="text-brand-purple-dark/60 hover:bg-brand-purple/10 rounded p-1"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>
      {expanded && activeSubCats.length > 0 && (
        <ul className="border-brand-purple/15 ml-9 flex flex-col gap-0.5 border-l pl-3">
          {activeSubCats.map((sub) => (
            <li key={sub.slug}>
              <Link
                href={`/productos/${cat.slug}/${sub.slug}`}
                onClick={onNavigate}
                className="text-brand-purple-dark/75 hover:text-brand-purple block py-1 text-xs"
              >
                {sub.name} <span className="text-[10px]">({sub.productCount})</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
