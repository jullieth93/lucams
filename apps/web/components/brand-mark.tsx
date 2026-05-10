/*
 * BrandMark — el logo Lucams unificado: insignia circular + wordmark.
 *
 * Simula el logo oficial documentado en docs/BRANDING.md
 *   ("insignia circular, mapache kawaii sobre lavanda, 'LUCAMS' bubble
 *   multicolor + 'SHOP'")
 * con un placeholder emoji 🦝 hasta tener el asset SVG/PNG real. Cuando
 * llegue, basta con reemplazar el contenido del badge — el resto del
 * componente y todas las llamadas siguen funcionando.
 *
 * Decisión de diseño (feedback de Lucy 2026-05-10):
 *   - Mascota INTEGRADA al wordmark, no emoji flotante separado.
 *   - Animación visible: float idle + wiggle en hover + pop en page load.
 *   - Reutilizable en (auth)/layout, SiteHeader, /mi-cuenta — identidad
 *     de marca consistente en todas las superficies.
 *
 * Variantes (`size`):
 *   - sm: header compacto (storefront, /mi-cuenta) — badge 32px.
 *   - md: páginas de auth — badge 44px, más prominente al cargar la pág.
 *   - lg: hero / 404 — badge 64px.
 *
 * Accesibilidad:
 *   - El wrapper es semánticamente un link a "/" con aria-label correcto.
 *   - El emoji es aria-hidden (es decorativo; el label del link cubre el
 *     significado).
 *   - Todas las animaciones respetan `prefers-reduced-motion` vía
 *     `motion-safe:`.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";

const SIZE_TOKENS = {
  sm: {
    badge: "h-8 w-8 text-base ring-2",
    nameClass: "text-xl",
    suffixClass: "text-base",
    gap: "gap-2",
  },
  md: {
    badge: "h-11 w-11 text-2xl ring-[3px]",
    nameClass: "text-2xl",
    suffixClass: "text-lg",
    gap: "gap-2.5",
  },
  lg: {
    badge: "h-16 w-16 text-4xl ring-4",
    nameClass: "text-4xl",
    suffixClass: "text-2xl",
    gap: "gap-3",
  },
} as const;

type Size = keyof typeof SIZE_TOKENS;

export function BrandMark({
  size = "sm",
  href = "/",
  animated = false,
  className,
}: {
  size?: Size;
  href?: string;
  animated?: boolean;
  className?: string;
}) {
  const t = SIZE_TOKENS[size];

  return (
    <Link
      href={href}
      aria-label="Inicio Lucams_shop"
      className={cn(
        "group inline-flex items-center",
        t.gap,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-brand-purple text-white shadow-md ring-brand-yellow",
          t.badge,
          // Idle: float vertical suave si animated. Inicial: pop al montar.
          animated && "motion-safe:[animation:var(--animate-pop),var(--animate-float)] motion-safe:[animation-delay:0s,0.4s] motion-safe:[animation-duration:0.4s,3s] motion-safe:[animation-iteration-count:1,infinite]",
          !animated && "motion-safe:animate-[var(--animate-pop)]",
          // Hover: wiggle del badge + tilt suave del grupo entero.
          "motion-safe:group-hover:animate-[var(--animate-wiggle)]",
          "transition-transform group-hover:scale-105",
        )}
      >
        🦝
      </span>
      <span className="inline-flex items-baseline gap-1">
        <span
          className={cn(
            "font-display font-bold tracking-tight text-brand-purple-dark group-hover:text-brand-purple transition-colors",
            t.nameClass,
          )}
        >
          Lucams
        </span>
        <span
          className={cn(
            "font-display text-brand-pink group-hover:text-brand-coral transition-colors",
            t.suffixClass,
          )}
        >
          shop
        </span>
      </span>
    </Link>
  );
}
