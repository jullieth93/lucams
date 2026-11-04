/*
 * Ruta HTML de preview de una plantilla de correo (Fase 4 — feedback Lucy
 * 2026-09-18). El detalle /admin/email-templates/[id] la consume en un
 * <iframe src>: servir el HTML como documento propio (en vez de srcDoc) aísla
 * los estilos del correo del CSS del admin y permite recargar el frame solo.
 *
 * Los layouts NO envuelven route handlers, así que el RBAC se repite acá:
 * solo SUPERADMIN logueado (misma barra que la página — lib/admin-rbac).
 * Devuelve el HTML renderizado con el sample data del registry, overrides de
 * EmailTemplateOverride ya aplicados (renderSample pasa por withOverrides).
 */

import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { verifyAdminRouteAccess } from "@/lib/admin-rbac-guard";
import { EMAIL_PREVIEW_SANDBOX_CSP } from "@/lib/security-headers";
import { getEmailTemplate } from "@/features/emails/registry";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await verifyAdminRouteAccess({
    roles: ADMIN_ROLE_SETS.SUPER,
    req,
    checkIdle: true,
  });
  if (!access.ok) {
    return new Response("Solo SUPERADMIN con MFA verificado puede previsualizar plantillas.", {
      status: access.status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const { id } = await params;
  const tpl = getEmailTemplate(id);
  if (!tpl) {
    return new Response("Plantilla desconocida.", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const rendered = await tpl.renderSample();
  return new Response(rendered.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": EMAIL_PREVIEW_SANDBOX_CSP,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
