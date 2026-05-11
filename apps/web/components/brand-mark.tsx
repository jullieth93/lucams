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

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Tamaños del logo según contexto.
// Como el logo completo (lucams-logo.png) YA incluye "LUCAMS SHOP" como
// parte del diseño, no necesitamos renderizar el wordmark aparte.
// Eso permite que el logo sea un solo bloque visual auto-contenido.
const LOGO_PX: Record<Size, number> = {
  sm: 44, // header storefront / mi-cuenta
  md: 64, // páginas auth
  lg: 96, // hero / 404
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
          // Idle: float vertical suave si animated. Inicial: pop al montar.
          animated &&
            "motion-safe:[animation:var(--animate-pop),var(--animate-float)] motion-safe:[animation-delay:0s,0.4s] motion-safe:[animation-duration:0.4s,3s] motion-safe:[animation-iteration-count:1,infinite]",
          !animated && "motion-safe:animate-[var(--animate-pop)]",
          // Hover: wiggle + scale suave para feedback táctil.
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
 * Mascota mapache kawaii — SVG inline placeholder.
 *
 * Razón de SVG en lugar de emoji 🦝:
 *  Chrome en Linux sin Noto Color Emoji muestra "ND GLYPH" (no
 *  rendering glyph). Firefox tiene emoji embebido y funciona.
 *  Para que el branding sea consistente cross-browser/OS, dibujamos
 *  el mapache como SVG. Cuando llegue el asset oficial de Lucy
 *  (PNG/SVG del logo real), se reemplaza solo este componente.
 *
 * Diseño: cara redonda gris claro, máscara oscura alrededor de ojos
 * (signature del mapache), ojos blancos con pupila, hocico, sonrisita.
 * Width/height = 100% del contenedor (escala con el badge sm/md/lg).
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
        {/* Cara: gradiente radial cream → gris lavanda (volumen) */}
        <radialGradient id="rfFace" cx="50%" cy="42%" r="58%">
          <stop offset="0%" stopColor="#F4F0FA" />
          <stop offset="100%" stopColor="#C9C0DD" />
        </radialGradient>
        {/* Orejas: gradiente para profundidad */}
        <radialGradient id="rfEar" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#A89DC2" />
          <stop offset="100%" stopColor="#6E6088" />
        </radialGradient>
      </defs>

      {/* Orejas (van detrás de la cara) */}
      <ellipse cx="15" cy="17" rx="8" ry="9" fill="url(#rfEar)" />
      <ellipse cx="15" cy="19" rx="3.5" ry="4" fill="#F09BB8" />
      <ellipse cx="49" cy="17" rx="8" ry="9" fill="url(#rfEar)" />
      <ellipse cx="49" cy="19" rx="3.5" ry="4" fill="#F09BB8" />

      {/* Cara con volumen */}
      <circle cx="32" cy="36" r="22" fill="url(#rfFace)" />

      {/* Whiskers (delgadas, sutiles) */}
      <g stroke="#9A8FB5" strokeWidth="0.8" strokeLinecap="round" opacity="0.55">
        <line x1="2" y1="38" x2="11" y2="38.5" />
        <line x1="2" y1="42" x2="11" y2="41" />
        <line x1="53" y1="38.5" x2="62" y2="38" />
        <line x1="53" y1="41" x2="62" y2="42" />
      </g>

      {/* Máscara mapache — más redondeada */}
      <path
        d="M 13 30 Q 22 21 31 30 Q 32 32 31 34 Q 22 41 13 34 Q 12 32 13 30 Z"
        fill="#2A1F45"
      />
      <path
        d="M 51 30 Q 42 21 33 30 Q 32 32 33 34 Q 42 41 51 34 Q 52 32 51 30 Z"
        fill="#2A1F45"
      />

      {/* Ojos grandes brillantes */}
      <ellipse cx="22" cy="31" rx="4.2" ry="4.6" fill="white" />
      <ellipse cx="42" cy="31" rx="4.2" ry="4.6" fill="white" />
      <ellipse cx="22.5" cy="31.5" rx="2.8" ry="3.3" fill="#1A1530" />
      <ellipse cx="42.5" cy="31.5" rx="2.8" ry="3.3" fill="#1A1530" />

      {/* Brillitos grandes en ojos (kawaii sparkle) */}
      <circle cx="21.4" cy="30" r="1.3" fill="white" />
      <circle cx="41.4" cy="30" r="1.3" fill="white" />
      <circle cx="23.7" cy="32.8" r="0.5" fill="white" />
      <circle cx="43.7" cy="32.8" r="0.5" fill="white" />

      {/* Cejas tenues — expresión amable */}
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

      {/* Cachetitos rosados grandes */}
      <ellipse cx="14" cy="42" rx="3.8" ry="2.5" fill="#F09BB8" opacity="0.55" />
      <ellipse cx="50" cy="42" rx="3.8" ry="2.5" fill="#F09BB8" opacity="0.55" />

      {/* Nariz pequeña tipo corazón */}
      <path
        d="M 32 41.5 C 30 40 28.6 41.6 30 43.2 L 32 45.4 L 34 43.2 C 35.4 41.6 34 40 32 41.5 Z"
        fill="#1A1530"
      />

      {/* Boca "w" pequeña — kawaii por excelencia */}
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
