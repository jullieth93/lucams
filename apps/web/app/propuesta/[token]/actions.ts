"use server";

/*
 * Server Actions públicas autenticadas por token opaco (`/propuesta/[token]` · `ADR-210`):
 *   1. `approveAndPayProposalAction`: valida destinatario + dirección DANE exacta +
 *      aprobación de muestra/Habeas Data, convierte a `Order` real y abre Wompi o
 *      habilita instrucciones de Pago Directo (Bre-B / Transferencia).
 *   2. `reportDirectTransferAction`: permite al cliente reportar referencia/CUS y
 *      adjuntar comprobante opcional de su transferencia o pago Bre-B.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";
import { getCurrentCustomer } from "@/lib/auth";
import { getZoneCityByCode } from "@/lib/lucams-zones";
import {
  NAME_REGEX,
  capitalizeName,
  countWords,
  normalizePhoneWithDial,
} from "@/lib/colombia-validators";
import { parseStructuredAddress } from "@/features/checkout/parse-address";
import { ReportDirectPaymentSchema } from "@/features/opportunities/schemas";
import { OpportunityValidationError } from "@/features/opportunities/service";
import {
  convertApprovedProposalToOrder,
  reportDirectTransferByClient,
} from "@/features/opportunities/proposal-conversion-service";

const RecipientSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/i, "Enlace de propuesta inválido."),
  recipientFullName: z
    .string()
    .trim()
    .min(2, "Escribe el nombre de quien recibe el pedido.")
    .max(120, "Nombre demasiado largo.")
    .regex(NAME_REGEX, "El nombre solo puede tener letras.")
    .refine((v) => countWords(v) <= 5, "Ingresa máximo 5 palabras en el nombre completo.")
    .transform(capitalizeName),
  recipientPhone: z
    .string()
    .trim()
    .min(7, "Ingresa un teléfono móvil de contacto.")
    .max(30)
    .refine((v) => normalizePhoneWithDial(v) !== null, {
      message: "Ingresa un celular válido en Colombia (10 dígitos empezando en 3).",
    })
    .transform((v) => normalizePhoneWithDial(v) ?? v),
  paymentChoice: z.enum(["WOMPI", "DIRECT_TRANSFER"]),
  acceptProof: z.boolean(),
  acceptTermsAndHabeas: z.boolean(),
});

export type ProposalApproveActionState =
  | {
      ok: true;
      orderNumber: string;
      redirectUrl?: string;
      awaitingDirectTransfer?: boolean;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
    }
  | null;

export async function approveAndPayProposalAction(
  _prev: ProposalApproveActionState,
  formData: FormData,
): Promise<ProposalApproveActionState> {
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const userAgent = hdrs.get("user-agent") ?? null;
  const isProd = process.env.VERCEL_ENV === "production";

  const rl = await rateLimit(ipKey("b2b_proposal_pay", ip), isProd ? 20 : 100, 600);
  if (!rl.allowed) {
    logger.warn({ event: "b2b.proposal.pay_rate_limited", ip });
    return {
      ok: false,
      error: "Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.",
    };
  }

  const recipientRes = RecipientSchema.safeParse({
    token: String(formData.get("token") ?? ""),
    recipientFullName: String(formData.get("recipientFullName") ?? ""),
    recipientPhone: String(formData.get("recipientPhone") ?? ""),
    paymentChoice:
      formData.get("paymentChoice") === "DIRECT_TRANSFER" ? "DIRECT_TRANSFER" : "WOMPI",
    acceptProof: formData.get("acceptProof") === "on",
    acceptTermsAndHabeas: formData.get("acceptTermsAndHabeas") === "on",
  });

  const addrRes = parseStructuredAddress(formData);

  if (!recipientRes.success || !addrRes.ok) {
    return {
      ok: false,
      error: "Por favor revisa los datos de entrega señalados.",
      fieldErrors: {
        ...(recipientRes.success ? {} : z.flattenError(recipientRes.error).fieldErrors),
        ...(addrRes.ok ? {} : addrRes.fieldErrors),
      },
    };
  }

  if (!addrRes.data.localityId) {
    const zoneCity = getZoneCityByCode(addrRes.data.cityCode);
    if (zoneCity) {
      return {
        ok: false,
        error: "Selecciona tu localidad o zona de entrega.",
        fieldErrors: {
          localityId: [
            `Elige tu ${zoneCity.zoneLabel.toLowerCase()} para coordinar el despacho sin novedades.`,
          ],
        },
      };
    }
  }

  try {
    const customerSession = await getCurrentCustomer().catch(() => null);
    const redirectBaseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4000").replace(
      /\/$/,
      "",
    );

    const outcome = await convertApprovedProposalToOrder({
      rawToken: recipientRes.data.token,
      paymentChoice: recipientRes.data.paymentChoice,
      recipientFullName: recipientRes.data.recipientFullName,
      recipientPhone: recipientRes.data.recipientPhone,
      address: addrRes.data,
      acceptProof: recipientRes.data.acceptProof,
      acceptTermsAndHabeas: recipientRes.data.acceptTermsAndHabeas,
      sessionCustomerId: customerSession?.customer.id ?? null,
      sessionCustomerEmail: customerSession?.customer.email ?? null,
      ip,
      userAgent,
      redirectBaseUrl,
    });

    revalidatePath(`/propuesta/${recipientRes.data.token}`);
    revalidatePath("/admin/oportunidades");
    revalidatePath("/admin/pedidos");
    revalidatePath("/admin/hoy");

    if (outcome.kind === "redirect_wompi") {
      return {
        ok: true,
        orderNumber: outcome.orderNumber,
        redirectUrl: outcome.checkoutUrl,
      };
    }
    if (outcome.kind === "redirect_gracias") {
      return {
        ok: true,
        orderNumber: outcome.orderNumber,
        redirectUrl: outcome.redirectPath,
      };
    }
    return {
      ok: true,
      orderNumber: outcome.orderNumber,
      awaitingDirectTransfer: true,
    };
  } catch (err) {
    if (err instanceof OpportunityValidationError) {
      return { ok: false, error: err.message };
    }
    logger.error({
      event: "b2b.proposal.approve_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      error: "No pudimos procesar tu aprobación en este momento. Intenta nuevamente.",
    };
  }
}

export type DirectTransferReportState =
  { ok: true; orderNumber: string } | { ok: false; error: string } | null;

export async function reportDirectTransferAction(
  _prev: DirectTransferReportState,
  formData: FormData,
): Promise<DirectTransferReportState> {
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const isProd = process.env.VERCEL_ENV === "production";

  const rl = await rateLimit(ipKey("b2b_direct_report", ip), isProd ? 15 : 80, 600);
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Recibimos varios reportes recientes. Espera unos minutos antes de reintentar.",
    };
  }

  const parsed = ReportDirectPaymentSchema.safeParse({
    token: String(formData.get("token") ?? ""),
    method: String(formData.get("method") ?? ""),
    reference: String(formData.get("reference") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { ok: false, error: firstIssue?.message ?? "Revisa los datos del comprobante." };
  }

  let receiptBuffer: Buffer | null = null;
  const fileEntry = formData.get("receiptFile");
  if (fileEntry instanceof File && fileEntry.size > 0) {
    if (fileEntry.size > 5 * 1024 * 1024) {
      return { ok: false, error: "La imagen del comprobante no puede superar 5 MB." };
    }
    receiptBuffer = Buffer.from(await fileEntry.arrayBuffer());
  }

  try {
    const res = await reportDirectTransferByClient({
      rawToken: parsed.data.token,
      method: parsed.data.method,
      reference: parsed.data.reference,
      notes: parsed.data.notes,
      receiptBuffer,
    });

    revalidatePath(`/propuesta/${parsed.data.token}`);
    revalidatePath("/admin/pedidos");
    revalidatePath(`/admin/pedidos/${res.orderNumber}`);
    revalidatePath("/admin/hoy");

    return { ok: true, orderNumber: res.orderNumber };
  } catch (err) {
    if (err instanceof OpportunityValidationError) {
      return { ok: false, error: err.message };
    }
    logger.error({
      event: "b2b.direct_payment.report_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      error: "No pudimos guardar el reporte de pago. Intenta nuevamente.",
    };
  }
}
