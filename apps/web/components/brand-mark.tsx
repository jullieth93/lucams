/*
 * BrandMark — Logo Lucams completo (insignia + LUCAMS + SHOP).
 *
 * Decisión: usamos el mismo archivo /brand/lucams-logo.png en todas las
 * superficies (headers chicos y grandes). El archivo ya incluye el
 * wordmark "LUCAMS SHOP" como parte del diseño, así que no
 * renderizamos texto aparte — un solo bloque visual.
 *
 * Animaciones:
 *  - Pop al montar (entry).
 *  - Float idle continuo si animated=true.
 *  - Wiggle + scale en hover.
 *  - motion-safe respeta prefers-reduced-motion.
 *
 * Tamaños:
 *  - sm (56px): storefront / mi-cuenta header.
 *  - md (72px): páginas auth header.
 *  - lg (120px): reservado para futuro hero / 404 distinto al actual.
 *
 * NOTA: la home actual usa <LucamsLogo variant="full" size={180} /> en
 * el hero. Si en el futuro queremos uniformar a BrandMark también,
 * solo es swap del componente.
 */

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const LOGO_PX: Record<Size, number> = {
  sm: 56,
  md: 72,
  lg: 120,
};

type Size = "sm" | "md" | "lg";

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
  const px = LOGO_PX[size];

  return (
    <Link
      href={href}
      aria-label="Inicio Lucams_shop"
      className={cn("group inline-flex items-center", className)}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center",
          animated &&
            "motion-safe:[animation:var(--animate-pop),var(--animate-float)] motion-safe:[animation-delay:0s,0.4s] motion-safe:[animation-duration:0.4s,3s] motion-safe:[animation-iteration-count:1,infinite]",
          !animated && "motion-safe:animate-[var(--animate-pop)]",
          "motion-safe:group-hover:animate-[var(--animate-wiggle)]",
          "transition-transform group-hover:scale-105",
        )}
      >
        <Image
          src="/brand/lucams-logo.png"
          alt="Lucams_shop"
          width={px}
          height={px}
          priority={size === "lg"}
        />
      </span>
    </Link>
  );
}

/*
 * Mascota mapache kawaii — SVG inline (fallback histórico).
 *
 * Lo conservamos exportado porque `<LucamsLogo />` lo usa como fallback
 * defensivo cuando el archivo /brand/lucams-logo.* no se puede cargar.
 * En operación normal nunca se renderea.
 */
export function RaccoonFace() {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className="h-[78%] w-[78%]"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="rfFace" cx="50%" cy="42%" r="58%">
          <stop offset="0%" stopColor="#F4F0FA" />
          <stop offset="100%" stopColor="#C9C0DD" />
        </radialGradient>
        <radialGradient id="rfEar" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#A89DC2" />
          <stop offset="100%" stopColor="#6E6088" />
        </radialGradient>
      </defs>
      <ellipse cx="15" cy="17" rx="8" ry="9" fill="url(#rfEar)" />
      <ellipse cx="15" cy="19" rx="3.5" ry="4" fill="#F09BB8" />
      <ellipse cx="49" cy="17" rx="8" ry="9" fill="url(#rfEar)" />
      <ellipse cx="49" cy="19" rx="3.5" ry="4" fill="#F09BB8" />
      <circle cx="32" cy="36" r="22" fill="url(#rfFace)" />
      <path d="M 13 30 Q 22 21 31 30 Q 32 32 31 34 Q 22 41 13 34 Q 12 32 13 30 Z" fill="#2A1F45" />
      <path d="M 51 30 Q 42 21 33 30 Q 32 32 33 34 Q 42 41 51 34 Q 52 32 51 30 Z" fill="#2A1F45" />
      <ellipse cx="22" cy="31" rx="4.2" ry="4.6" fill="white" />
      <ellipse cx="42" cy="31" rx="4.2" ry="4.6" fill="white" />
      <ellipse cx="22.5" cy="31.5" rx="2.8" ry="3.3" fill="#1A1530" />
      <ellipse cx="42.5" cy="31.5" rx="2.8" ry="3.3" fill="#1A1530" />
      <circle cx="21.4" cy="30" r="1.3" fill="white" />
      <circle cx="41.4" cy="30" r="1.3" fill="white" />
      <ellipse cx="14" cy="42" rx="3.8" ry="2.5" fill="#F09BB8" opacity="0.55" />
      <ellipse cx="50" cy="42" rx="3.8" ry="2.5" fill="#F09BB8" opacity="0.55" />
      <path
        d="M 32 41.5 C 30 40 28.6 41.6 30 43.2 L 32 45.4 L 34 43.2 C 35.4 41.6 34 40 32 41.5 Z"
        fill="#1A1530"
      />
      <path
        d="M 28.5 47.5 Q 30.25 49 32 47.5 Q 33.75 49 35.5 47.5"
        stroke="#1A1530"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
