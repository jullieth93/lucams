"use client";

/*
 * StudioSimpleHeader — header sticky UNIFICADO de los editores simples del
 * Estudio (nombre / set de letras), Ola 32 (2026-09-18).
 *
 * Replica el idioma visual del StudioToolbar del estudio de foto (pill «Salir»
 * sólido, avatar+nombre del producto al centro, CTA «Vista previa» a la derecha)
 * SIN acoplarse a su store zustand: estos editores no tienen slots ni autosave,
 * así que el contenido central y la acción llegan por props. Se crea UNA vez y
 * lo comparten name-editor y letter-set-editor (regla del owner: un solo chrome
 * para todos los estudios).
 *
 * El CTA es la MISMA acción que el botón grande del editor (abre la vista
 * previa pre-carrito): queda accesible aunque el cliente haya scrolleado.
 */

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { LucamsLogo } from "@/components/lucams-logo";
import { STUDIO_MAX_WIDTH } from "./studio-layout";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

type StudioSimpleHeaderProps = {
  productName: string;
  productSlug: string;
  /** Mini avatar del producto (misma idea que el hero del StudioToolbar). */
  productImageUrl?: string;
  /** Contenido junto al CTA (total en vivo compacto, ej. "$42.000"). */
  trailing?: React.ReactNode;
  /** Rótulo del CTA (CMS: textos.comun.listo = "Vista previa"). */
  ctaLabel: string;
  /** Rótulo mientras procesa (ej. "Preparando…"). */
  ctaBusyLabel?: string;
  ctaBusy?: boolean;
  ctaDisabled?: boolean;
  /** Texto sr-only que completa la promesa del CTA (WCAG 2.5.3, patrón de los editores). */
  ctaSrHint?: string;
  onCta: () => void;
};

export function StudioSimpleHeader({
  productName,
  productSlug,
  productImageUrl,
  trailing,
  ctaLabel,
  ctaBusyLabel,
  ctaBusy = false,
  ctaDisabled = false,
  ctaSrHint,
  onCta,
}: StudioSimpleHeaderProps) {
  const texts = useStudioTexts();
  return (
    <header
      role="banner"
      className="border-brand-purple/10 sticky top-0 z-10 border-b bg-white/95 backdrop-blur"
    >
      <div
        className="mx-auto flex w-full items-center justify-between gap-3 px-4 py-2.5 sm:px-6"
        style={{ maxWidth: STUDIO_MAX_WIDTH }}
      >
        {/* Mismo pill de salida del StudioToolbar: botón sólido morado (el pill con
            fondo suave se leía como texto, no como acción — Lucy 2026-09-08). */}
        <Link
          href={`/producto/${productSlug}`}
          aria-label={fillStudioText(texts.lienzo.salirAria, { producto: productName })}
          className="bg-brand-purple hover:bg-brand-purple-dark shadow-brand-purple/20 hover:shadow-brand-purple/30 focus:ring-brand-purple inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md px-4 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg focus:ring-2 focus:ring-offset-2 focus:outline-none"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span>{texts.lienzo.headerExit}</span>
        </Link>

        {/* Hero del estudio (avatar + nombre) — solo md+, igual que el StudioToolbar:
            en móvil el ancho es para el CTA y el total. */}
        <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 md:flex">
          <HeaderAvatar productImageUrl={productImageUrl} productName={productName} />
          <p className="text-brand-purple-dark truncate text-sm font-semibold">
            {fillStudioText(texts.lienzo.headerTitle, { producto: productName })}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {trailing}
          <button
            type="button"
            onClick={onCta}
            disabled={ctaDisabled || ctaBusy}
            aria-busy={ctaBusy}
            className={[
              "focus:ring-brand-purple inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-all focus:ring-2 focus:ring-offset-2 focus:outline-none sm:px-4",
              ctaDisabled
                ? "bg-brand-purple/30 cursor-not-allowed text-white"
                : "bg-brand-purple hover:bg-brand-purple-dark shadow-brand-purple/20 hover:shadow-brand-purple/30 text-white shadow-md hover:shadow-lg",
            ].join(" ")}
          >
            {ctaBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden />
            )}
            <span>{ctaBusy ? (ctaBusyLabel ?? ctaLabel) : ctaLabel}</span>
            {ctaSrHint && !ctaBusy && <span className="sr-only">&nbsp;{ctaSrHint}</span>}
          </button>
        </div>
      </div>

      {/* Ola 34 (owner 2026-09-18) — nombre del producto EN MÓVIL: el hero
          avatar+nombre es md+ y en <md no se veía qué producto se está
          trabajando. Entre «Salir», el total y el CTA no cabe una línea
          legible en 375px (~50px útiles → truncaba a nada), así que va en una
          fila fina propia bajo la barra (misma idea que la fila móvil del
          StudioToolbar del estudio de foto). UNA línea truncada, py-1: la
          tarjeta del lienzo sigue iniciando dentro del primer viewport de
          375×812 (verificado con capturas). */}
      <div className="border-brand-purple/10 bg-brand-cream/50 border-t md:hidden">
        <p
          className="text-brand-purple-dark truncate px-4 py-1 text-center text-xs font-semibold"
          title={productName}
        >
          {productName}
        </p>
      </div>
    </header>
  );
}

/** Avatar mini del header con fallback al mascote (mismo patrón FIX-3 del StudioToolbar:
    si la imagen no carga, no queda un cuadrado blanco vacío). */
function HeaderAvatar({
  productImageUrl,
  productName,
}: {
  productImageUrl?: string;
  productName: string;
}) {
  const [errored, setErrored] = useState(false);

  if (!productImageUrl || errored) {
    return (
      <div
        className="ring-brand-purple/15 from-brand-cream to-brand-pink/15 flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br shadow-sm ring-1"
        aria-label={productName}
      >
        <LucamsLogo variant="mascot" size={28} />
      </div>
    );
  }

  return (
    <div className="ring-brand-purple/15 relative h-10 w-10 shrink-0 overflow-hidden rounded-md shadow-sm ring-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura del header, mismo patrón del StudioToolbar */}
      <img
        src={productImageUrl}
        alt={productName}
        className="h-full w-full object-cover"
        onError={() => setErrored(true)}
      />
    </div>
  );
}
