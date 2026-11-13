/*
 * Ruta HTML de preview del correo de recuperación de UN carrito (Fase 4,
 * 2026-10-13). El detalle /admin/carritos/[id] la consume en un <iframe src>
 * (mismo patrón que /admin/email-templates/[id]/preview): servir el HTML como
 * documento propio aísla los estilos del correo del CSS del admin.
 *
 * Los layouts NO envuelven route handlers, así que el RBAC se repite acá:
 * mismos roles que la página (SUPERADMIN/MANAGER — lib/admin-rbac CATALOG).
 *
 * El render pasa por renderCartRecoveryEmail (withOverrides) con los items
 * REALES del carrito; el recoverToken es ficticio ("preview") — el token real
 * solo se genera al enviar (F-11).
 */

import { verifyAdminRouteAccess } from "@/lib/admin-rbac-guard";
import { EMAIL_PREVIEW_SANDBOX_CSP } from "@/lib/security-headers";
import { renderCartRecoveryEmail } from "@/features/emails/registry";
import { getAbandonedCartDetail } from "@/features/cart/admin-service";
import { getSiteUrl } from "@/features/emails/layout";
import { encodeUnsubscribeParam } from "@/features/newsletter/unsubscribe";

export const dynamic = "force-dynamic";

const SAFE_ID_RE = /^[a-zA-Z0-9_-]{3,64}$/;

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await verifyAdminRouteAccess({
    capability: "carts:recover",
    req,
    checkIdle: true,
  });
  if (!access.ok) {
    return textResponse(
      "Necesitas permiso de recuperación de carritos y MFA verificado para previsualizar este correo.",
      access.status,
    );
  }

  const { id } = await params;
  if (!SAFE_ID_RE.test(id)) {
    return textResponse("Identificador de carrito inválido.", 400);
  }

  const detail = await getAbandonedCartDetail(id);
  if (!detail) {
    return textResponse("Carrito abandonado no encontrado.", 404);
  }

  const siteUrl = await getSiteUrl();
  const rendered = await renderCartRecoveryEmail({
    recoverToken: "preview",
    items: detail.items,
    unsubscribeUrl: `${siteUrl}/unsubscribe?u=${encodeUnsubscribeParam(detail.email)}`,
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
