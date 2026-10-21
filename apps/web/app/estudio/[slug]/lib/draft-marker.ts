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
 *     "Continuar donde quedaste" (interstitial previo al boot) — sujeto al
 *     gate de unidades de abajo (2026-10-19). Confirmar
 *     navega a `?designId=<id>&resume=1`: el recover flow del server valida
 *     ownership y estado (con resume=1 solo acepta DRAFT — un diseño ya
 *     finalizado NO se clona, a diferencia del "Editar" del carrito). Si el
 *     draft ya no existe/no es del owner/no es DRAFT, el server arranca un
 *     draft nuevo y el boot AVISA al cliente (toast `errores.borradorPerdido`)
 *     y LIMPIA el marcador huérfano (antes lo pisaba con el draft nuevo vacío,
 *     rearmando la mentira). Marcadores con más de
 *     DRAFT_MARKER_MAX_AGE_MS ni siquiera llegan al interstitial: se limpian
 *     al leer. Descartar limpia el marcador y bootea un draft nuevo.
 *  c) Al agregar al carrito con éxito se limpia el marcador (el diseño quedó
 *     READY y su lugar es "Mis diseños", no el retomador).
 *
 * Helpers tolerantes: localStorage puede no existir (SSR, modo incógnito) —
 * leer/escribir nunca revienta el boot.
 *
 * 2026-10-21 — el retomador es SOLO para clientes AUTENTICADOS (decisión del
 * owner): para invitados la cadena marcador-local + snapshot-local + cookie
 * cart_session + fila DRAFT era estructuralmente frágil (la rotación de
 * cart_session del self-heal de CART_IDENTITY_MISMATCH dejaba los drafts
 * anónimos inalcanzables: «dices que sí y no carga»; incógnito, cookies
 * borradas y purgas hacían lo mismo) y el interstitial prometía algo que no
 * siempre podía cumplir. El editor recibe `draftResumeEnabled` de page.tsx
 * (hay Customer en sesión) y SOLO entonces lee/escribe el marcador. El
 * invitado conserva sus protecciones reales: auto-saves continuos, flush
 * sendBeacon (ADR-129), snapshot local para el recover por ?designId=
 * explícito (ADR-133, p.ej. «Editar» del carrito) y la retención que purga
 * sus DRAFT idle a los 7 días. Un marcador escrito como invitado NO se
 * desperdicia: al hacer login los DRAFT anónimos se adoptan a la cuenta
 * (adoptAnonDraftDesigns, ADR-155) y el marcador vuelve a ser válido.
 *
 * 2026-10-19 — gate de UNIDADES (cobro correcto): el scope del marcador es
 * producto:variante y NO incluía las unidades del diseño, así que un borrador
 * viejo de 2 unidades de la MISMA variante se ofrecía aunque la ficha (PDP)
 * dijera 1 — y al finalizar mandaba el canvas del borrador (cobrando y
 * describiendo 2×: "1 Set de 12" terminaba como "2 calendarios de 12
 * páginas"). Ahora el marcador puede cargar `unitCount` (cosechado del
 * snapshot local del canvas al escribirse) y readStudioDraftMarker NO ofrece
 * el borrador cuando la intención de unidades del boot (?copies=N de la PDP;
 * ?variant= sin copies = 1, porque la PDP omite copies=1) difiere de las
 * unidades declaradas del borrador. Decisión documentada: NO ofrecer (boot
 * fresco) en vez de avisar — es la opción segura para el cobro; el marcador
 * SE CONSERVA (el borrador sigue siendo válido para su propia intención y
 * retomable desde «Mis diseños» por ?designId=). Marcadores viejos sin
 * unitCount y sin snapshot → unidades desconocidas → se ofrecen igual:
 * esconder todo lo desconocido mataría el retomador legítimo.
 */

import { declaresUnits, unitCountOf } from "@/features/personalization/design-units";

import { designHasMeaningfulProgress } from "@/features/personalization/design-progress";

export function studioDraftStorageKey(productSlug: string): string {
  return `lucams_studio_draft_${productSlug}`;
}

export const DRAFT_MARKER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface StudioDraftMarker {
  designId: string;
  /** Epoch ms del último guardado real que escribió/refrescó el marcador. */
  savedAt: number;
  /**
   * 2026-10-19 — unidades declaradas del diseño (canvasData.unitCount),
   * cosechadas al escribir el marcador. Alimenta el gate de unidades del
   * retomador; ausente en marcadores escritos antes del gate (→ desconocidas,
   * el borrador se ofrece igual).
   */
  unitCount?: number;
}

/**
 * Intención de unidades del boot actual, leída de la URL (2026-10-19). La PDP
 * emite `?copies=N` SOLO cuando N>1; con 1 unidad el CTA trae `?variant=` sin
 * copies → la intención es 1. Sin ninguno de los dos params (visita directa,
 * link de plantilla, recarga sin query) NO hay intención declarada → null y
 * no se gatea nada. Entero acotado a 1..99 (misma regla que page.tsx).
 */
export function readStudioBootIntentUnits(): number | null {
  try {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const rawCopies = Number.parseInt(params.get("copies") ?? "", 10);
    if (Number.isFinite(rawCopies)) return Math.min(99, Math.max(1, rawCopies));
    return params.has("variant") ? 1 : null;
  } catch {
    return null;
  }
}

/**
 * ¿Las unidades del borrador contradicen la intención del boot? Solo con AMBAS
 * conocidas y distintas: cualquiera desconocida → false (no se puede probar el
 * desfase y esconder el borrador sería peor que ofrecerlo).
 */
export function draftUnitsMismatch(opts: {
  draftUnits: number | null;
  intendedUnits: number | null;
}): boolean {
  return (
    opts.draftUnits !== null &&
    opts.intendedUnits !== null &&
    opts.draftUnits !== opts.intendedUnits
  );
}

/** Unidades declaradas por un canvasData; null cuando el diseño NO las declara
 *  (packs de imán suelto, diseños legacy) — ahí no hay nada que comparar. */
function canvasUnitCount(canvasData: unknown): number | null {
  return declaresUnits(canvasData) ? unitCountOf(canvasData) : null;
}

/** Unidades del diseño según su snapshot local de recuperación (ADR-133). */
function snapshotUnitCount(designId: string): number | null {
  const snapshot = readStudioCanvasSnapshot(designId);
  return snapshot ? canvasUnitCount(snapshot.canvasData) : null;
}

function validUnitCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
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
 *
 * 2026-10-19 — además devuelve null (SIN limpiar: el borrador sigue válido
 * para su propia intención) cuando las unidades declaradas del borrador
 * contradicen la intención de unidades del boot actual — ver el bloque «gate
 * de UNIDADES» del encabezado.
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
    // Gate de unidades (2026-10-19): el unitCount del marcador manda; si el
    // marcador no lo trae (viejos) se intenta el snapshot local del canvas.
    const draftUnits = validUnitCount(parsed.unitCount) ?? snapshotUnitCount(parsed.designId);
    if (draftUnitsMismatch({ draftUnits, intendedUnits: readStudioBootIntentUnits() })) {
      return null;
    }
    return {
      designId: parsed.designId,
      savedAt: parsed.savedAt,
      ...(draftUnits !== null ? { unitCount: draftUnits } : {}),
    };
  } catch {
    return null;
  }
}

/** designId guardado para el slug (null si no hay marcador confiable/vigente). */
export function readStudioDraftId(productSlug: string): string | null {
  return readStudioDraftMarker(productSlug)?.designId ?? null;
}

/**
 * Escribe/refresca el marcador del draft. 2026-10-19 — el marcador cosecha las
 * UNIDADES del diseño para el gate del retomador: el caller puede pasarlas en
 * `opts.unitCount`; si no, se leen del snapshot local del canvas (ADR-133),
 * que en el momento del auto-save todavía existe (el editor lo limpia DESPUÉS
 * de escribir el marcador). Diseños que no declaran unidades (packs de imán
 * suelto, legacy) → marcador sin unitCount → el gate no aplica.
 */
export function writeStudioDraftId(
  productSlug: string,
  designId: string,
  opts?: { unitCount?: number },
): void {
  const storage = storageOrNull();
  if (!storage || !designId) return;
  try {
    const unitCount = validUnitCount(opts?.unitCount) ?? snapshotUnitCount(designId);
    const marker: StudioDraftMarker = {
      designId,
      savedAt: Date.now(),
      ...(unitCount !== null ? { unitCount } : {}),
    };
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

/**
 * 2026-10-19 — guardia de CONTENIDO REAL para el retomador: ¿el canvas del
 * draft tiene algo visible (fotos, textos, avatares)? Envuelve a
 * designHasMeaningfulProgress NEUTRALIZANDO su atajo `clientRev > 0`: ese atajo
 * cuenta "el cliente tocó y guardó ALGO alguna vez" — válido para la poda de
 * drafts server-side (draft-lifecycle), no acá: un cambio DESHECHO (asignar y
 * quitar la única foto, o solo cambiar la plantilla) deja clientRev > 0 sobre
 * un canvas vacío y el retomador ofrecía un borrador sin nada. Para esta ruta
 * solo cuenta el contenido visible de los slots.
 */
export function studioDraftHasRealProgress(canvasData: unknown): boolean {
  if (!canvasData || typeof canvasData !== "object") return false;
  const { clientRev: _ignored, ...rest } = canvasData as Record<string, unknown>;
  return designHasMeaningfulProgress({ canvasData: rest });
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
