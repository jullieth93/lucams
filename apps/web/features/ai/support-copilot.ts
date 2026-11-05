import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import {
  HABEAS_DATA_CLAIM_BUSINESS_DAYS,
  HABEAS_DATA_CONSULTATION_BUSINESS_DAYS,
  RETRACT_REFUND_MAX_CALENDAR_DAYS,
  RETRACT_WINDOW_BUSINESS_DAYS,
  WARRANTY_CLAIM_RESPONSE_BUSINESS_DAYS,
} from "@/lib/consumer-law";
import { SUBJECT_LABELS, type SupportSubject } from "@/features/support/schemas";
import { getSupportTicketDetail } from "@/features/support/thread-service";

/*
 * Copiloto ARM de soporte al cliente con humano en el bucle (`Fase 12 · S26`, `ADR-193`).
 *
 * Principios de seguridad y operación:
 *   1. SOLO LECTURA: sugiere un borrador editable en el panel; NUNCA envía correos,
 *      NUNCA cambia estados de pedidos, NUNCA ejecuta reembolsos ni modifica base de datos.
 *   2. CERO PII HACIA TERCEROS: antes de cualquier llamada a Gemini REST, `sanitizeSupportTextForAi`
 *      redacta emails, teléfonos, cédulas/NIT, números de pedido, URLs/tokens, direcciones físicas
 *      colombianas y el propio nombre del cliente. El saludo personalizado (`Hola <Nombre>,`) se
 *      inyecta localmente en el servidor DESPUÉS de recibir el borrador.
 *   3. DEGRADACIÓN ELEGANTE: si `GEMINI_API_KEY` no está configurada o el proveedor falla/expira,
 *      genera una plantilla inteligente determinista basada en el asunto, el estado real del pedido
 *      y los plazos legales de Colombia (`lib/consumer-law.ts`).
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function geminiModels(): string[] {
  const primary = process.env.GEMINI_MODEL_PRIMARY || "gemini-2.5-flash-lite";
  const fallback = process.env.GEMINI_MODEL_FALLBACK || "gemini-2.5-flash";
  return [...new Set([primary, fallback])];
}

const CopilotResponseSchema = z.object({
  bodyWithoutGreeting: z.string().trim().min(20).max(1600),
  reasoningSummary: z.string().trim().min(5).max(320),
});

const GEMINI_COPILOT_SCHEMA = {
  type: "object",
  properties: {
    bodyWithoutGreeting: { type: "string" },
    reasoningSummary: { type: "string" },
  },
  required: ["bodyWithoutGreeting", "reasoningSummary"],
  propertyOrdering: ["bodyWithoutGreeting", "reasoningSummary"],
} as const;

export type SupportCopilotSuggestion = {
  draftBody: string;
  reasoningSummary: string;
  source: "gemini" | "smart_template";
};

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Redacta determinísticamente cualquier dato personal (emails, celulares, documentos,
 * números de guía/pedido, URLs y direcciones físicas colombianas) antes de construir
 * un prompt hacia un modelo externo. Pura y verificada por tests unitarios.
 */
export function sanitizeSupportTextForAi(
  rawText: string,
  opts?: { knownNames?: Array<string | null | undefined> },
): string {
  if (!rawText) return "";

  let scrubbed = rawText;

  // 1. URLs y enlaces con posibles tokens privados
  scrubbed = scrubbed.replace(/https?:\/\/\S+/gi, "[URL_REDACTADA]");

  // 2. Correos electrónicos
  scrubbed = scrubbed.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL_REDACTADO]");

  // 3. Números de pedido / cotización / oportunidad Lucams (antes de redactar dígitos)
  scrubbed = scrubbed.replace(
    /\b(?:LCM-\d{4}-\d{1,6}|COT-[A-Z0-9]{6}|OP-[A-Z0-9]{6})\b/gi,
    "[REFERENCIA_PEDIDO]",
  );

  // 4. Teléfonos móviles y fijos colombianos (+57 3XX XXX XXXX, 3XXXXXXXXX)
  scrubbed = scrubbed.replace(
    /(?:\+?57[\s.-]?)?\b3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    "[TELEFONO_REDACTADO]",
  );

  // 5. Direcciones físicas colombianas comunes (Calle, Carrera, Av, Transversal, Diagonal, Apto)
  scrubbed = scrubbed.replace(
    /\b(?:calle|cll|cl|carrera|cra|kr|avenida|av|diagonal|diag|transversal|tv)\s+\d+[a-zA-Z]?(?:\s*(?:#|no\.?|nro\.?)\s*\d+[a-zA-Z]?(?:\s*-\s*\d+)?)?/gi,
    "[DIRECCION_REDACTADA]",
  );

  // 6. Cédulas, NIT, cuentas bancarias o guías (secuencias de 6 a 16 dígitos, con o sin puntos/guiones)
  scrubbed = scrubbed.replace(/\b\d{1,3}(?:[.\s-]\d{3}){2,4}(?:-\d)?\b/g, "[DOCUMENTO_REDACTADO]");
  scrubbed = scrubbed.replace(/\b\d{6,16}(?:-\d)?\b/g, "[DOCUMENTO_REDACTADO]");

  // 7. Nombres conocidos del titular (nombre completo + tokens >= 3 caracteres)
  const nameTokens = new Set<string>();
  for (const candidate of opts?.knownNames ?? []) {
    if (!candidate) continue;
    const clean = candidate.trim();
    if (clean.length >= 3) nameTokens.add(clean);
    for (const part of clean.split(/\s+/)) {
      const normalizedPart = part.replace(/[^\p{L}]/gu, "");
      if (normalizedPart.length >= 3) {
        nameTokens.add(normalizedPart);
      }
    }
  }
  const sortedNames = [...nameTokens].sort((a, b) => b.length - a.length);
  for (const token of sortedNames) {
    const re = new RegExp(`\\b${escapeRegExp(token)}\\b`, "gi");
    scrubbed = scrubbed.replace(re, "[CLIENTE]");
  }

  return scrubbed.replace(/\s+/g, " ").trim().slice(0, 1800);
}

type OrderSafeSnapshot = {
  number: string;
  status: string;
  paymentMethod: string;
  shippingCarrier: string | null;
  hasTrackingNumber: boolean;
  deliveredAt: Date | null;
  hasCustomDesignItem: boolean;
  itemSummaries: string[];
  minWarrantyMonths: number;
};

const ORDER_STATUS_HUMAN: Record<string, string> = {
  DRAFT: "borrador",
  PENDING_PAYMENT: "pendiente de confirmación de pago",
  PAID: "pago confirmado, entrando a producción en taller",
  FULFILLING: "en producción y control de calidad en nuestro taller",
  SHIPPED: "despachado con transportadora",
  DELIVERED: "entregado",
  CANCELLED: "cancelado",
  REFUNDED: "reembolsado",
};

function extractFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  const cleaned = first.replace(/[^\p{L}-]/gu, "");
  if (!cleaned) return "hola";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

function buildSmartTemplateFallback(params: { subject: string; order: OrderSafeSnapshot | null }): {
  bodyWithoutGreeting: string;
  reasoningSummary: string;
} {
  const { subject, order } = params;
  const orderLine = order
    ? `Revisamos tu pedido ${order.number} y actualmente figura como «${ORDER_STATUS_HUMAN[order.status] ?? order.status}»${
        order.hasTrackingNumber && order.shippingCarrier
          ? ` a través de ${order.shippingCarrier}`
          : ""
      }.`
    : "Estamos revisando los detalles de tu solicitud en nuestro sistema.";

  switch (subject as SupportSubject) {
    case "MI_PEDIDO":
    case "ENVIO_RASTREO":
      return {
        bodyWithoutGreeting: `${orderLine} ${
          order?.status === "SHIPPED"
            ? "Tu paquete ya salió de nuestro taller y puedes consultar las novedades de rastreo desde el enlace de seguimiento de tu pedido."
            : order?.status === "PAID" || order?.status === "FULFILLING"
              ? "En este momento estamos cuidando la impresión y el acabado magnético en nuestro taller; apenas entreguemos el paquete a la transportadora te enviaremos el número de guía por correo."
              : "Si tienes algún dato adicional o necesitas que verifiquemos un comprobante, cuéntanos por este mismo hilo y te ayudamos enseguida."
        }\n\nQuedamos muy pendientes de cualquier duda adicional.`,
        reasoningSummary: order
          ? `Plantilla contextual según estado real del pedido (${order.status}) sin exponer PII.`
          : "Plantilla contextual de seguimiento de pedido (sin orden vinculada).",
      };

    case "GARANTIA_DEVOLUCION":
      if (order?.hasCustomDesignItem) {
        return {
          bodyWithoutGreeting: `${orderLine} Queremos contarte con total claridad cómo funciona tu respaldo: al tratarse de un producto personalizado con tus propias fotos o diseño, conforme al artículo 47 numeral 3 de la Ley 1480 de 2011 no aplica el retracto por cambio de opinión; sin embargo, cuentas con toda nuestra garantía de calidad (${order.minWarrantyMonths} ${order.minWarrantyMonths === 1 ? "mes" : "meses"}) si recibiste algún defecto de impresión, corte, imán o daño en el transporte.\n\nPor favor compártenos por aquí una foto del producto recibido para darte respuesta de fondo dentro del plazo legal (máximo ${WARRANTY_CLAIM_RESPONSE_BUSINESS_DAYS} días hábiles, aunque solemos resolverlo mucho antes).`,
          reasoningSummary:
            "Pedido con diseño personalizado detectado: explica excepción legal de retracto (Ley 1480 art. 47.3) y ofrece ruta inmediata de garantía de calidad.",
        };
      }
      return {
        bodyWithoutGreeting: `${orderLine} Recuerda que para productos estándar (no personalizados) cuentas con ${RETRACT_WINDOW_BUSINESS_DAYS} días hábiles desde la entrega para ejercer el derecho de retracto (con reembolso en máximo ${RETRACT_REFUND_MAX_CALENDAR_DAYS} días calendario según la Ley 2439 de 2024), o con nuestra garantía legal de calidad si el producto presentó algún defecto (respuesta en máximo ${WARRANTY_CLAIM_RESPONSE_BUSINESS_DAYS} días hábiles).\n\nCuéntanos si deseas tramitar garantía por novedad de calidad o retracto para activar el caso formal de inmediato.`,
        reasoningSummary:
          "Plantilla alineada con plazos legales colombianos de retracto (5 días hábiles) y garantía (15 días hábiles).",
      };

    case "PERSONALIZACION":
      return {
        bodyWithoutGreeting: `${orderLine} Con gusto te ayudamos con el diseño de tus imanes. Si tu pedido aún no ha entrado a impresión final en el taller, podemos revisar el ajuste contigo; cuéntanos qué cambio te gustaría hacer o si tuviste algún inconveniente subiendo tus fotos en el Estudio para guiarte paso a paso.`,
        reasoningSummary:
          "Plantilla de acompañamiento para Estudio de personalización condicionada a etapa previa a impresión.",
      };

    case "MAYORISTA":
      return {
        bodyWithoutGreeting:
          "¡Qué alegría que pienses en Lucams para tu evento o empresa! Manejamos precios escalonados por volumen y empaque especial para regalos corporativos, bodas y celebraciones.\n\nCuéntanos cuántas unidades aproximadas necesitas, para qué ciudad y para qué fecha tienes planeado el evento, y te preparamos una propuesta a medida hoy mismo.",
        reasoningSummary:
          "Plantilla consultiva B2B enfocada en volumen, ciudad destino y fecha límite del evento.",
      };

    case "PAGO_FACTURACION":
      return {
        bodyWithoutGreeting: `${orderLine} Si realizaste tu pago por Wompi y aún aparece en validación, o si necesitas soporte con los datos de tu comprobante, compártenos la referencia de transacción para conciliarlo de inmediato con nuestro equipo administrativo.`,
        reasoningSummary:
          "Plantilla de soporte de pagos y facturación sin asumir reembolsos automáticos.",
      };

    default:
      return {
        bodyWithoutGreeting: `${orderLine} Gracias por escribirnos a Lucams. Ya tomamos tu caso y estamos revisando cada detalle${
          subject === "OTRO"
            ? ` (recuerda que si tu consulta es sobre protección de datos personales Ley 1581, la atendemos con prioridad dentro de los ${HABEAS_DATA_CONSULTATION_BUSINESS_DAYS} a ${HABEAS_DATA_CLAIM_BUSINESS_DAYS} días hábiles de ley)`
            : ""
        }.\n\nCuéntanos si deseas agregar algún detalle adicional y te responderemos por este mismo hilo.`,
        reasoningSummary:
          "Plantilla base cálida en español de Colombia (tuteo) con contexto del ticket.",
      };
  }
}

const COPILOT_SYSTEM_PROMPT = [
  "Eres el copiloto interno de atención al cliente de Lucams Shop (tienda colombiana de imanes personalizados).",
  "Redactas un BORRADOR para que un agente humano lo revise antes de enviarlo al cliente.",
  "Usa SIEMPRE español de Colombia con tuteo cálido, empático y claro (tú, puedes, cuéntanos; PROHIBIDO cualquier voseo rioplatense o regional).",
  "PROHIBIDO inventar estados de pedido, guías, descuentos o prometer reembolsos ya ejecutados.",
  "NO incluyas saludo inicial ('Hola ...') ni firma personal: empieza directamente con el cuerpo útil del mensaje.",
  "Respeta estrictamente la ley colombiana: retracto 5 días hábiles desde entrega SOLO para productos NO personalizados; los productos personalizados hechos según especificaciones del cliente están exceptuados de retracto (Ley 1480 art. 47 num. 3), pero SÍ tienen garantía por defecto de calidad o daño en transporte (respuesta máx. 15 días hábiles). Reembolsos aprobados tardan máx. 15 días calendario (Ley 2439 de 2024). Consultas Habeas Data máx. 10 días hábiles y reclamos 15 días hábiles (Ley 1581).",
  "Devuelve exclusivamente JSON válido con bodyWithoutGreeting y reasoningSummary.",
].join(" ");

/**
 * Genera una sugerencia de respuesta para el ticket indicado.
 * Solo lectura: no muta el ticket ni envía correos.
 */
export async function generateSupportReplySuggestion(
  ticketId: string,
): Promise<SupportCopilotSuggestion | null> {
  const ticket = await getSupportTicketDetail(ticketId);
  if (!ticket) return null;

  let orderSnapshot: OrderSafeSnapshot | null = null;
  if (ticket.resolvedOrderNumber) {
    const order = await prisma.order.findUnique({
      where: { number: ticket.resolvedOrderNumber },
      select: {
        number: true,
        status: true,
        paymentMethod: true,
        shippingCarrier: true,
        trackingNumber: true,
        deliveredAt: true,
        items: {
          select: {
            qty: true,
            warrantyMonths: true,
            designId: true,
            variant: {
              select: {
                name: true,
                product: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (order) {
      orderSnapshot = {
        number: order.number,
        status: order.status,
        paymentMethod: order.paymentMethod,
        shippingCarrier: order.shippingCarrier,
        hasTrackingNumber: Boolean(order.trackingNumber),
        deliveredAt: order.deliveredAt,
        hasCustomDesignItem: order.items.some((it) => Boolean(it.designId)),
        itemSummaries: order.items.map(
          (it) =>
            `${it.qty}x ${it.variant.product.name} (${it.variant.name})${it.designId ? " [personalizado]" : " [estándar]"}`,
        ),
        minWarrantyMonths:
          order.items.length > 0 ? Math.min(...order.items.map((it) => it.warrantyMonths)) : 1,
      };
    }
  }

  const firstName = extractFirstName(ticket.name);
  const greeting = firstName === "hola" ? "¡Hola!" : `¡Hola ${firstName}!`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const fallback = buildSmartTemplateFallback({
      subject: ticket.subject,
      order: orderSnapshot,
    });
    return {
      draftBody: `${greeting}\n\n${fallback.bodyWithoutGreeting}\n\nUn abrazo,\nEquipo Lucams`,
      reasoningSummary: fallback.reasoningSummary,
      source: "smart_template",
    };
  }

  // Construir contexto 100 % libre de PII para Gemini
  const publicMessages = ticket.messages.filter((m) => !m.isInternal).slice(-5);
  const scrubbedInitial = sanitizeSupportTextForAi(ticket.message, {
    knownNames: [ticket.name],
  });
  const scrubbedThread = publicMessages.map(
    (m) =>
      `${m.authorKind === "ADMIN" ? "Agente" : "Cliente"}: ${sanitizeSupportTextForAi(m.body, {
        knownNames: [ticket.name],
      })}`,
  );

  const subjectHuman = (SUBJECT_LABELS as Record<string, string>)[ticket.subject] ?? ticket.subject;

  const promptLines = [
    `Asunto del ticket: ${subjectHuman} (${ticket.subject})`,
    `Mensaje inicial del cliente (PII redactada): "${scrubbedInitial}"`,
    ...(scrubbedThread.length > 0
      ? ["Historial reciente del hilo (PII redactada):", ...scrubbedThread]
      : []),
    orderSnapshot
      ? [
          "Contexto operativo verificado del pedido (sin PII):",
          `- Estado actual: ${ORDER_STATUS_HUMAN[orderSnapshot.status] ?? orderSnapshot.status} (${orderSnapshot.status})`,
          `- Método de pago: ${orderSnapshot.paymentMethod}`,
          `- Guía generada: ${orderSnapshot.hasTrackingNumber ? "Sí" : "No"}`,
          `- Incluye productos personalizados a medida: ${orderSnapshot.hasCustomDesignItem ? "Sí" : "No"}`,
          `- Ítems: ${orderSnapshot.itemSummaries.join("; ")}`,
          `- Garantía aplicable del pedido: ${orderSnapshot.minWarrantyMonths} mes(es)`,
        ].join("\n")
      : "Contexto operativo del pedido: El ticket no tiene un pedido verificado vinculado.",
  ].join("\n\n");

  for (const model of geminiModels()) {
    try {
      const res = await fetchWithTimeout(`${GEMINI_API_BASE}/${model}:generateContent`, {
        method: "POST",
        timeoutMs: 10000,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: COPILOT_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: promptLines }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: GEMINI_COPILOT_SCHEMA,
            temperature: 0.35,
            maxOutputTokens: 550,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`gemini ${model} HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJson) throw new Error(`gemini ${model} respuesta vacía`);

      const parsed = CopilotResponseSchema.parse(JSON.parse(rawJson));
      const bodyWithOrderRef = orderSnapshot
        ? parsed.bodyWithoutGreeting.replace(/\[REFERENCIA_PEDIDO\]/g, orderSnapshot.number)
        : parsed.bodyWithoutGreeting;

      return {
        draftBody: `${greeting}\n\n${bodyWithOrderRef}\n\nUn abrazo,\nEquipo Lucams`,
        reasoningSummary: parsed.reasoningSummary,
        source: "gemini",
      };
    } catch (err) {
      logger.warn({
        event: "ai.support_copilot.model_fail",
        model,
        ticketId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Fallback seguro si todos los modelos de Gemini fallan o expiran
  const fallback = buildSmartTemplateFallback({
    subject: ticket.subject,
    order: orderSnapshot,
  });
  return {
    draftBody: `${greeting}\n\n${fallback.bodyWithoutGreeting}\n\nUn abrazo,\nEquipo Lucams`,
    reasoningSummary: `${fallback.reasoningSummary} (respaldo local por indisponibilidad temporal de IA).`,
    source: "smart_template",
  };
}
