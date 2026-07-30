"use client";

/*
 * <StudioTextsProvider> — inyección de los textos CMS del Estudio al árbol client.
 *
 * El Estudio es una app client profunda (editor → grid → slot → modales → forms):
 * pasar los ~280 textos por props tipadas hubiera obligado a tocar decenas de
 * firmas. En su lugar, page.tsx (server) resuelve TODO una vez con getStudioTexts()
 * y envuelve los 3 editores (foto / nombre / letras) con este provider; cada
 * componente lee lo suyo con useStudioTexts() sin cambiar su API de props.
 *
 * El DEFAULT del contexto es DEFAULT_STUDIO_TEXTS, así que cualquier consumidor
 * FUERA del provider (tests, /internal/plantilla-preview que reusar <StudioSlot>)
 * ve exactamente los textos pre-CMS — la misma REGLA DE ORO del fallback.
 */

import { createContext, useContext } from "react";
import { DEFAULT_STUDIO_TEXTS, type StudioTexts } from "./studio-texts";

const StudioTextsContext = createContext<StudioTexts>(DEFAULT_STUDIO_TEXTS);

export function StudioTextsProvider({
  texts,
  children,
}: {
  texts: StudioTexts;
  children: React.ReactNode;
}) {
  return <StudioTextsContext.Provider value={texts}>{children}</StudioTextsContext.Provider>;
}

/** Textos del Estudio (CMS con fallback exacto pre-CMS cuando no hay provider/DB). */
export function useStudioTexts(): StudioTexts {
  return useContext(StudioTextsContext);
}
