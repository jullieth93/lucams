/*
 * Paquete G (2026-10-02) — trazabilidad del intento fallido de generación de
 * guía (Order.shipmentLastError, JSON sanitizado SIN PII).
 *
 * Antes, cuando Aveonline rechazaba la guía (ej. "Guía Anulada automáticamente"),
 * el mensaje crudo solo quedaba en los logs y el admin veía un throw genérico.
 * Ahora la saga persiste el intento fallido en Order.shipmentLastError y el
 * detalle admin del pedido muestra la causa real + una sugerencia operativa
 * (tabla de errores: docs/INTEGRATIONS_AVEONLINE.md §4.4).
 *
 * Módulo puro (sin server-only): lo usa la saga (server) y la página admin
 * (server), y se testea sin mocks.
 */

import { scrubPii } from "@/lib/logger";

export type ShipmentLastError = {
  /** Mensaje de la transportadora, sanitizado (scrubPii) y acotado. */
  message: string;
  /** ISO timestamp del intento. */
  at: string;
  /** Carrier elegido en el checkout (slug), null si la orden no lo tenía. */
  carrier: string | null;
  /** Destino OPERATIVO (ciudad/departamento) — nunca dirección ni datos del cliente. */
  destination: { city?: string; department?: string };
  /** true si fue timeout (>20s): resultado DESCONOCIDO, la guía pudo crearse. */
  timeout: boolean;
};

const MAX_MESSAGE_LEN = 500;

/**
 * Construye el registro sanitizado a persistir en Order.shipmentLastError.
 * scrubPii enmascara emails/teléfonos que el mensaje crudo de la transportadora
 * pudiera traer embebidos (misma regla que los logs — Ley 1581).
 */
export function buildShipmentLastError(input: {
  err: unknown;
  carrier: string | null;
  destination: { city?: string; department?: string };
  timeout: boolean;
  now?: Date;
}): ShipmentLastError {
  const raw = input.err instanceof Error ? input.err.message : String(input.err);
  return {
    message: scrubPii(raw).slice(0, MAX_MESSAGE_LEN),
    at: (input.now ?? new Date()).toISOString(),
    carrier: input.carrier,
    destination: input.destination,
    timeout: input.timeout,
  };
}

/** Parse defensivo del JSON persistido (cualquier desviación → null → no se muestra). */
export function parseShipmentLastError(raw: unknown): ShipmentLastError | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.message !== "string" || o.message.length === 0) return null;
  const dest =
    o.destination && typeof o.destination === "object" && !Array.isArray(o.destination)
      ? (o.destination as Record<string, unknown>)
      : {};
  return {
    message: o.message,
    at: typeof o.at === "string" ? o.at : "",
    carrier: typeof o.carrier === "string" ? o.carrier : null,
    destination: {
      city: typeof dest.city === "string" ? dest.city : undefined,
      department: typeof dest.department === "string" ? dest.department : undefined,
    },
    timeout: o.timeout === true,
  };
}

/**
 * Sugerencia operativa de causa según el mensaje de la transportadora, para el
 * detalle admin del pedido. Mapea los errores catalogados en
 * docs/INTEGRATIONS_AVEONLINE.md §4.4 ("Errores comunes generación guía").
 */
export function suggestShipmentFailureCause(error: ShipmentLastError): string {
  if (error.timeout) {
    return (
      "Resultado desconocido (timeout): la guía PUDO crearse en Aveonline. Verifica en su " +
      "panel por la referencia del pedido ANTES de reintentar, para no generar una guía duplicada."
    );
  }
  const msg = error.message.toLowerCase();
  if (msg.includes("anulada")) {
    return (
      "La transportadora anuló la guía al generarla: suele ser un destino sin cobertura para " +
      "esa transportadora, o la cuenta demo de Aveonline (ambiente de pruebas). Revisa la " +
      "cobertura de la ciudad destino o prueba con otra transportadora."
    );
  }
  if (msg.includes("origen no existe")) {
    return (
      "La ciudad de recogida no existe en el catálogo Aveonline: revisa PICKUP_CITY / " +
      "PICKUP_DEPARTMENT en Contenido › Ajustes del sitio (sección Negocio)."
    );
  }
  if (msg.includes("destino no existe")) {
    return (
      "La ciudad/departamento de destino no coincide con el catálogo Aveonline (nombre o " +
      "formato). Corrige la dirección del pedido antes de reintentar."
    );
  }
  if (msg.includes("credenciales") || msg.includes("token")) {
    return "Credenciales Aveonline rechazadas o token vencido: revisa las claves en Integraciones › Aveonline.";
  }
  if (msg.includes("no se encontraron productos")) {
    return "Faltan datos de empaque (peso/dimensiones) en algún producto del pedido: complétalos en el catálogo.";
  }
  if (msg.includes("no se pudo generar") || msg.includes("error al momento de iniciar")) {
    return "Falla entre Aveonline y la transportadora: suele ser temporal; reintenta en unos minutos.";
  }
  return "Causa no catalogada: compara el mensaje con la tabla de errores de docs/INTEGRATIONS_AVEONLINE.md (§4.4).";
}
