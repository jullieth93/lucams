/*
 * <ShopMegaMenu /> — dropdown "Tienda" del header.
 *
 * Desktop: NavigationMenu de Radix con contenido tipo mega-menú (grid
 * 2 columnas de categorías con icono).
 * Mobile: Sheet drawer slide-in con lista vertical.
 *
 * Filtra mayorista (isActive=false). Pasa por las categorías del
 * storefront listadas en server-side.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Camera,
  PartyPopper,
  Calendar,
  ClipboardList,
  Baby,
  Frame,
  Heart,
  Menu,
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

type Cat = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  _count: { products: number };
};

const ICONS: Record<string, LucideIcon> = {
  "foto-imanes": Camera,
  "recorditos-eventos": PartyPopper,
  organizate: ClipboardList,
  calendarios: Calendar,
  pequenes: Baby,
  "decora-espacio": Frame,
  "regalos-corazon": Heart,
};

export function ShopMegaMenu({ categories }: { categories: Cat[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <>
      {/* Desktop: NavigationMenu Radix */}
      <div className="hidden sm:block">
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger className="text-brand-purple-dark data-[active]:text-brand-purple-dark data-[state=open]:text-brand-purple-dark hover:text-brand-purple bg-transparent text-sm font-medium hover:bg-transparent">
                Tienda
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="w-[480px] p-4">
                  <div className="grid grid-cols-2 gap-2">
                    {categories.map((c) => {
                      const Icon = ICONS[c.slug] ?? Camera;
                      return (
                        <Link
                          key={c.id}
                          href={`/productos?categoria=${c.slug}`}
                          className="hover:bg-brand-purple/5 group flex items-start gap-3 rounded-lg p-3 transition-colors"
                        >
                          <span className="bg-brand-purple/10 group-hover:bg-brand-purple/20 rounded-md p-2 transition-colors">
                            <Icon className="text-brand-purple h-4 w-4" />
                          </span>
                          <span className="flex flex-col">
                            <span className="text-brand-purple-dark text-sm font-semibold">
                              {c.name}
                            </span>
                            <span className="text-brand-purple-dark/60 text-xs">
                              {c._count.products}{" "}
                              {c._count.products === 1 ? "producto" : "productos"}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                  <Link
                    href="/productos"
                    className="text-brand-purple hover:text-brand-purple-dark mt-3 block border-t pt-3 text-center text-sm font-semibold"
                  >
                    Ver todo el catálogo →
                  </Link>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>

      {/* Mobile: drawer */}
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
        <SheetContent side="left" className="w-[280px] sm:w-[320px]">
          <SheetHeader>
            <SheetTitle className="font-display text-brand-purple-dark text-2xl">Tienda</SheetTitle>
          </SheetHeader>
          <nav className="mt-4 flex flex-col gap-1 px-4 pb-6">
            {categories.map((c) => {
              const Icon = ICONS[c.slug] ?? Camera;
              return (
                <Link
                  key={c.id}
                  href={`/productos?categoria=${c.slug}`}
                  onClick={() => setMobileOpen(false)}
                  className="hover:bg-brand-purple/5 flex items-center gap-3 rounded-md p-3"
                >
                  <span className="bg-brand-purple/10 rounded-md p-2">
                    <Icon className="text-brand-purple h-4 w-4" />
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="text-brand-purple-dark text-sm font-medium">{c.name}</span>
                    <span className="text-brand-purple-dark/50 text-xs">
                      {c._count.products} {c._count.products === 1 ? "producto" : "productos"}
                    </span>
                  </span>
                </Link>
              );
            })}
            <Link
              href="/productos"
              onClick={() => setMobileOpen(false)}
              className="bg-brand-purple hover:bg-brand-purple-dark mt-3 rounded-md px-4 py-2.5 text-center text-sm font-semibold text-white"
            >
              Ver todo el catálogo
            </Link>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
