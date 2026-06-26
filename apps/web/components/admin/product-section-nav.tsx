/*
 * <ProductSectionNav> — sub-nav del producto con [Editar | Versiones | Reseñas].
 *
 * Lucy 2026-06-26 — Opción C Sprint 2: el problema era que las versiones (stock
 * + precio efectivo, datos diarios) vivían en sub-ruta escondida que solo se
 * descubría entrando al editor. Resolvemos NO con sub-ruta sino con un sub-nav
 * SIEMPRE visible arriba del contenido. Pattern Shopify "Product detail tabs".
 *
 * Comportamiento:
 *  - Server component que renderea Links con searchParam ?section= deep-link,
 *    refresh-safe, SEO-friendly.
 *  - Touch targets h-11 (≥44px), scroll horizontal en mobile.
 *  - Badge con count cuando aplica (versiones · reseñas pendientes).
 *  - Estilo idéntico a AdminTabBar de tabs internos para coherencia visual.
 */

import Link from "next/link";
import type { ReactNode } from "react";

export type ProductSection = "editar" | "versiones" | "resenas";

export function ProductSectionNav({
  productId,
  currentSection,
  variantsCount,
  pendingReviewsCount,
}: {
  productId: string;
  currentSection: ProductSection;
  variantsCount: number;
  pendingReviewsCount: number;
}) {
  return (
    <nav
      aria-label="Secciones del producto"
      className="border-brand-purple/15 -mt-2 mb-6 flex gap-1 overflow-x-auto rounded-xl border bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur"
    >
      <SectionLink
        href={`/admin/productos/${productId}`}
        label="Editar"
        active={currentSection === "editar"}
      />
      <SectionLink
        href={`/admin/productos/${productId}?section=versiones`}
        label="Versiones"
        active={currentSection === "versiones"}
        badge={variantsCount > 0 ? variantsCount : undefined}
      />
      <SectionLink
        href={`/admin/productos/${productId}?section=resenas`}
        label="Reseñas"
        active={currentSection === "resenas"}
        badge={pendingReviewsCount > 0 ? pendingReviewsCount : undefined}
        badgeTone={pendingReviewsCount > 0 ? "amber" : "default"}
      />
    </nav>
  );
}

function SectionLink({
  href,
  label,
  active,
  badge,
  badgeTone = "default",
}: {
  href: string;
  label: ReactNode;
  active: boolean;
  badge?: number;
  badgeTone?: "default" | "amber";
}) {
  const base =
    "focus-visible:ring-brand-purple/50 inline-flex h-11 min-w-[88px] shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none";
  const tone = active
    ? "bg-brand-purple text-white shadow-sm"
    : "text-brand-purple-dark/70 hover:bg-brand-purple/8 hover:text-brand-purple-dark";

  // Hotfix P1-7: el badge amber pierde urgencia en estado active (amber-300/30
  // sobre púrpura = beige apagado). Mantenemos el amber sólido siempre para
  // que "tienes pendientes" se lea igual de claro al estar parado en la tab.
  const badgeClass = (() => {
    if (!badge) return "";
    if (badgeTone === "amber") {
      return "bg-amber-100 text-amber-900";
    }
    return active
      ? "bg-white/25 text-white"
      : "bg-brand-purple/15 text-brand-purple-dark";
  })();

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${base} ${tone}`}
    >
      <span>{label}</span>
      {badge !== undefined && (
        <span
          className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${badgeClass}`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
