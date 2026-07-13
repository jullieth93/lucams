"use server";

/*
 * Server action para enviar un ticket de soporte desde /contacto.
 *
 * Pipeline:
 *  1. Valida con Zod
 *  2. Rate-limit por IP (5 mensajes/día) y por email (3/día) para
 *     mitigar spam — combinación cubre tanto botnets como un atacante
 *     único con muchos emails
 *  3. Crea SupportTicket en DB (status=OPEN)
 *  4. Loguea evento support.ticket.created
 *
 * Email a hola@lucamsshop.co se difiere a sub-bloque G (lib/resend.ts
 * + templates react-email). Por ahora solo persiste en DB.
 *
 * Turnstile: validación pendiente para sub-bloque F (cuando se cablée
 * el widget en el form).
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { emailKey, hashEmail, ipKey } from "@/lib/rate-limit-keys";
import { logger } from "@/lib/logger";
import { getCurrentCustomer } from "@/lib/auth";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { sendEmail } from "@/lib/resend";
import { getSettingValue } from "@/lib/cms";
import { supportTicketReceivedEmail } from "@/features/emails/templates/support-ticket-received";
import { supportTicketInternalEmail } from "@/features/emails/templates/support-ticket-internal";
import { SupportTicketSchema, type SupportTicketInput } from "./schemas";
import { getClientIp } from "@/lib/client-ip";

export type SupportActionState =
  | { ok: true; ticketId: string }
  | { ok: false; error: string; fieldErrors?: Partial<Record<keyof SupportTicketInput, string[]>> }
  | null;

export async function submitContactAction(
  _prev: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const parsed = SupportTicketSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    subject: formData.get("subject"),
    message: String(formData.get("message") ?? "").trim(),
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      ok: false,
      error: "Revisa los campos marcados.",
      fieldErrors: flat.fieldErrors as Partial<Record<keyof SupportTicketInput, string[]>>,
    };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const userAgent = hdrs.get("user-agent") ?? null;

  // Turnstile: bloquea bots. En dev sin secret pasa automáticamente.
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");
  const turnstile = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstile.success) {
    logger.warn({ event: "support.ticket.turnstile_failed", ip, reason: turnstile.reason });
    return {
      ok: false,
      error: "Validación anti-bot falló. Recarga la página e intenta de nuevo.",
    };
  }

  // Rate-limit: 5/día por IP + 3/día por email hash. 24h window.
  const [byIp, byEmail] = await Promise.all([
    rateLimit(ipKey("contact", ip), 5, 24 * 60 * 60),
    rateLimit(emailKey("contact", parsed.data.email), 3, 24 * 60 * 60),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    logger.warn({
      event: "support.ticket.rate_limited",
      ip,
      emailHash: hashEmail(parsed.data.email),
      byIpAllowed: byIp.allowed,
      byEmailAllowed: byEmail.allowed,
    });
    return {
      ok: false,
      error:
        "Recibimos varios mensajes desde tu cuenta hoy. Si es urgente, escríbenos por WhatsApp.",
    };
  }

  try {
    const session = await getCurrentCustomer();
    const ticket = await prisma.supportTicket.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        subject: parsed.data.subject,
        message: parsed.data.message,
        status: "OPEN",
        ip,
        userAgent,
        customerId: session?.customer.id ?? null,
      },
      select: { id: true },
    });

    logger.info({
      event: "support.ticket.created",
      ticketId: ticket.id,
      subject: parsed.data.subject,
      hasCustomer: !!session?.customer.id,
    });

    // Emails fire-and-forget (no bloquean response). 2 templates:
    //   - received: confirmación al cliente con su mensaje
    //   - internal: notificación a hola@lucamsshop.co con Reply-To
    void (async () => {
      const contactEmail = await getSettingValue("CONTACT_EMAIL", "hola@lucamsshop.co");
      const [received, internal] = await Promise.all([
        supportTicketReceivedEmail({
          customerName: parsed.data.name,
          ticketId: ticket.id,
          subject: parsed.data.subject,
          message: parsed.data.message,
        }),
        supportTicketInternalEmail({
          customerName: parsed.data.name,
          customerEmail: parsed.data.email,
          ticketId: ticket.id,
          subject: parsed.data.subject,
          message: parsed.data.message,
          ip,
        }),
      ]);
      await Promise.all([
        sendEmail({
          to: parsed.data.email,
          subject: received.subject,
          html: received.html,
          text: received.text,
          idempotencyKey: `support:received:${ticket.id}`,
          tags: [{ name: "kind", value: "support-received" }],
        }),
        sendEmail({
          to: contactEmail,
          subject: internal.subject,
          html: internal.html,
          text: internal.text,
          replyTo: internal.replyTo,
          idempotencyKey: `support:internal:${ticket.id}`,
          tags: [{ name: "kind", value: "support-internal" }],
        }),
      ]);
    })();

    return { ok: true, ticketId: ticket.id };
  } catch (err) {
    logger.error({
      event: "support.ticket.create_failed",
      ip,
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      error:
        "No pudimos enviar tu mensaje. Prueba de nuevo en unos minutos o escríbenos por WhatsApp.",
    };
  }
}
