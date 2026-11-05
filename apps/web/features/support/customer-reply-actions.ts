"use server";

/*
 * Server Actions para respuestas del cliente en `/mi-cuenta/soporte` y `/soporte/[token]` (`S21`).
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentCustomer } from "@/lib/auth";
import { getClientIp } from "@/lib/client-ip";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import {
  addCustomerReplyForSession,
  addGuestReplyByToken,
  CustomerSupportReplyError,
} from "./public-thread-service";

export type CustomerReplyFormState = {
  ok?: boolean;
  error?: string;
  successMessage?: string;
} | null;

export async function replyToCustomerSupportTicketAction(
  _prev: CustomerReplyFormState,
  formData: FormData,
): Promise<CustomerReplyFormState> {
  const session = await getCurrentCustomer();
  if (!session) {
    return { ok: false, error: "Inicia sesión nuevamente para enviar tu mensaje." };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const rl = await rateLimit(ipKey("support-reply-auth", ip), 15, 60 * 60);
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Has enviado varios mensajes seguidos. Espera unos minutos antes de continuar.",
    };
  }

  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const body = String(formData.get("body") ?? "");

  try {
    const res = await addCustomerReplyForSession({
      ticketId,
      customerId: session.customer.id,
      body,
    });

    logger.info({
      event: "support.ticket.customer_replied",
      ticketId,
      messageId: res.messageId,
      reopened: res.reopened,
      mode: "authenticated",
    });

    revalidatePath("/mi-cuenta/soporte");
    revalidatePath("/admin/soporte");
    revalidatePath(`/admin/soporte/${ticketId}`);

    return {
      ok: true,
      successMessage: res.reopened
        ? "Recibimos tu respuesta y reabrimos la solicitud para nuestro equipo."
        : "Tu mensaje quedó agregado a la conversación.",
    };
  } catch (err) {
    const msg =
      err instanceof CustomerSupportReplyError
        ? err.message
        : "No pudimos guardar tu mensaje. Intenta nuevamente.";
    return { ok: false, error: msg };
  }
}

export async function replyToGuestSupportTicketAction(
  _prev: CustomerReplyFormState,
  formData: FormData,
): Promise<CustomerReplyFormState> {
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const rl = await rateLimit(ipKey("support-reply-guest", ip), 10, 60 * 60);
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Has enviado varios mensajes seguidos. Espera unos minutos antes de continuar.",
    };
  }

  const token = String(formData.get("token") ?? "").trim();
  const body = String(formData.get("body") ?? "");

  try {
    const res = await addGuestReplyByToken({ token, body });

    logger.info({
      event: "support.ticket.customer_replied",
      ticketId: res.ticketId,
      messageId: res.messageId,
      reopened: res.reopened,
      mode: "guest_token",
    });

    revalidatePath(`/soporte/${token}`);
    revalidatePath("/admin/soporte");
    revalidatePath(`/admin/soporte/${res.ticketId}`);

    return {
      ok: true,
      successMessage: res.reopened
        ? "Recibimos tu respuesta y reabrimos la solicitud para nuestro equipo."
        : "Tu mensaje quedó agregado a la conversación.",
    };
  } catch (err) {
    const msg =
      err instanceof CustomerSupportReplyError
        ? err.message
        : "No pudimos guardar tu mensaje. Intenta nuevamente.";
    return { ok: false, error: msg };
  }
}
