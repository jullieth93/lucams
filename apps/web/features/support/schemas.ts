import { z } from "zod";

export const SUPPORT_SUBJECTS = [
  "CONSULTA_PRODUCTO",
  "PERSONALIZACION",
  "MI_PEDIDO",
  "GARANTIA_DEVOLUCION",
  "MAYORISTA",
  "OTRO",
] as const;

export const SupportTicketSchema = z.object({
  name: z.string().min(2, "Nombre muy corto").max(120),
  email: z.string().email("Email inválido").max(200),
  subject: z.enum(SUPPORT_SUBJECTS, "Asunto inválido"),
  message: z.string().min(10, "Cuéntanos un poco más").max(4000),
});

export type SupportTicketInput = z.infer<typeof SupportTicketSchema>;

export const SUBJECT_LABELS: Record<(typeof SUPPORT_SUBJECTS)[number], string> = {
  CONSULTA_PRODUCTO: "Consulta sobre un producto",
  PERSONALIZACION: "Personalización",
  MI_PEDIDO: "Estado de mi pedido",
  GARANTIA_DEVOLUCION: "Garantía o devolución",
  MAYORISTA: "Mayorista / Evento corporativo",
  OTRO: "Otro",
};
