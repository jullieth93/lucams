/*
 * Tipos compartidos del reorder "Volver a pedir" (Paquete I, 2026-10-02).
 *
 * Módulo PURO (sin "server-only", sin imports): los client components de las dos
 * superficies (mi-cuenta y /pedido/[token]) los importan sin arrastrar el service
 * (que sí es server-only) al bundle del navegador.
 */

export type ReorderAdded = {
  productName: string;
  qty: number;
  /** Precio VIGENTE al que entró al carrito (centavos COP). */
  unitPrice: number;
  /** Precio que pagó en el pedido original — la UI lo muestra si cambió. */
  previousUnitPrice: number;
};
export type ReorderNeedsPhotos = { productName: string; studioUrl: string };
export type ReorderUnavailable = { productName: string; reason: string };

export type ReorderSummary = {
  added: ReorderAdded[];
  needsPhotos: ReorderNeedsPhotos[];
  unavailable: ReorderUnavailable[];
};

/** Estado de las server actions de reorder (mi-cuenta y /pedido/[token]). */
export type ReorderActionState = { error?: string; summary?: ReorderSummary };
