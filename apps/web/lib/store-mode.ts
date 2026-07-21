/*
 * Store mode — salida en 2 etapas (docs/PLAN_SALIDA_PRODUCCION.md, 2026-07-21).
 *
 *   - "catalog" (Etapa 1): catálogo + cotización por WhatsApp. SIN pagos en
 *     línea (Wompi), SIN envíos integrados (Aveonline), SIN IA (Gemini). El
 *     checkout se convierte en formulario de cotización (features/quotes).
 *   - "full" (Etapa 2): tienda completa con pago y envío. Es el DEFAULT —
 *     si la var falta o trae un valor inválido, asumimos tienda full.
 *
 * La flag es `NEXT_PUBLIC_STORE_MODE` (NEXT_PUBLIC_*) para que el mismo valor
 * sirva en server y client components: Next la inliniza en build en el bundle
 * cliente y la lee de process.env en el servidor.
 */

export type StoreMode = "catalog" | "full";

function readStoreMode(): StoreMode {
  const raw = process.env.NEXT_PUBLIC_STORE_MODE;
  // Fail-closed hacia "full": un typo (ej. "catalogue") NO debe apagar el
  // checkout de la tienda en producción; el modo catálogo se activa solo
  // con el valor exacto.
  return raw === "catalog" || raw === "full" ? raw : "full";
}

export const STORE_MODE: StoreMode = readStoreMode();

export function isCatalogMode(): boolean {
  return STORE_MODE === "catalog";
}
