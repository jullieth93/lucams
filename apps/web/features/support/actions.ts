"use server";

/*
 * Server action para enviar un ticket de soporte desde /contacto.
 *
 * Pipeline:
 *  1. Valida con Zod
 *  2. Turnstile anti-bot (en dev sin secret pasa automáticamente)
 *  3. Rate-limit por IP (5 mensajes/día) y por email (3/día) para
 *     mitigar spam — combinación cubre tanto botnets como un atacante
 *     único con muchos emails
 *  4. Crea SupportTicket en DB (status=OPEN)
 *  5. Loguea evento support.ticket.created
 *  6. Emails vía Resend (lib/resend.ts + templates del registry), fire-and-forget
 *     con after(): acuse al cliente y notificación interna a la setting
 *     CONTACT_EMAIL (default hola@lucamsshop.com) con Reply-To al cliente.
 */

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { emailKey, hashEmail, ipKey } from "@/lib/rate-limit-keys";
import { logger } from "@/lib/logger";
import { getStorefrontCustomerForForm } from "@/lib/auth";
import { recordHabeasDataConsent } from "@/features/consent/service";
import { resolveSupportTicketContact } from "@/features/identity/resolution-service";
import { computeSupportTicketSlaDueAt } from "@/lib/colombian-sla";
import { hashBearerToken } from "@/lib/token-hash";
import { buildPublicShareUrl } from "@/lib/public-url";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { sendEmail } from "@/lib/resend";
import { getSettingValue } from "@/lib/cms";
import {
  renderSupportTicketReceivedEmail,
  renderSupportTicketInternalEmail,
} from "@/features/emails/registry";
import { SupportTicketSchema, ORDER_RELATED_SUBJECTS, type SupportTicketInput } from "./schemas";
import { getClientIp } from "@/lib/client-ip";

export type SupportActionFieldKey = keyof SupportTicketInput | "dataConsent";

export type SupportActionState =
  | { ok: true; ticketId: string; threadPath: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<SupportActionFieldKey, string[]>>;
    }
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
    orderNumber: String(formData.get("orderNumber") ?? ""),
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      ok: false,
      error: "Revisa los campos marcados.",
      fieldErrors: flat.fieldErrors as Partial<Record<SupportActionFieldKey, string[]>>,
    };
  }

  if (formData.get("dataConsent") !== "on") {
    return {
      ok: false,
      error: "Autoriza el tratamiento de tus datos personales para enviar tu solicitud.",
      fieldErrors: {
        dataConsent: ["Debes autorizar el tratamiento de tus datos personales (Ley 1581 de 2012)."],
      },
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
    const session = await getStorefrontCustomerForForm(parsed.data.email);
    const contactId = await resolveSupportTicketContact(prisma, {
      customerId: session?.customer.id ?? null,
      email: parsed.data.email,
      name: parsed.data.name,
    });
    const now = new Date();
    const plainThreadToken = randomBytes(16).toString("hex");
    const threadPath = `/soporte/${plainThreadToken}`;
    const threadUrl = buildPublicShareUrl(threadPath);

    const ticket = await prisma.supportTicket.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        subject: parsed.data.subject,
        message: parsed.data.message,
        // Solo se persiste cuando el asunto es de pedido (el form solo lo muestra
        // en esos casos; acá se re-filtra por si viene forjado en el POST).
        orderNumber: ORDER_RELATED_SUBJECTS.includes(parsed.data.subject)
          ? (parsed.data.orderNumber ?? null)
          : null,
        status: "OPEN",
        publicAccessTokenHash: hashBearerToken(plainThreadToken),
        slaDueAt: computeSupportTicketSlaDueAt(now, parsed.data.subject),
        ip,
        userAgent,
        customerId: session?.customer.id ?? null,
        ...(contactId ? { contactId } : {}),
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
    //   - received: confirmación al cliente con su mensaje + enlace seguro /soporte/<token>
    //   - internal: notificación a hola@lucamsshop.com con Reply-To
    // after(): en Vercel la función serverless puede congelarse al devolver la respuesta y matar un
    // `void (async …)()` antes de que corra. after() difiere el trabajo para DESPUÉS de responder,
    // garantizando que ambos correos salgan (auditoría v3 · #14).
    after(async () => {
      try {
        await recordHabeasDataConsent({
          customerId: session?.customer.id ?? null,
          contactId,
          email: parsed.data.email,
          ip,
          userAgent,
          verificationSource: "SUPPORT_TICKET",
        });
      } catch (consentErr) {
        logger.warn({
          event: "support.ticket.consent_record_fail",
          ticketId: ticket.id,
          err: consentErr instanceof Error ? consentErr.message : String(consentErr),
        });
      }
      // try/catch: un throw aquí (p. ej. DB caída al leer CONTACT_EMAIL o un template que
      // revienta) mataría AMBOS correos como unhandled rejection silenciosa — el cliente ya
      // recibió su ok y nadie se enteraría del fallo salvo en logs de runtime.
      try {
        const contactEmail = await getSettingValue("CONTACT_EMAIL", "hola@lucamsshop.com");
        const [received, internal] = await Promise.all([
          renderSupportTicketReceivedEmail({
            customerName: parsed.data.name,
            ticketId: ticket.id,
            subject: parsed.data.subject,
            message: parsed.data.message,
            threadUrl,
          }),
          renderSupportTicketInternalEmail({
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
      } catch (err) {
        logger.error({
          event: "support.ticket.email_failed",
          ticketId: ticket.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    });

    return { ok: true, ticketId: ticket.id, threadPath };
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
