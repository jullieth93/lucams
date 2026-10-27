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
 * 2026-10-26 (bugs del tap en móvil):
 *  - En puntero COARSE (useIsTouch) el HoverCard NO se monta: radix también
 *    abre al ENFOCAR el trigger y en táctil el tap enfoca → la tarjeta
 *    flotante (portal body, z-50) quedaba montada SOBRE el modal de
 *    reemplazo/picker que el mismo tap abre.
 *  - En desktop el estado es CONTROLADO y el click del trigger (aplicar el
 *    diseño) CIERRA la tarjeta en el momento — no queda flotando sobre lo
 *    que la acción abra.
 *  - El preview en táctil existe vía el botón «Ver» (ojo) de la tarjeta, que
 *    abre PredesignedViewDialog (ver predesigned-view-dialog.tsx).
 *
 * A11y: es un extra visual de hover — la info esencial ya viaja en el
 * aria-label del botón ("Aplicar el diseño {nombre}…") y el preview accesible
 * en táctil/teclado es el botón «Ver». La imagen repite el nombre como alt
 * por si el lector de pantalla entra al contenido.
 */

import { useState } from "react";
import { HoverCard } from "radix-ui";
import { useIsTouch } from "./use-is-touch";

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
  const isTouch = useIsTouch();
  // Estado CONTROLADO (2026-10-26): el click del trigger cierra la tarjeta —
  // aplicar un diseño no puede dejar el preview flotando encima del resultado.
  const [open, setOpen] = useState(false);

  // Táctil: sin hover no hay preview flotante (radix abriría al enfocar el
  // trigger con el tap). El preview lo da el botón «Ver» de la tarjeta.
  if (isTouch) return <>{children}</>;

  return (
    <HoverCard.Root open={open} onOpenChange={setOpen} openDelay={OPEN_DELAY_MS} closeDelay={120}>
      {/* onClickCapture: radix compone los handlers con el child (Slot) — el
          click del botón (aplicar) sigue intacto y la tarjeta se cierra. */}
      <HoverCard.Trigger asChild onClickCapture={() => setOpen(false)}>
        {children}
      </HoverCard.Trigger>
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
