/*
 * BrandMark — Lucams mascot + wordmark, unificado para headers de la app.
 *
 * Convención: en headers usamos la MASCOTA RECORTADA (sin las letras
 * "LUCAMS SHOP" integradas del logo grande) + el wordmark como texto
 * Fredoka al costado. Razón: en tamaños chicos (44px) las letras
 * internas del logo completo no se leen bien.
 *
 * Para hero / 404 / lugares grandes, usar <LucamsLogo variant="full" />
 * que sí carga el logo completo con texto integrado.
 *
 * Animaciones:
 *  - Pop al montar (entry).
 *  - Float idle continuo si animated=true.
 *  - Wiggle + scale en hover (kawaii feedback).
 *  - motion-safe respeta prefers-reduced-motion.
 *
 * Tamaños:
 *  - sm (44px badge + text-xl wordmark): storefront / mi-cuenta header.
 *  - md (64px badge + text-2xl wordmark): páginas auth header.
 *  - lg (96px badge + text-4xl wordmark): reservado para futuro.
 */

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Mascot file dimensions: 370×355 (ratio ≈ 1.042). Mantener el aspect
// ratio evita la achatadita de 5% al forzar cuadrado.
const MASCOT_W = 370;
const MASCOT_H = 355;

const SIZE_TOKENS = {
  sm: {
    mascot: 44,
    nameClass: "text-xl",
    suffixClass: "text-base",
    gap: "gap-2",
  },
  md: {
    mascot: 64,
    nameClass: "text-2xl",
    suffixClass: "text-lg",
    gap: "gap-2.5",
  },
  lg: {
    mascot: 96,
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
  const mascotH = Math.round((t.mascot * MASCOT_H) / MASCOT_W);

  return (
    <Link
      href={href}
      aria-label="Inicio Lucams_shop"
      className={cn("group inline-flex items-center", t.gap, className)}
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
          src="/brand/lucams-mascot.png"
          alt=""
          width={t.mascot}
          height={mascotH}
          priority={size === "lg"}
        />
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

/*
 * Mascota mapache kawaii — SVG inline placeholder (fallback histórico).
 *
 * Se mantiene exportado porque `<LucamsLogo />` lo usa como fallback
 * cuando el archivo /brand/lucams-logo.* no existe. Cuando estén ambos
 * assets (logo + mascot) en producción este SVG queda solo como red de
 * seguridad — no debería renderearse nunca.
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
      <g stroke="#9A8FB5" strokeWidth="0.8" strokeLinecap="round" opacity="0.55">
        <line x1="2" y1="38" x2="11" y2="38.5" />
        <line x1="2" y1="42" x2="11" y2="41" />
        <line x1="53" y1="38.5" x2="62" y2="38" />
        <line x1="53" y1="41" x2="62" y2="42" />
      </g>
      <path
        d="M 13 30 Q 22 21 31 30 Q 32 32 31 34 Q 22 41 13 34 Q 12 32 13 30 Z"
        fill="#2A1F45"
      />
      <path
        d="M 51 30 Q 42 21 33 30 Q 32 32 33 34 Q 42 41 51 34 Q 52 32 51 30 Z"
        fill="#2A1F45"
      />
      <ellipse cx="22" cy="31" rx="4.2" ry="4.6" fill="white" />
      <ellipse cx="42" cy="31" rx="4.2" ry="4.6" fill="white" />
      <ellipse cx="22.5" cy="31.5" rx="2.8" ry="3.3" fill="#1A1530" />
      <ellipse cx="42.5" cy="31.5" rx="2.8" ry="3.3" fill="#1A1530" />
      <circle cx="21.4" cy="30" r="1.3" fill="white" />
      <circle cx="41.4" cy="30" r="1.3" fill="white" />
      <circle cx="23.7" cy="32.8" r="0.5" fill="white" />
      <circle cx="43.7" cy="32.8" r="0.5" fill="white" />
      <path
        d="M 17 24 Q 22 22 26.5 24"
        stroke="#2A1F45"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M 37.5 24 Q 42 22 47 24"
        stroke="#2A1F45"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      />
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
