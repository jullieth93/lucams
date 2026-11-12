"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { MFA_REAUTH_MESSAGE, isMfaReauthRequired, requireRecentMfa } from "@/lib/admin-reauth";
import { recordAdminAction } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import { getCanonicalSiteUrl, getTrustedSelfBaseUrl } from "@/lib/origin";
import { createAveonlineWebhook, deleteAveonlineWebhook } from "@/features/shipping/aveonline";

export type WebhookActionState = {
  ok?: string;
  error?: string;
  reauthRequired?: boolean;
};

function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h === "[::1]" || h.endsWith(".local")) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  return false;
}

function getAllowedDeployedOrigins(): string[] {
  const candidates = [
    getCanonicalSiteUrl(),
    getTrustedSelfBaseUrl(),
    process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : null,
  ];
  const origins = new Set<string>();
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "https:" && !isPrivateOrLocalHostname(parsed.hostname)) {
        origins.add(parsed.origin);
      }
    } catch {
      // Ignora valores malformados en env.
    }
  }
  return [...origins];
}

export async function registerAveonlineWebhookAction(
  _prev: WebhookActionState | null,
  formData: FormData,
): Promise<WebhookActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
  try {
    await requireRecentMfa();
  } catch (err) {
    if (isMfaReauthRequired(err)) {
      return { error: MFA_REAUTH_MESSAGE, reauthRequired: true };
    }
    throw err;
  }

  const rawBaseUrl = String(formData.get("baseUrl") ?? "").trim();
  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    return { error: "Ingresa una URL HTTPS válida (por ejemplo https://lucamsshop.com)." };
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return { error: "La URL base debe usar https:// y no incluir credenciales." };
  }
  if (isPrivateOrLocalHostname(parsed.hostname)) {
    return {
      error:
        "Aveonline requiere un dominio público HTTPS alcanzable desde Internet (no localhost ni IPs privadas).",
    };
  }

  // Mitigación crítica anti-exfiltración de AVEONLINE_WEBHOOK_SECRET:
  // createAveonlineWebhook envía el secreto a Aveonline para que éste lo reenvíe a la URL
  // registrada en cada guía. En entornos desplegados bloqueamos cualquier origen ajeno.
  const isDeployed = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL_ENV);
  if (isDeployed) {
    const allowedOrigins = getAllowedDeployedOrigins();
    if (allowedOrigins.length > 0 && !allowedOrigins.includes(parsed.origin)) {
      logger.warn({
        event: "admin.aveonline.webhook.rejected_origin",
        adminId: session.admin.id,
        attemptedOrigin: parsed.origin,
        allowedOrigins,
      });
      return {
        error: `Por seguridad, en ambientes desplegados solo se permite registrar el dominio oficial (${allowedOrigins.join(" o ")}).`,
      };
    }
  }

  const secret = process.env.AVEONLINE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return { error: "AVEONLINE_WEBHOOK_SECRET no está configurado en las variables de entorno." };
  }

  // SEC-06: jamás incrustar el secreto en la query string (?secret=) ni preservar rutas arbitrarias.
  // Siempre fijamos exactamente `${parsed.origin}/api/webhooks/aveonline`.
  const fullUrl = `${parsed.origin}/api/webhooks/aveonline`;
  try {
    const result = await createAveonlineWebhook({
      url: fullUrl,
      secret,
      extra: { tenant: "lucams_shop" },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "shipping.aveonline.webhook.register",
      entityType: "Integration",
      entityId: "aveonline",
      metadata: { url: fullUrl, ok: result.ok, message: result.message },
    });
    logger.info({
      event: "admin.aveonline.webhook.register",
      adminId: session.admin.id,
      ok: result.ok,
      message: result.message,
    });
    revalidatePath("/admin/integraciones/aveonline");
    if (!result.ok) return { error: result.message || "Aveonline no aceptó el webhook" };
    return { ok: "Webhook registrado y verificado en Aveonline." };
  } catch (err) {
    logger.error({
      event: "admin.aveonline.webhook.register_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "Error inesperado" };
  }
}

export async function deleteAveonlineWebhookAction(
  formData: FormData,
): Promise<{ reauthRequired?: boolean } | void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
  try {
    await requireRecentMfa();
  } catch (err) {
    if (isMfaReauthRequired(err)) {
      return { reauthRequired: true };
    }
    throw err;
  }

  const url = String(formData.get("url") ?? "").trim();
  if (!url) return;
  const result = await deleteAveonlineWebhook(url);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "shipping.aveonline.webhook.delete",
    entityType: "Integration",
    entityId: "aveonline",
    metadata: { url, ok: result.ok, message: result.message },
  });
  revalidatePath("/admin/integraciones/aveonline");
}
