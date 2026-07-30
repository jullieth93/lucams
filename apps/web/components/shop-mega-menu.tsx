/*
 * <ShopMegaMenu /> — Mega-menú jerárquico del header (PLAN_CATALOG_V2 1.4).
 *
 * Desktop: NavigationMenu Radix con grid 3 columnas mostrando categorías raíz
 *   + sub-categorías agrupadas debajo de cada padre + chip "Por ocasión" al pie.
 * Mobile: Sheet drawer slide-in con expansión por categoría (acordeón).
 *
 * Consume CategoryNode tree (server-side fetch). Como es client component,
 * los textos CMS (header.menu.*) los resuelve el server parent (site-header)
 * y llegan por la prop `texts`.
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

// Textos del menú que vienen del CMS (header.menu.*), resueltos por el
// server parent — este client component no puede leer el CMS directamente.
// `occasions` mapea slug de ocasión → etiqueta.
export type MegaMenuTexts = {
  catalog: string;
  helpCta: string;
  helpChip: string;
  occasionsTitle: string;
  viewAll: string;
  viewAllMobile: string;
  accountTitle: string;
  accountMobile: string;
  login: string;
  signup: string;
  occasions: Record<string, string>;
};

export function ShopMegaMenu({
  tree,
  isLoggedIn,
  texts,
}: {
  tree: CategoryNode[];
  isLoggedIn: boolean;
  texts: MegaMenuTexts;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleCategories = tree.filter((c) => c.isActive);
  // Máximo 8 categorías en el menú; el resto queda detrás de "Ver todo el catálogo".
  const menuCategories = visibleCategories.slice(0, 8);

  return (
    <>
      {/* Desktop */}
      <div className="hidden sm:block">
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger className="text-brand-purple-dark data-[active]:text-brand-purple-dark data-[state=open]:text-brand-purple-dark hover:text-brand-purple bg-transparent text-sm font-medium hover:bg-transparent">
                {texts.catalog}
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="max-h-[80vh] w-[820px] overflow-y-auto p-5">
                  <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                    {menuCategories.map((cat) => {
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
                              <span className="text-brand-muted text-[10px]">
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
                    <p className="text-brand-muted mb-2 text-[10px] font-bold tracking-wider uppercase">
                      {texts.occasionsTitle}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {TOP_OCASIONES.map((o) => (
                        <Link
                          key={o.slug}
                          href={`/ocasion/${o.slug}`}
                          className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/10 rounded-full border bg-white px-2.5 py-0.5 text-xs"
                        >
                          {texts.occasions[o.slug] ?? o.label}
                        </Link>
                      ))}
                      <Link
                        href="/recomendador"
                        className="bg-brand-purple inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                      >
                        <Sparkles className="h-3 w-3" /> {texts.helpChip}
                      </Link>
                    </div>
                  </div>

                  <Link
                    href="/productos"
                    className="text-brand-purple-dark hover:text-brand-purple mt-4 block text-center text-sm font-semibold"
                  >
                    {texts.viewAll}
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
            <SheetTitle className="font-display text-brand-purple-dark text-2xl">
              {texts.catalog}
            </SheetTitle>
          </SheetHeader>
          <nav className="mt-3 flex flex-col gap-0.5 px-3 pb-6">
            {menuCategories.map((cat) => {
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
              <p className="text-brand-muted mb-2 px-2 text-[10px] font-bold tracking-wider uppercase">
                {texts.occasionsTitle}
              </p>
              <div className="flex flex-wrap gap-1.5 px-2">
                {TOP_OCASIONES.map((o) => (
                  <Link
                    key={o.slug}
                    href={`/ocasion/${o.slug}`}
                    onClick={() => setMobileOpen(false)}
                    className="border-brand-purple/20 text-brand-purple-dark rounded-full border bg-white px-2.5 py-1 text-xs"
                  >
                    {texts.occasions[o.slug] ?? o.label}
                  </Link>
                ))}
              </div>
            </div>
            <Link
              href="/recomendador"
              onClick={() => setMobileOpen(false)}
              className="bg-brand-purple mt-3 inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold text-white"
            >
              <Sparkles className="h-4 w-4" /> {texts.helpCta}
            </Link>
            <Link
              href="/productos"
              onClick={() => setMobileOpen(false)}
              className="border-brand-purple/30 text-brand-purple-dark mt-2 rounded-md border bg-white py-2 text-center text-sm font-semibold"
            >
              {texts.viewAllMobile}
            </Link>

            {/* #10 — entrada a cuenta/ayuda en el drawer móvil (antes no existía en móvil). */}
            <div className="border-brand-purple/10 mt-4 border-t pt-3">
              <p className="text-brand-muted mb-2 px-2 text-[10px] font-bold tracking-wider uppercase">
                {texts.accountTitle}
              </p>
              <div className="flex flex-col">
                <Link
                  href={isLoggedIn ? "/mi-cuenta" : "/login"}
                  onClick={() => setMobileOpen(false)}
                  className="text-brand-purple-dark hover:bg-brand-purple/5 rounded-md px-2 py-2 text-sm font-medium"
                >
                  {isLoggedIn ? texts.accountMobile : texts.login}
                </Link>
                {!isLoggedIn && (
                  <Link
                    href="/registro"
                    onClick={() => setMobileOpen(false)}
                    className="text-brand-purple-dark hover:bg-brand-purple/5 rounded-md px-2 py-2 text-sm font-medium"
                  >
                    {texts.signup}
                  </Link>
                )}
                <Link
                  href="/ayuda"
                  onClick={() => setMobileOpen(false)}
                  className="text-brand-purple-dark hover:bg-brand-purple/5 rounded-md px-2 py-2 text-sm font-medium"
                >
                  Centro de ayuda
                </Link>
                <Link
                  href="/contacto"
                  onClick={() => setMobileOpen(false)}
                  className="text-brand-purple-dark hover:bg-brand-purple/5 rounded-md px-2 py-2 text-sm font-medium"
                >
                  Contacto
                </Link>
              </div>
            </div>
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
            <span className="text-brand-muted text-[10px]">
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
            className="text-brand-muted hover:bg-brand-purple/10 rounded p-1"
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
