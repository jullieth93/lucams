/*
 * Schema Zod para suscripción al newsletter.
 *
 * Single opt-in con consentimiento explícito (checkbox obligatorio
 * Ley 1581). Validación email estricta + límite de longitud razonable
 * para evitar abuso.
 */

import { z } from "zod";

export const SubscribeSchema = z.object({
  email: z.string().email("Email inválido").max(254, "Email muy largo"),
  consent: z
    .literal("on", {
      message: "Tienes que aceptar las comunicaciones para continuar.",
    })
    .transform(() => true as const),
});

export type SubscribeInput = z.infer<typeof SubscribeSchema>;
