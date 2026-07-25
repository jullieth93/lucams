/*
 * Guard de ETAPA: frontera server-side entre el modo catálogo (Etapa 1, no transaccional) y
 * el modo full (Etapa 2, con pago y envío).
 *
 * Por qué existe (auditoría 2026-07-21, hallazgo A3). `isCatalogMode()` se evaluaba SOLO en las
 * `page.tsx` — las páginas de checkout redirigían y los formularios no se renderizaban. Pero las
 * Server Actions de Next son **endpoints POST**: sus IDs viven en el bundle desplegado, así que
 * seguían siendo invocables por un POST crafteado aunque nadie pudiera llegar a ellas por la UI.
 * Un invitado podía recorrer datos → envío → pago y llegar a `finalizeCheckout`, creando Orders
 * REALES (con commit de stock y correo de confirmación desde el dominio de marca a una dirección
 * arbitraria) en una tienda que legalmente todavía no vende. Esconder la UI no es autorizar.
 *
 * Dos capas a propósito:
 *   - `guardTransactionalAction()` en cada Server Action → corta y devuelve al flujo de cotización.
 *   - `assertTransactionalAllowed()` en la capa de servicio → backstop que lanza aunque alguien
 *     agregue mañana una acción nueva y olvide el guard de arriba.
 *
 * Efecto secundario deliberado: mientras la tienda esté en modo catálogo, esto también neutraliza
 * los hallazgos transaccionales pendientes (precio de carrito, flete del formulario, race de COD)
 * si el flag de modo llegara a volcarse por error de configuración.
 */

import "server-only";
import { redirect } from "next/navigation";
import { isCatalogMode } from "@/lib/store-mode";
import { logger } from "@/lib/logger";

/** Ruta a la que se devuelve a quien intente transaccionar en modo catálogo (form de cotización). */
export const CATALOG_FALLBACK_PATH = "/checkout/datos";

/** Falla de la capa de servicio: se intentó una operación transaccional en modo catálogo. */
export class StageError extends Error {
  readonly operation: string;

  constructor(operation: string) {
    super(
      `Operación transaccional "${operation}" no disponible: la tienda está en modo catálogo (Etapa 1).`,
    );
    this.name = "StageError";
    this.operation = operation;
  }
}

/**
 * Guard para Server Actions. En modo catálogo corta la ejecución con un redirect al formulario
 * de cotización; en modo full es un no-op.
 *
 * `redirect()` lanza NEXT_REDIRECT, así que NUNCA retorna cuando bloquea. Llamar SIEMPRE como
 * primera sentencia de la acción, antes de leer o persistir cualquier dato.
 */
export function guardTransactionalAction(action: string): void {
  if (!isCatalogMode()) return;
  logger.warn({ event: "stage.transactional_action_blocked", action });
  redirect(CATALOG_FALLBACK_PATH);
}

/**
 * Backstop para la capa de servicio (finalizeCheckout, createOrderFromCart…). Lanza `StageError`
 * en modo catálogo. No redirige: el servicio no conoce el transporte.
 */
export function assertTransactionalAllowed(operation: string): void {
  if (!isCatalogMode()) return;
  logger.error({ event: "stage.transactional_service_blocked", operation });
  throw new StageError(operation);
}
