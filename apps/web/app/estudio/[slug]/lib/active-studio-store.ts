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

import { createContext, useContext } from "react";
import type { StudioStore } from "./store";

let activeStore: StudioStore | null = null;

/**
 * Contexto explícito del store del Estudio para componentes descendientes.
 * Evita que el doble render de React 19 Strict Mode (`useMemo(() => createStudioStore(), [])`)
 * deje `activeStore` apuntando a una instancia descartada cuando un hijo lee el store.
 */
export const StudioStoreContext = createContext<StudioStore | null>(null);

/** Lo llama createStudioStore() y StudioEditor (en useEffect) para mantener el fallback al día. */
export function registerActiveStudioStore(store: StudioStore): void {
  activeStore = store;
}

/** Store activo del Estudio; null si ningún editor lo creó todavía. */
export function getActiveStudioStore(): StudioStore | null {
  return activeStore;
}

/** Hook React que prioriza el contexto del árbol montado y cae al registro global en tests aislados. */
export function useActiveStudioStore(): StudioStore | null {
  return useContext(StudioStoreContext) ?? activeStore;
}
