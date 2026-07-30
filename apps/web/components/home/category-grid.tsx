/*
 * Grid de 7 categorías visuales en home.
 *
 * Cada card: gradient distintivo + icono lucide + nombre + count.
 * Solo categorías con isActive=true (mayorista queda fuera).
 *
 * Visual (roadmap B3): icono/gradiente vienen de BD (Category.icon /
 * Category.gradient, editables en /admin/categorias). Si la columna es NULL
 * se cae al mapa fallback por slug y luego al default genérico — ver
 * lib/category-visuals.ts para el orden de precedencia completo.
 */

import Link from "next/link";
import { resolveCategoryGradient, resolveCategoryIcon } from "@/lib/category-visuals";

type CategoryItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  gradient: string | null;
  _count: { products: number };
};

export function CategoryGrid({ categories }: { categories: CategoryItem[] }) {
  if (categories.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {categories.map((c) => {
        const Icon = resolveCategoryIcon(c.icon, c.slug);
        const gradient = resolveCategoryGradient(c.gradient, c.slug);
        return (
          <Link
            key={c.id}
            href={`/productos?categoria=${c.slug}`}
            className={
              "border-brand-purple/10 group relative flex flex-col items-start gap-2 overflow-hidden rounded-xl border bg-gradient-to-br p-5 transition-all hover:-translate-y-1 hover:shadow-lg " +
              gradient
            }
          >
            <div className="rounded-full bg-white/60 p-2.5 transition-transform group-hover:scale-110 group-hover:rotate-6">
              <Icon className="text-brand-purple h-6 w-6" />
            </div>
            <h3 className="font-display text-brand-purple-dark text-lg leading-tight">{c.name}</h3>
            <p className="text-brand-muted text-xs">
              {c._count.products} {c._count.products === 1 ? "producto" : "productos"}
            </p>
            <span className="text-brand-muted group-hover:text-brand-purple mt-auto text-xs font-medium transition-colors">
              Ver categoría →
            </span>
          </Link>
        );
      })}
    </div>
  );
}
