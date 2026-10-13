"use client";

/*
 * Scene3DErrorBoundary — red de seguridad de las escenas 3D (2026-10-12).
 *
 * Si `useTexture` falla dentro de una escena (dataURL inválido o gigante, error de decodificación,
 * contexto WebGL perdido al remontar), el error se propaga desde el árbol R3F y, sin boundary, el
 * canvas quedaba NEGRO/VACÍO (el único fallback era `Suspense fallback={null}`, que no cubre
 * errores). Este boundary muestra el mismo fallback amigable de los compositores 2D de la galería
 * (textos CMS estudio.escenas.error / .error-hint — los defaults son los literales pre-CMS, así que
 * funciona también fuera del provider).
 *
 * Debe envolver el componente de la escena FUERA del <Canvas> (o directamente el Canvas): los
 * errores del reconciliador de R3F llegan al boundary React más cercano hacia arriba.
 */

import { Component, type ReactNode } from "react";
import { useStudioTexts } from "./studio-texts-provider";

function Scene3DFallback() {
  const texts = useStudioTexts();
  return (
    <div className="text-brand-cream/90 flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
      <p>{texts.escenas.error}</p>
      <p className="text-brand-cream/70 text-xs">{texts.escenas.errorHint}</p>
    </div>
  );
}

export class Scene3DErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Log para soporte (el cliente ve el fallback amigable; no rompemos el editor).
    console.error("[Scene3D] la escena 3D falló y se reemplazó por el fallback:", error);
  }

  render() {
    return this.state.failed ? <Scene3DFallback /> : this.props.children;
  }
}
