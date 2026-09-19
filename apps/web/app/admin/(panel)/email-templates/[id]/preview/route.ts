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

import { getCurrentAdmin } from "@/lib/auth";
import { getEmailTemplate } from "@/features/emails/registry";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentAdmin();
  if (!session || session.admin.role !== "SUPERADMIN") {
    return new Response("Solo SUPERADMIN puede previsualizar plantillas.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const { id } = await params;
  const tpl = getEmailTemplate(id);
  if (!tpl) {
    return new Response("Plantilla desconocida.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const rendered = await tpl.renderSample();
  return new Response(rendered.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
