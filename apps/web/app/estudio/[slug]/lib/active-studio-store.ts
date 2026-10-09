/*
 * Registro del store ACTIVO del Estudio (QA ronda 2, F3 — 2026-10-07).
 *
 * El patrón del Estudio es pasar el store POR PROPS desde studio-editor (el
 * padre lo crea con createStudioStore), pero el editor unificado por slot
 * (StudioSlotEditModal) se renderiza desde studio-canvas-grid —archivo
 * congelado por trabajo en paralelo— y no recibe el store. La sección
 * «Campos de Instagram» de la edición individual (studio-ig-slot-fields)
 * necesita leer packTextValues y las capas de la plantilla, así que
 * createStudioStore registra acá la instancia al crearse.
 *
 * Hay UN solo editor de Estudio montado por página → basta un registro
 * simple (última instancia creada). En tests, cada createStudioStore()
 * reemplaza el registro (el store del test queda activo).
 */

import type { StudioStore } from "./store";

let activeStore: StudioStore | null = null;

/** Lo llama createStudioStore() al crear cada instancia. */
export function registerActiveStudioStore(store: StudioStore): void {
  activeStore = store;
}

/** Store activo del Estudio; null si ningún editor lo creó todavía. */
export function getActiveStudioStore(): StudioStore | null {
  return activeStore;
}
