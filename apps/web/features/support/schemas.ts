import { z } from "zod";

// No reordenar ni renombrar valores: hay tickets históricos en DB, tests y
// plantillas de email que referencian estos strings. Los nuevos se agregan al final.
export const SUPPORT_SUBJECTS = [
  "CONSULTA_PRODUCTO",
  "PERSONALIZACION",
  "MI_PEDIDO",
  "GARANTIA_DEVOLUCION",
  "MAYORISTA",
  "OTRO",
  "ENVIO_RASTREO",
  "PAGO_FACTURACION",
] as const;

export type SupportSubject = (typeof SUPPORT_SUBJECTS)[number];

/** Asuntos para los que el form pide (opcional) el número de pedido. */
export const ORDER_RELATED_SUBJECTS: readonly SupportSubject[] = [
  "MI_PEDIDO",
  "GARANTIA_DEVOLUCION",
  "ENVIO_RASTREO",
];

// Order.number es string con prefijo de año ("LCM-2026-0001"), no un Int — el
// cliente lo copia de su correo/pedido; también aceptamos solo los dígitos
// ("1042") y el admin resuelve por sufijo.
export const ORDER_NUMBER_REGEX = /^(?:LCM-\d{4}-)?\d{1,6}$/i;

const orderNumberField = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === "" || ORDER_NUMBER_REGEX.test(v), {
    message: "Número de pedido inválido (ej. LCM-2026-0001)",
  })
  .transform((v) => (v === "" ? undefined : v.toUpperCase()))
  .optional();

export const SupportTicketSchema = z.object({
  name: z.string().min(2, "Nombre muy corto").max(120),
  email: z.string().email("Email inválido").max(200),
  subject: z.enum(SUPPORT_SUBJECTS, "Asunto inválido"),
  message: z.string().min(10, "Cuéntanos un poco más").max(4000),
  orderNumber: orderNumberField,
});

export type SupportTicketInput = z.infer<typeof SupportTicketSchema>;

export const SUBJECT_LABELS: Record<(typeof SUPPORT_SUBJECTS)[number], string> = {
  CONSULTA_PRODUCTO: "Consulta sobre un producto",
  PERSONALIZACION: "Personalización",
  MI_PEDIDO: "Estado de mi pedido",
  GARANTIA_DEVOLUCION: "Garantía o devolución",
  MAYORISTA: "Mayorista / Evento corporativo",
  OTRO: "Otro",
  ENVIO_RASTREO: "Envíos y rastreo",
  PAGO_FACTURACION: "Pagos y comprobantes",
};
