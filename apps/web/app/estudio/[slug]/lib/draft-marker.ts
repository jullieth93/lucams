/*
 * Fase 2 · item 2.4 (2026-10-07) — marcador del DRAFT activo del Estudio por
 * producto (localStorage), para no perder el avance al recargar.
 *
 * Problema: recargar /estudio/<slug> sin ?designId= creaba un draft NUEVO y el
 * anterior (que el auto-save YA había guardado server-side) quedaba huérfano.
 *
 * Flujo (diseño documentado en el item):
 *  a) El boot del editor escribe el designId activo bajo
 *     `lucams_studio_draft_<slug>` (también cuando recupera uno existente).
 *  b) Al entrar sin ?designId= y con marcador guardado, el editor ofrece
 *     "Continuar donde quedaste" (interstitial previo al boot). Confirmar
 *     navega a `?designId=<id>&resume=1`: el recover flow del server valida
 *     ownership y estado (con resume=1 solo acepta DRAFT — un diseño ya
 *     finalizado NO se clona, a diferencia del "Editar" del carrito). Si el
 *     draft ya no existe/no es del owner/no es DRAFT, el server arranca un
 *     draft nuevo y el boot sobrescribe el marcador (limpieza en silencio).
 *     Descartar limpia el marcador y bootea un draft nuevo.
 *  c) Al agregar al carrito con éxito se limpia el marcador (el diseño quedó
 *     READY y su lugar es "Mis diseños", no el retomador).
 *
 * Helpers tolerantes: localStorage puede no existir (SSR, modo incógnito) —
 * leer/escribir nunca revienta el boot.
 */

export function studioDraftStorageKey(productSlug: string): string {
  return `lucams_studio_draft_${productSlug}`;
}

function storageOrNull(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** designId guardado para el slug (null si no hay, es inválido o no se puede leer). */
export function readStudioDraftId(productSlug: string): string | null {
  const storage = storageOrNull();
  if (!storage) return null;
  try {
    const value = storage.getItem(studioDraftStorageKey(productSlug));
    return value && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeStudioDraftId(productSlug: string, designId: string): void {
  const storage = storageOrNull();
  if (!storage || !designId) return;
  try {
    storage.setItem(studioDraftStorageKey(productSlug), designId);
  } catch {
    // cuota llena / incógnito — el retomador simplemente no persiste
  }
}

export function clearStudioDraftId(productSlug: string): void {
  const storage = storageOrNull();
  if (!storage) return;
  try {
    storage.removeItem(studioDraftStorageKey(productSlug));
  } catch {
    // ignore
  }
}

/**
 * ¿Ofrecer "Continuar donde quedaste" al entrar al Estudio? Solo cuando hay
 * marcador guardado, el boot NO viene de un recover explícito (?designId= en
 * la URL manda: el cliente siguió un link directo — carrito, "Mis diseños"— y
 * su intención pisa al marcador) y no hay ya un diseño recuperado.
 */
export function shouldOfferDraftResume(opts: {
  savedDesignId: string | null;
  urlHasDesignId: boolean;
  hasInitialDesign: boolean;
}): boolean {
  return !!opts.savedDesignId && !opts.urlHasDesignId && !opts.hasInitialDesign;
}
