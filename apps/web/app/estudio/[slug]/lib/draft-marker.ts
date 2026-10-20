/*
 * Fase 2 · item 2.4 (2026-10-07) — marcador del DRAFT activo del Estudio por
 * producto (localStorage), para no perder el avance al recargar.
 *
 * Problema: recargar /estudio/<slug> sin ?designId= creaba un draft NUEVO y el
 * anterior (que el auto-save YA había guardado server-side) quedaba huérfano.
 *
 * Flujo (diseño documentado en el item; endurecido 2026-10-13 — el retomador
 * solo aparece si hay progreso REAL guardado):
 *  a) El marcador se escribe bajo `lucams_studio_draft_<slug>` SOLO cuando hay
 *     progreso real: tras el primer auto-save exitoso con cambios del cliente,
 *     o cuando el boot recupera un draft existente (?designId= — ese diseño ya
 *     tiene avance guardado por definición). NUNCA al montar con un draft
 *     nuevo vacío (bug corregido: antes el boot lo escribía siempre y el
 *     interstitial salía aunque el cliente no hubiera hecho nada).
 *     El valor es JSON { designId, savedAt } — savedAt alimenta el detalle del
 *     interstitial y la poda por edad. Marcadores LEGACY (string plano,
 *     escritos por la versión que marcaba al entrar) no son confiables: se
 *     descartan y limpian al leer.
 *  b) Al entrar sin ?designId= y con marcador VIGENTE, el editor ofrece
 *     "Continuar donde quedaste" (interstitial previo al boot). Confirmar
 *     navega a `?designId=<id>&resume=1`: el recover flow del server valida
 *     ownership y estado (con resume=1 solo acepta DRAFT — un diseño ya
 *     finalizado NO se clona, a diferencia del "Editar" del carrito). Si el
 *     draft ya no existe/no es del owner/no es DRAFT, el server arranca un
 *     draft nuevo y el boot LIMPIA el marcador huérfano (antes lo pisaba con
 *     el draft nuevo vacío, rearmando la mentira). Marcadores con más de
 *     DRAFT_MARKER_MAX_AGE_MS ni siquiera llegan al interstitial: se limpian
 *     al leer. Descartar limpia el marcador y bootea un draft nuevo.
 *  c) Al agregar al carrito con éxito se limpia el marcador (el diseño quedó
 *     READY y su lugar es "Mis diseños", no el retomador).
 *
 * Helpers tolerantes: localStorage puede no existir (SSR, modo incógnito) —
 * leer/escribir nunca revienta el boot.
 */

export function studioDraftStorageKey(productSlug: string): string {
  return `lucams_studio_draft_${productSlug}`;
}

export const DRAFT_MARKER_GUEST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DRAFT_MARKER_ACCOUNT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const DRAFT_MARKER_MAX_AGE_MS = DRAFT_MARKER_ACCOUNT_MAX_AGE_MS;

export interface StudioDraftMarker {
  designId: string;
  /** Epoch ms del último guardado real que escribió/refrescó el marcador. */
  savedAt: number;
}

function storageOrNull(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function removeMarker(storage: Storage, productSlug: string): void {
  try {
    storage.removeItem(studioDraftStorageKey(productSlug));
  } catch {
    // ignore
  }
}

/**
 * Lee el marcador del draft con progreso real para el slug. Devuelve null —y
 * AUTO-LIMPIA la entrada— cuando no hay marcador, es legacy (string plano de
 * la versión que marcaba al entrar, sin evidencia de progreso), está corrupto
 * o está vencido (más viejo que DRAFT_MARKER_MAX_AGE_MS). La validez REAL del
 * diseño (existe, es del owner, sigue DRAFT) la confirma el recover server-side.
 */
export function readStudioDraftMarker(
  productSlug: string,
  opts?: { now?: number; maxAgeMs?: number },
): StudioDraftMarker | null {
  const storage = storageOrNull();
  if (!storage) return null;
  const now = opts?.now ?? Date.now();
  const maxAgeMs = opts?.maxAgeMs ?? DRAFT_MARKER_MAX_AGE_MS;
  try {
    const raw = storage.getItem(studioDraftStorageKey(productSlug));
    if (!raw) return null;
    let parsed: Partial<StudioDraftMarker> | null = null;
    try {
      const json: unknown = JSON.parse(raw);
      if (json && typeof json === "object") parsed = json as Partial<StudioDraftMarker>;
    } catch {
      parsed = null; // legacy string plano o corrupción — no confiable
    }
    if (
      !parsed ||
      typeof parsed.designId !== "string" ||
      parsed.designId.trim().length === 0 ||
      typeof parsed.savedAt !== "number" ||
      !Number.isFinite(parsed.savedAt) ||
      now - parsed.savedAt > maxAgeMs ||
      parsed.savedAt > now + 60_000 // reloj del cliente disparado — no confiable
    ) {
      removeMarker(storage, productSlug);
      return null;
    }
    return { designId: parsed.designId, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

/** designId guardado para el slug (null si no hay marcador confiable/vigente). */
export function readStudioDraftId(productSlug: string): string | null {
  return readStudioDraftMarker(productSlug)?.designId ?? null;
}

export function writeStudioDraftId(productSlug: string, designId: string): void {
  const storage = storageOrNull();
  if (!storage || !designId) return;
  try {
    const marker: StudioDraftMarker = { designId, savedAt: Date.now() };
    storage.setItem(studioDraftStorageKey(productSlug), JSON.stringify(marker));
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
 * marcador guardado (el caller lo lee con readStudioDraftMarker, que ya exige
 * progreso real: formato vigente + frescura, con auto-limpieza de huérfanos),
 * el boot NO viene de un recover explícito (?designId= en la URL manda: el
 * cliente siguió un link directo — carrito, "Mis diseños"— y su intención pisa
 * al marcador) y no hay ya un diseño recuperado.
 */
export function shouldOfferDraftResume(opts: {
  savedDesignId: string | null;
  urlHasDesignId: boolean;
  hasInitialDesign: boolean;
}): boolean {
  return !!opts.savedDesignId && !opts.urlHasDesignId && !opts.hasInitialDesign;
}

// ──────────────────────────────────────────────────────────────────
//  ADR-133 (2026-10-08) — snapshot local de RECUPERACIÓN del canvas
// ──────────────────────────────────────────────────────────────────
//
// El flush de supervivencia (sendBeacon en pagehide, ADR-129) NO es confiable:
// verificado con Playwright contra STG que un request despachado desde pagehide
// durante una recarga nunca sale del navegador (ni beacon ni fetch keepalive,
// incluso de 2 bytes; el mismo beacon con la página viva sí llega). Si la
// recarga cae dentro del debounce de 2 s (o con el save en vuelo abortado), el
// canvas con las fotos recién asignadas se pierde y «Continuar donde quedaste»
// volvía con el lienzo VACÍO.
//
// Por eso el editor escribe en cada cambio un snapshot { rev, canvasData } en
// localStorage (sincrónico — sobrevive la recarga), con rev = reloj del cliente
// estampado también en el canvasData que sube al server (clientRev). Al bootear
// el recover (?designId=), si el snapshot local es más nuevo que el canvas del
// server, gana el local y el boot arranca "dirty" para re-guardarlo.

export interface StudioCanvasSnapshot {
  /** Reloj del cliente (epoch ms) del último cambio capturado. */
  rev: number;
  /** Cuándo se escribió el snapshot (para poda por edad). */
  at: number;
  canvasData: unknown;
}

/** Snapshots con más de 7 días se podan al escribir (el draft server-side ya
 *  habrá purgado o el cliente habrá vuelto por otro canal). */
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function studioCanvasSnapshotKey(designId: string): string {
  return `lucams_studio_canvas_${designId}`;
}

function pruneStudioCanvasSnapshots(storage: Storage, now: number): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith("lucams_studio_canvas_")) continue;
      try {
        const parsed = JSON.parse(storage.getItem(key) ?? "") as Partial<StudioCanvasSnapshot>;
        if (typeof parsed.at !== "number" || now - parsed.at > SNAPSHOT_MAX_AGE_MS) stale.push(key);
      } catch {
        stale.push(key); // entrada corrupta — fuera
      }
    }
    for (const key of stale) storage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Persiste el snapshot del canvas (mejor esfuerzo: cuota llena / incógnito → no-op). */
export function writeStudioCanvasSnapshot(
  designId: string,
  canvasData: unknown,
  rev: number,
): void {
  const storage = storageOrNull();
  if (!storage || !designId || !Number.isFinite(rev) || rev <= 0) return;
  try {
    const snapshot: StudioCanvasSnapshot = { rev, at: Date.now(), canvasData };
    storage.setItem(studioCanvasSnapshotKey(designId), JSON.stringify(snapshot));
    pruneStudioCanvasSnapshots(storage, Date.now());
  } catch {
    // cuota llena — el snapshot simplemente no persiste
  }
}

/** Lee el snapshot del canvas de un designId (null si no hay o es inválido). */
export function readStudioCanvasSnapshot(designId: string): StudioCanvasSnapshot | null {
  const storage = storageOrNull();
  if (!storage || !designId) return null;
  try {
    const raw = storage.getItem(studioCanvasSnapshotKey(designId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudioCanvasSnapshot>;
    if (
      typeof parsed.rev !== "number" ||
      !parsed.canvasData ||
      typeof parsed.canvasData !== "object"
    )
      return null;
    return {
      rev: parsed.rev,
      at: typeof parsed.at === "number" ? parsed.at : 0,
      canvasData: parsed.canvasData,
    };
  } catch {
    return null;
  }
}

export function clearStudioCanvasSnapshot(designId: string): void {
  const storage = storageOrNull();
  if (!storage || !designId) return;
  try {
    storage.removeItem(studioCanvasSnapshotKey(designId));
  } catch {
    // ignore
  }
}

/**
 * ¿El snapshot local gana sobre el canvas que devolvió el server? Sí solo si es
 * estrictamente más nuevo (empate → server: ya tiene el mismo contenido).
 */
export function shouldUseCanvasSnapshot(opts: {
  snapshotRev: number | null;
  serverClientRev: number | null;
}): boolean {
  if (opts.snapshotRev === null) return false;
  return opts.snapshotRev > (opts.serverClientRev ?? 0);
}
