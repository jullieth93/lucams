"use client";

/*
 * Botón "Ver" del carrito — lightbox con la vista previa del diseño
 * personalizado (Design.previewUrl, PNG público del bucket design-previews).
 *
 * La miniatura de la línea es pequeña (96px) y el cliente quiere revisar su
 * diseño en grande ANTES de pagar sin salir del carrito (QA owner 2026-09-25).
 * Radix Dialog (components/ui/dialog) ya trae foco atrapado, cierre por ESC y
 * por backdrop, y aria-modal — acá solo se compone.
 *
 * Es client component y NO puede leer el CMS: sus textos llegan resueltos por
 * props desde app/carrito/page.tsx (server), como <CmsText> por cada rótulo —
 * así el ratchet de cobertura de contenido los cuenta como cubiertos (mismo
 * patrón que label={<CmsText …/>} en app/pedido/[token]/page.tsx).
 */

import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DesignPreviewDialog({
  previewUrl,
  productName,
  triggerLabel,
  title,
  description,
}: {
  previewUrl: string;
  productName: string;
  /** Rótulo del botón que abre el lightbox (CMS: cart.ver-diseno). */
  triggerLabel: ReactNode;
  /** Título del lightbox; el nombre del producto se concatena después (CMS: cart.vista-previa-diseno-titulo). */
  title: ReactNode;
  /** Descripción sr-only para lectores de pantalla (CMS: cart.vista-previa-diseno-desc). */
  description: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10 hover:text-brand-purple-dark"
        >
          <Eye aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      {/* El ancho se sobreescribe con la variante prefijada `sm:max-w-lg` — la
          base del Dialog trae `sm:max-w-sm`, que por orden de cascada le ganaría
          a un `max-w-lg` sin prefijo (mismo caso documentado en studio-preview-modal). */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogTitle className="text-brand-purple-dark font-display text-lg font-bold">
          {title} {productName}
        </DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        {/* Aspecto NATURAL del PNG (no siempre es cuadrado — tiras/separadores
            son altos): se capa por ALTO de viewport y por ancho del diálogo,
            object-contain, sin letterboxing forzado. Mismo criterio que la
            vista previa del Estudio (2026-09-22). */}
        <div className="border-brand-purple/15 from-brand-cream overflow-hidden rounded-xl border bg-gradient-to-br to-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- el PNG ya está renderizado a su tamaño final; next/image no aporta optimización acá y exigiría declarar un aspecto que no conocemos */}
          <img
            src={previewUrl}
            alt={`Vista previa de tu diseño de ${productName}`}
            className="mx-auto max-h-[min(32rem,65dvh)] w-auto max-w-full object-contain drop-shadow-lg"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
