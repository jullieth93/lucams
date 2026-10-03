"use client";

/*
 * Tooltip de marca — reemplazo global del `title=` nativo (cuadro negro del
 * browser) por la tarjeta blanca de Lucams (misma familia visual que el
 * popover de "Vista previa": bg blanco, rounded-xl, ring brand-purple).
 *
 * Uso corto (99% de los casos, migración de `title="texto"`):
 *   <Hint content="Texto de ayuda"><button … /></Hint>
 *
 * Uso composicional (contenido rico / control manual):
 *   <Tooltip><TooltipTrigger asChild>…</TooltipTrigger>
 *     <TooltipContent>…</TooltipContent></Tooltip>
 *
 * A11y: radix abre con hover Y foco de teclado y cierra con Esc. El contenido
 * se anuncia vía aria-describedby en el trigger. Para elementos `disabled`
 * (no reciben hover/foco), envolver en <span tabIndex={0}> — patrón ya usado
 * en studio-toolbar.tsx.
 */

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function TooltipProvider({
  delayDuration = 150,
  skipDelayDuration = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  );
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  collisionPadding = 12,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "ring-brand-purple/15 text-brand-purple-dark z-50 max-w-xs rounded-xl bg-white px-3 py-2 text-xs leading-snug font-semibold shadow-xl ring-1",
          "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-white" width={12} height={6} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/** Atajo de migración: envuelve el trigger y muestra `content` al hover/foco. */
function Hint({
  content,
  children,
  side,
  align,
  contentClassName,
  ...contentProps
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
  // "content" también se excluye del Omit: React.HTMLAttributes lo define como
  // string (atributo meta) y al intersectar con ReactNode prohibía null/JSX.
} & Omit<
  React.ComponentProps<typeof TooltipPrimitive.Content>,
  "children" | "className" | "content"
>) {
  // Sin contenido (ej. tooltip condicional vacío) el trigger se renderiza
  // pelado — equivalente al `title` ausente, sin tooltip vacío flotante.
  if (content == null || content === "") return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} className={contentClassName} {...contentProps}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

export { Hint, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
