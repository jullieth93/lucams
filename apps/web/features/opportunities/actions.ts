"use server";

/*
 * Server Actions del módulo B2B / Eventos (`Fase 12 · S24`):
 *   1. `submitB2bInquiryAction` (pública en `/empresas-y-eventos`): Zod + Turnstile +
 *      rate-limit IP/email + Ley 1581 + `Opportunity` + `Task` automática en `/admin/hoy`.
 *   2. `updateOpportunityAction` (admin en `/admin/oportunidades/[id]`): protegida por
 *      `opportunities:manage` + MFA `aal2` + `AdminActionLog`.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { emailKey, hashEmail, ipKey } from "@/lib/rate-limit-keys";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { getClientIp } from "@/lib/client-ip";
import { getCurrentCustomer } from "@/lib/auth";
import { getSettingValue } from "@/lib/cms";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  B2bInquirySchema,
  isOpportunityStage,
  type B2bInquiryInput,
  type OpportunityStage,
} from "./schemas";
import {
  createPublicB2bOpportunity,
  OpportunityValidationError,
  updateOpportunityByAdmin,
} from "./service";

export type B2bPublicActionState =
  | { ok: true; opportunityNumber: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<keyof B2bInquiryInput, string[]>>;
    }
  | null;

export async function submitB2bInquiryAction(
  _prev: B2bPublicActionState,
  formData: FormData,
): Promise<B2bPublicActionState> {
  const parsed = B2bInquirySchema.safeParse({
    contactName: String(formData.get("contactName") ?? ""),
    organizationName: String(formData.get("organizationName") ?? ""),
    nit: String(formData.get("nit") ?? ""),
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    whatsapp: String(formData.get("whatsapp") ?? ""),
    eventType: formData.get("eventType"),
    expectedUnits: formData.get("expectedUnits"),
    eventDate: String(formData.get("eventDate") ?? ""),
    city: String(formData.get("city") ?? ""),
    department: String(formData.get("department") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    acceptHabeasData: formData.get("acceptHabeasData") === "on",
    acceptNewsletter: formData.get("acceptNewsletter") === "on",
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      ok: false,
      error: "Por favor revisa los campos señalados.",
      fieldErrors: flat.fieldErrors as Partial<Record<keyof B2bInquiryInput, string[]>>,
    };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const userAgent = hdrs.get("user-agent") ?? null;

  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");
  const turnstile = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstile.success) {
    logger.warn({ event: "b2b.inquiry.turnstile_failed", ip, reason: turnstile.reason });
    return {
      ok: false,
      error: "La validación anti-bot expiró. Recarga la página e intenta de nuevo.",
    };
  }

  const [byIp, byEmail] = await Promise.all([
    rateLimit(ipKey("b2b-inquiry", ip), 5, 24 * 60 * 60),
    rateLimit(emailKey("b2b-inquiry", parsed.data.email), 3, 24 * 60 * 60),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    logger.warn({
      event: "b2b.inquiry.rate_limited",
      ip,
      emailHash: hashEmail(parsed.data.email),
    });
    return {
      ok: false,
      error:
        "Recibimos varias solicitudes recientes desde tu conexión. Escríbenos directo por WhatsApp si necesitas atención inmediata.",
    };
  }

  try {
    const [customerSession, privacyPolicyVersion] = await Promise.all([
      getCurrentCustomer().catch(() => null),
      getSettingValue("PRIVACY_POLICY_VERSION", "v1 · 2026-09-29"),
    ]);

    const created = await createPublicB2bOpportunity(parsed.data, {
      customerId: customerSession?.customer.id ?? null,
      ip,
      userAgent,
      privacyPolicyVersion,
      utmSource: String(formData.get("utmSource") ?? "") || null,
      utmMedium: String(formData.get("utmMedium") ?? "") || null,
      utmCampaign: String(formData.get("utmCampaign") ?? "") || null,
      landingPath: String(formData.get("landingPath") ?? "") || "/empresas-y-eventos",
    });

    revalidatePath("/admin/oportunidades");
    revalidatePath("/admin/hoy");
    revalidatePath(`/admin/clientes/${created.contactId}`);

    return { ok: true, opportunityNumber: created.number };
  } catch (err) {
    if (err instanceof OpportunityValidationError) {
      return { ok: false, error: err.message };
    }
    logger.error({
      event: "b2b.inquiry.create_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      error: "No pudimos procesar tu solicitud en este momento. Intenta nuevamente.",
    };
  }
}

export type AdminOpportunityActionState = { error?: string; success?: string } | null;

export async function updateOpportunityAction(
  _prev: AdminOpportunityActionState,
  formData: FormData,
): Promise<AdminOpportunityActionState> {
  const session = await requireAdminAction({ capability: "opportunities:manage" });

  const id = String(formData.get("id") ?? "").trim();
  const stageRaw = String(formData.get("stage") ?? "").trim();
  const expectedUnitsRaw = String(formData.get("expectedUnits") ?? "").trim();
  const expectedPesosRaw = String(formData.get("expectedAmountPesos") ?? "0")
    .trim()
    .replace(/[.,\s$]/g, "");
  const ownerRaw = String(formData.get("ownerAdminId") ?? "").trim();
  const internalNotes = String(formData.get("internalNotes") ?? "");
  const lostReason = String(formData.get("lostReason") ?? "");
  const convertedOrderNumber = String(formData.get("convertedOrderNumber") ?? "");

  if (!id) return { error: "Falta el identificador de la oportunidad." };
  if (!isOpportunityStage(stageRaw)) return { error: "Etapa inválida." };

  const stage: OpportunityStage = stageRaw;
  const expectedUnits = expectedUnitsRaw === "" ? null : Number.parseInt(expectedUnitsRaw, 10);
  if (expectedUnits !== null && (Number.isNaN(expectedUnits) || expectedUnits < 0)) {
    return { error: "Ingresa un número entero válido de unidades." };
  }

  const expectedPesos = expectedPesosRaw === "" ? 0 : Number.parseInt(expectedPesosRaw, 10);
  if (Number.isNaN(expectedPesos) || expectedPesos < 0 || expectedPesos > 2_000_000_000) {
    return { error: "Ingresa un presupuesto estimado válido en pesos COP." };
  }
  // Conversión exacta a centavos COP enteros (sin punto flotante).
  const expectedAmountCop = expectedPesos * 100;
  const ownerAdminId = ownerRaw === "" || ownerRaw === "UNASSIGNED" ? null : ownerRaw;

  try {
    const updated = await updateOpportunityByAdmin({
      id,
      stage,
      expectedUnits,
      expectedAmountCop,
      ownerAdminId,
      internalNotes,
      lostReason,
      convertedOrderNumber,
    });

    await recordAdminAction({
      actorId: session.admin.id,
      action: "opportunity.update",
      entityType: "Opportunity",
      entityId: updated.id,
      metadata: {
        number: updated.number,
        stage: updated.stage,
        expectedUnits: updated.expectedUnits,
        expectedAmountCop: updated.expectedAmountCop,
        ownerAdminId: updated.ownerAdminId,
      },
    });

    revalidatePath("/admin/oportunidades");
    revalidatePath(`/admin/oportunidades/${updated.id}`);
    revalidatePath(`/admin/clientes/${updated.contactId}`);
    revalidatePath("/admin/hoy");

    return { success: "Oportunidad actualizada correctamente." };
  } catch (err) {
    if (err instanceof OpportunityValidationError) {
      return { error: err.message };
    }
    logger.warn({
      event: "admin.opportunity.update_fail",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No se pudo guardar la oportunidad." };
  }
}
