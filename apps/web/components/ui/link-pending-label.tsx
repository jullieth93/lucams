"use client";

/*
 * Etiqueta de Link con feedback de navegación pendiente.
 *
 * Hermano de SubmitButton para CTAs que NAVEGAN (no submit): un `<Link>` a una
 * ruta no prefetchable (p. ej. "Ir a pagar → /checkout/datos", con
 * prefetch={false} porque el destino depende del estado mutable del carrito)
 * no daba NINGUNA señal al clickearlo — la reacción natural era volver a
 * pulsarlo (mismo reporte de Lucy, 2026-07-25, que originó SubmitButton).
 *
 * `useLinkStatus` (Next 15+) debe vivir en un componente DESCENDENTE del
 * `<Link>`: por eso esto envuelve solo la etiqueta, no el anchor. Uso:
 *
 *   <Button asChild>
 *     <Link href="/checkout/datos" prefetch={false}>
 *       <LinkPendingLabel>Ir a pagar →</LinkPendingLabel>
 *     </Link>
 *   </Button>
 *
 * Si la ruta ya está prefetcheada, `pending` nunca sube y el label se ve
 * idéntico — el spinner solo aparece en navegaciones lentas reales.
 */

import { Loader2 } from "lucide-react";
import { useLinkStatus } from "next/link";

export function LinkPendingLabel({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center justify-center gap-1.5" aria-busy={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </span>
  );
}
