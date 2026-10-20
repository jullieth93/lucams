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

import { getCurrentAdmin } from "@/lib/auth";
import { renderCartRecoveryEmail } from "@/features/emails/registry";
import { getAbandonedCartDetail } from "@/features/cart/admin-service";
import { getSiteUrl } from "@/features/emails/layout";
import { encodeUnsubscribeParam } from "@/features/newsletter/unsubscribe";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentAdmin();
  if (!session || (session.admin.role !== "SUPERADMIN" && session.admin.role !== "MANAGER")) {
    return new Response("Solo SUPERADMIN o MANAGER pueden previsualizar este correo.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const { id } = await params;
  const detail = await getAbandonedCartDetail(id);
  if (!detail) {
    return new Response("Carrito abandonado no encontrado.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
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
      "Cache-Control": "no-store",
    },
  });
}
