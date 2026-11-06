import { verifyAdminRouteAccess } from "@/lib/admin-rbac-guard";
import { EMAIL_PREVIEW_SANDBOX_CSP } from "@/lib/security-headers";
import { getLifecycleJourney } from "@/features/lifecycle/admin-service";
import { renderLifecycleMessageEmail } from "@/features/emails/registry";
import { getSiteUrl } from "@/features/emails/layout";
import { encodeUnsubscribeParam } from "@/features/newsletter/unsubscribe";

export const dynamic = "force-dynamic";

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await verifyAdminRouteAccess({
    capability: "lifecycle:manage",
    req,
    checkIdle: true,
  });
  if (!access.ok) {
    return textResponse(
      "Necesitas permiso Lifecycle y MFA verificado para previsualizar.",
      access.status,
    );
  }

  const { id } = await params;
  const journey = await getLifecycleJourney(id);
  if (!journey) return textResponse("Recorrido no encontrado.", 404);
  const stepId = new URL(req.url).searchParams.get("stepId");
  const step = stepId ? journey.steps.find((item) => item.id === stepId) : journey.steps[0];
  if (!step) return textResponse("Paso no encontrado.", 404);

  const siteUrl = await getSiteUrl();
  const email = access.session.admin.email;
  const rendered = await renderLifecycleMessageEmail({
    subject: step.subject,
    heading: step.heading,
    preheader: step.preheader,
    body: step.body,
    ctaLabel: step.ctaLabel,
    ctaUrl: `${siteUrl}${step.ctaPath}`,
    recipientName: email.split("@")[0],
    productNames: ["Fotoimanes Cuadrados", "Calendario personalizado"],
    unsubscribeUrl: step.commercial
      ? `${siteUrl}/unsubscribe?u=${encodeUnsubscribeParam(email)}`
      : undefined,
  });
  return new Response(rendered.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": EMAIL_PREVIEW_SANDBOX_CSP,
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
