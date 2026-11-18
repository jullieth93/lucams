"use server";

/*
 * Server Actions administrativas del Constructor de Propuestas B2B (`/admin/oportunidades/[id]`, `ADR-210`).
 * Todas las mutaciones exigen capacidad `opportunities:propose` (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`)
 * y dejan rastro en `AdminActionLog`.
 */

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { recordAdminAction } from "@/lib/admin-audit";
import { SaveProposalDraftSchema } from "./schemas";
import { OpportunityValidationError } from "./service";
import {
  quoteB2bProposalShipping,
  saveOpportunityProposalDraft,
  sendOpportunityProposal,
  uploadProposalProofImage,
  type B2bShippingQuoteOption,
} from "./proposals-service";

export async function quoteB2bProposalShippingAction(input: {
  cityCode: string;
  departmentCode: string;
  items: Array<{ variantId: string; qty: number; designUnits: number; unitPricePesos: number }>;
}): Promise<
  | {
      ok: true;
      quotes: B2bShippingQuoteOption[];
      estimated: boolean;
      totalWeightKg: number;
      suggestedPackageCount: number;
    }
  | { ok: false; error: string }
> {
  await requireAdminAction({ capability: "opportunities:propose" });

  try {
    const res = await quoteB2bProposalShipping({
      cityCode: input.cityCode,
      departmentCode: input.departmentCode,
      items: input.items.map((it) => ({
        variantId: it.variantId,
        qty: Math.max(1, Math.trunc(it.qty || 1)),
        designUnits: Math.max(1, Math.trunc(it.designUnits || 1)),
        unitPriceCents: Math.max(0, Math.trunc(it.unitPricePesos || 0)) * 100,
      })),
    });
    return { ok: true, ...res };
  } catch (err) {
    if (err instanceof OpportunityValidationError) {
      return { ok: false, error: err.message };
    }
    logger.warn({
      event: "admin.b2b_proposal.quote_shipping_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "No se pudo consultar la cotización de envío." };
  }
}

export async function saveProposalDraftAction(
  payload: unknown,
): Promise<
  | { ok: true; proposalId: string; proposalNumber: string; version: number }
  | { ok: false; error: string }
> {
  const session = await requireAdminAction({ capability: "opportunities:propose" });

  const parsed = SaveProposalDraftSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Revisa los campos de la propuesta.",
    };
  }

  try {
    const saved = await saveOpportunityProposalDraft(parsed.data, {
      id: session.admin.id,
      role: session.admin.role,
    });

    await recordAdminAction({
      actorId: session.admin.id,
      action: "opportunity.proposal_save_draft",
      entityType: "Opportunity",
      entityId: saved.opportunityId,
      metadata: {
        proposalId: saved.id,
        proposalNumber: saved.number,
        version: saved.version,
        totalCents: saved.totalCents,
        allowDirectTransfer: saved.allowDirectTransfer,
      },
    });

    revalidatePath(`/admin/oportunidades/${saved.opportunityId}`);
    revalidatePath("/admin/oportunidades");

    return {
      ok: true,
      proposalId: saved.id,
      proposalNumber: saved.number,
      version: saved.version,
    };
  } catch (err) {
    if (err instanceof OpportunityValidationError) {
      return { ok: false, error: err.message };
    }
    logger.error({
      event: "admin.b2b_proposal.save_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "No se pudo guardar el borrador de la propuesta." };
  }
}

export async function uploadProposalProofAction(
  formData: FormData,
): Promise<{ ok: true; proofUrl: string } | { ok: false; error: string }> {
  const session = await requireAdminAction({ capability: "opportunities:propose" });
  const proposalId = String(formData.get("proposalId") ?? "").trim();
  const opportunityId = String(formData.get("opportunityId") ?? "").trim();
  const file = formData.get("proofFile");

  if (!proposalId || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecciona una imagen válida para la muestra digital." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadProposalProofImage({ proposalId, fileBuffer: buffer });

    await recordAdminAction({
      actorId: session.admin.id,
      action: "opportunity.proposal_upload_proof",
      entityType: "Opportunity",
      entityId: opportunityId || proposalId,
      metadata: { proposalId },
    });

    if (opportunityId) {
      revalidatePath(`/admin/oportunidades/${opportunityId}`);
    }

    return {
      ok: true,
      proofUrl: `/api/b2b-proof/${encodeURIComponent(proposalId)}?t=${Date.now()}`,
    };
  } catch (err) {
    if (err instanceof OpportunityValidationError) {
      return { ok: false, error: err.message };
    }
    logger.error({
      event: "admin.b2b_proposal.proof_upload_failed",
      proposalId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "No pudimos procesar la muestra digital." };
  }
}

export async function sendProposalAction(input: {
  proposalId: string;
  sendEmailToClient: boolean;
}): Promise<
  | {
      ok: true;
      proposalNumber: string;
      publicPath: string;
      emailedTo: string | null;
    }
  | { ok: false; error: string }
> {
  const session = await requireAdminAction({ capability: "opportunities:propose" });

  try {
    const sent = await sendOpportunityProposal({
      proposalId: input.proposalId,
      actorAdminId: session.admin.id,
      sendEmailToClient: input.sendEmailToClient,
    });

    await recordAdminAction({
      actorId: session.admin.id,
      action: "opportunity.proposal_send",
      entityType: "Opportunity",
      entityId: sent.opportunityId,
      metadata: {
        proposalId: sent.proposalId,
        proposalNumber: sent.proposalNumber,
        emailedTo: sent.emailedTo ? "sent" : "link_only",
      },
    });

    revalidatePath(`/admin/oportunidades/${sent.opportunityId}`);
    revalidatePath("/admin/oportunidades");
    revalidatePath(`/admin/clientes/${sent.contactId}`);
    revalidatePath("/admin/hoy");

    return {
      ok: true,
      proposalNumber: sent.proposalNumber,
      publicPath: `/propuesta/${sent.plainToken}`,
      emailedTo: sent.emailedTo,
    };
  } catch (err) {
    if (err instanceof OpportunityValidationError) {
      return { ok: false, error: err.message };
    }
    logger.error({
      event: "admin.b2b_proposal.send_failed",
      proposalId: input.proposalId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "No se pudo emitir la propuesta." };
  }
}
