/*
 * Grid de 7 categorías visuales en home.
 *
 * Cada card: gradient distintivo + icono lucide + nombre + count.
 * Solo categorías con isActive=true (mayorista queda fuera).
 */

import Link from "next/link";
import {
  Camera,
  PartyPopper,
  Calendar,
  ClipboardList,
  Baby,
  Frame,
  Heart,
  type LucideIcon,
} from "lucide-react";

type CategoryItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  _count: { products: number };
};

// Mapeo slug → (icono + gradient brand). Si llega una categoría nueva sin
// match, cae al gradient default.
const CATEGORY_STYLES: Record<string, { icon: LucideIcon; gradient: string }> = {
  "foto-imanes": {
    icon: Camera,
    gradient: "from-brand-purple/20 via-brand-pink/20 to-brand-coral/20",
  },
  "recuerdos-eventos": {
    icon: PartyPopper,
    gradient: "from-brand-coral/25 via-brand-yellow/25 to-brand-pink/15",
  },
  organizate: {
    icon: ClipboardList,
    gradient: "from-brand-turquoise/25 via-brand-cream to-brand-purple/15",
  },
  calendarios: {
    icon: Calendar,
    gradient: "from-brand-yellow/30 via-brand-coral/15 to-brand-purple/15",
  },
  pequenes: {
    icon: Baby,
    gradient: "from-brand-pink/25 via-brand-turquoise/20 to-brand-yellow/20",
  },
  "decora-espacio": {
    icon: Frame,
    gradient: "from-brand-purple/20 via-brand-cream to-brand-turquoise/25",
  },
  "regalos-corazon": {
    icon: Heart,
    gradient: "from-brand-pink/30 via-brand-coral/20 to-brand-purple/15",
  },
};

const DEFAULT_STYLE = {
  icon: Camera,
  gradient: "from-brand-purple/15 via-brand-cream to-brand-turquoise/15",
};

export function CategoryGrid({ categories }: { categories: CategoryItem[] }) {
  if (categories.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {categories.map((c) => {
        const style = CATEGORY_STYLES[c.slug] ?? DEFAULT_STYLE;
        const Icon = style.icon;
        return (
          <Link
            key={c.id}
            href={`/productos?categoria=${c.slug}`}
            className={
              "border-brand-purple/10 group relative flex flex-col items-start gap-2 overflow-hidden rounded-xl border bg-gradient-to-br p-5 transition-all hover:-translate-y-1 hover:shadow-lg " +
              style.gradient
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
