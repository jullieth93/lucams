/*
 * <StorefrontVisibilityChip> — chip "¿se ve en la tienda?" para el admin.
 *
 * El badge de Estado ("Activo") solo refleja product.isActive; este chip
 * resume el gate REAL del storefront (features/products/storefront-visibility.ts):
 *   - "Visible en tienda" (verde): los clientes lo ven y pueden comprarlo.
 *   - "Agotado" (ámbar): se ve, pero con el aviso de agotado (no se puede comprar).
 *   - "No visible" (gris): no aparece en la tienda; la razón dice por qué.
 *
 * Uso:
 *  - Listado de productos: razón como tooltip + texto pequeño solo en las
 *    filas con problema (showReason cuando status === "no-visible").
 *  - Ficha del producto: razón siempre en texto visible (la página la
 *    renderiza al lado del chip).
 */

import { AdminBadge } from "@/components/admin-page";
import type { StorefrontVisibility } from "@/features/products/storefront-visibility";

const LABELS: Record<StorefrontVisibility["status"], string> = {
  visible: "Visible en tienda",
  "visible-agotado": "Agotado",
  "no-visible": "No visible",
};

const TONES = {
  visible: "emerald",
  "visible-agotado": "amber",
  "no-visible": "slate",
} as const;

export function StorefrontVisibilityChip({
  visibility,
  showReason = false,
}: {
  visibility: StorefrontVisibility;
  /**
   * true → la razón se muestra también en texto pequeño bajo el chip
   * (no solo en el tooltip). Para "visible" no hay razón que mostrar.
   */
  showReason?: boolean;
}) {
  const reason = "reason" in visibility ? visibility.reason : null;
  return (
    <span className="inline-flex flex-col items-center gap-0.5" title={reason ?? undefined}>
      <AdminBadge tone={TONES[visibility.status]}>{LABELS[visibility.status]}</AdminBadge>
      {showReason && reason && (
        <span className="text-brand-muted max-w-44 text-center text-[10px] leading-tight">
          {reason}
        </span>
      )}
    </span>
  );
}
