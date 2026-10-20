"use client";

/*
 * PredesignedHoverPreview — preview emergente GRANDE de un diseño prediseñado
 * al SOSTENER el mouse sobre su tarjeta del sidebar (owner 2026-10-19).
 *
 * Antes la tarjeta solo tenía el tooltip con el nombre: para ver el diseño
 * completo había aplicarlo a ciegas. Ahora, pasado un delay corto (400 ms —
 * no dispara al pasar rápido de camino a otro botón), se abre una tarjeta
 * flotante con la imagen a mayor resolución (imageUrl, no el thumb) + nombre.
 *
 * Implementación: radix HoverCard (misma familia radix del Tooltip de marca).
 *  - Es HOVER-ONLY: en táctil NO abre (no hay hover); el tap sigue aplicando
 *    el diseño como siempre. No se inventa long-press (decisión de alcance).
 *  - openDelay 400 ms + closeDelay 120 ms: moverse entre tarjetas no abre
 *    ventanitas en cascada ni parpadea al salir.
 *  - Portal a body (sin stacking contexts del sidebar) y colisión con flip
 *    automático: el sidebar vive a la derecha, así que abre a la IZQUIERDA
 *    (side="left"); si no cabe, radix la reubica.
 *
 * A11y: es un extra visual de hover — la info esencial ya viaja en el
 * aria-label del botón ("Aplicar el diseño {nombre}…"). La imagen repite el
 * nombre como alt por si el lector de pantalla entra al contenido.
 */

import { HoverCard } from "radix-ui";

/** Delay de apertura (ms): suficiente para que PASAR rápido sobre la grilla no abra nada. */
const OPEN_DELAY_MS = 400;

export function PredesignedHoverPreview({
  name,
  imageUrl,
  children,
}: {
  /** Nombre del diseño (caption bajo la imagen). */
  name: string;
  /** Imagen del diseño a MAYOR resolución que el thumb de la tarjeta. */
  imageUrl: string;
  children: React.ReactNode;
}) {
  return (
    <HoverCard.Root openDelay={OPEN_DELAY_MS} closeDelay={120}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="left"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          className="ring-brand-purple/15 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 z-50 w-56 rounded-xl bg-white p-2.5 shadow-2xl ring-1"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={name}
            // object-contain + fondo crema: el diseño se ve COMPLETO (los
            // marcapáginas 1:3.75 quedarían ilegibles con object-cover).
            className="bg-brand-cream/40 max-h-72 w-full rounded-md object-contain"
            loading="lazy"
            // 3.10 — disuasión anti-copia, igual que la miniatura de la tarjeta.
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
          />
          <p className="text-brand-purple-dark mt-1.5 text-center text-xs leading-tight font-semibold">
            {name}
          </p>
          <HoverCard.Arrow className="fill-white" width={12} height={6} />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
