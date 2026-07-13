import type { DesignSuggestInput, RawSuggestion } from "./schemas";

/*
 * Adaptador proveedor-agnóstico del asistente IA (ADR-058, patrón PaymentProvider). La lógica del
 * asistente (service, action, UI) depende SOLO de esta interfaz — cambiar de Gemini a otro proveedor
 * (o sumar un segundo) no toca nada más.
 */

export interface AiProvider {
  /** Nombre para logs/telemetría. */
  readonly name: string;
  /** Genera una sugerencia de diseño. Lanza AiUnavailableError si no puede (el caller cae a "sin ideas"). */
  suggestDesign(input: DesignSuggestInput): Promise<RawSuggestion>;
}

/** El proveedor no pudo responder (sin key, error de red, rate-limit del proveedor, respuesta inválida). */
export class AiUnavailableError extends Error {
  constructor(message = "Asistente IA no disponible") {
    super(message);
    this.name = "AiUnavailableError";
  }
}
