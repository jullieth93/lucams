/*
 * Constantes y helpers compartidos para visualizar/categorizar stock.
 *
 * Usado por:
 *  - Admin: ProductStockPanel (server), product-stock-editor (CLIENT — usa MAX_STOCK_VALUE)
 *  - Storefront (futuro): "Quedan pocas unidades" callout (client)
 *  - Alertas automáticas (Bloque I): job pg_cron que detecta stock bajo (server)
 *
 * NOTA — NO marcar este file como "server-only": MAX_STOCK_VALUE se usa
 * desde product-stock-editor.tsx ("use client") como max attr del input.
 * Las funciones acá son puras (sin DB, sin env, sin secrets) → seguras
 * de bundlear al cliente. server-only en stock-admin.ts y stock-actions.ts
 * sí porque ahí sí hay Prisma + auth.
 *
 * Thresholds discutidos con Lucy (2026-06-26):
 *  - "Stock bajo" = ≤ 5 unidades. Lucy produce artesanal en lotes pequeños,
 *    bajo este umbral debe planear nueva producción.
 *  - "Agotado" = 0 unidades exactas. NO mostrar stock negativo (defensive —
 *    el constraint optimistic decrement en stock.ts:79 garantiza que esto
 *    no debería ocurrir, pero el helper lo trata como agotado por seguridad).
 *  - "Sobrante" arbitrario: 99999 max para form admin (impide tipear millones
 *    por accidente). Producto artesanal no debería tener stock > 1000 nunca.
 */

export const LOW_STOCK_THRESHOLD = 5;
export const MAX_STOCK_VALUE = 99999;

/** Estado del stock para badges/alertas. */
export type StockStatus = "out" | "low" | "ok";

export function getStockStatus(stock: number): StockStatus {
  if (stock <= 0) return "out";
  if (stock <= LOW_STOCK_THRESHOLD) return "low";
  return "ok";
}

/** Emoji semáforo para mostrar al admin no-técnico. */
export function getStockEmoji(status: StockStatus): string {
  switch (status) {
    case "out":
      return "🔴";
    case "low":
      return "🟡";
    case "ok":
      return "🟢";
  }
}

/** Label en español llano del estado. */
export function getStockLabel(status: StockStatus, stock: number): string {
  switch (status) {
    case "out":
      return "Agotado";
    case "low":
      return `Stock bajo (${stock})`;
    case "ok":
      return `${stock} unidades`;
  }
}

export type StockSummary = {
  totalUnits: number;
  variantsCount: number;
  outCount: number;
  lowCount: number;
  okCount: number;
  /** El estado MÁS PREOCUPANTE entre todas las variants (para badge global). */
  worstStatus: StockStatus;
};

/**
 * Calcula el resumen agregado de stock de un producto con N variants.
 * Útil para mostrar badge global en el header del producto + alertas.
 */
export function summarizeStock(
  variants: Array<{ stock: number; deletedAt?: Date | null }>,
): StockSummary {
  const active = variants.filter((v) => !v.deletedAt);
  let totalUnits = 0;
  let outCount = 0;
  let lowCount = 0;
  let okCount = 0;
  for (const v of active) {
    totalUnits += Math.max(0, v.stock);
    const status = getStockStatus(v.stock);
    if (status === "out") outCount++;
    else if (status === "low") lowCount++;
    else okCount++;
  }
  // Worst status: si CUALQUIER variant está agotada → out (alerta total).
  // Si ninguna agotada pero alguna baja → low (advertencia).
  // Si todas OK → ok.
  let worstStatus: StockStatus = "ok";
  if (outCount > 0) worstStatus = "out";
  else if (lowCount > 0) worstStatus = "low";
  return {
    totalUnits,
    variantsCount: active.length,
    outCount,
    lowCount,
    okCount,
    worstStatus,
  };
}
