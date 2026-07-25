/*
 * Zod schema del formulario de cotización (Etapa 1 — modo catálogo).
 *
 * "Cotización de 1 paso": nombre, WhatsApp, email opcional, ciudad,
 * departamento y notas. Validaciones acordes a Colombia (Lucy 2026-05-21,
 * mismas del checkout): nombre solo letras, móvil CO 10 dígitos empezando
 * con 3 (se normaliza con stripPhone — tolera +57 y espacios).
 */

import { z } from "zod";
import { stripPhone, validatePhone } from "@/lib/colombia-validators";

export const QuoteFormSchema = z.object({
  customerName: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(80, "Máximo 80 caracteres")
    .regex(/^[A-Za-zÀ-ÿ\s.''\-]+$/u, "El nombre solo puede tener letras")
    .trim(),
  // Móvil colombiano: 10 dígitos empezando con 3. Se persiste normalizado
  // (sin +57, sin espacios) vía stripPhone — ver lib/colombia-validators.
  customerWhatsapp: z
    .string()
    .min(1, "El WhatsApp es requerido")
    .refine(validatePhone, "Debe ser un móvil colombiano de 10 dígitos (300...)")
    .transform(stripPhone),
  // OBLIGATORIO desde 2026-07-25: la cotización se envía por WhatsApp Y por correo, así que sin
  // email se pierde el respaldo escrito — y con él la copia que le queda al cliente de lo que
  // cotizó. Se normaliza a minúsculas y sin espacios antes de validar.
  customerEmail: z
    .string()
    .transform((v) => v.trim().toLowerCase())
    .pipe(z.email("Email inválido").max(254)),
  city: z.string().min(2, "La ciudad es requerida").max(80).trim(),
  department: z.string().min(2, "El departamento es requerido").max(80).trim(),
  notes: z
    .string()
    .max(500, "Máximo 500 caracteres")
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
});
export type QuoteFormInput = z.infer<typeof QuoteFormSchema>;
