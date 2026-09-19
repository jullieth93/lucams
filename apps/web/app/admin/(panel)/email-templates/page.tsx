/*
 * Admin > Plantillas de correo — módulo real (Fase 4, feedback Lucy 2026-09-18).
 *
 * Antes esta ruta era un redirect legacy a /admin/contenido/paginas/emails (que
 * solo edita asunto+preheader del newsletter welcome vía CMS). Ahora es el
 * catálogo de TODAS las plantillas transaccionales (features/emails/registry.ts):
 * nombre, cuándo se envía, y cuántos textos tiene personalizados. El detalle
 * (/admin/email-templates/[id]) tiene preview renderizado, editor de textos
 * clave (overrides EmailTemplateOverride) y envío de prueba.
 *
 * La edición vieja del newsletter sigue viva en el CMS (Ruta A) — acá queda el
 * enlace de ida para no romper ese flujo.
 *
 * RBAC: SUPERADMIN (misma barra que redirects/integraciones — ver
 * lib/admin-rbac.ts ROUTE_ROLES). El layout ya rebotó al resto de roles.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, ChevronRight, ExternalLink } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EMAIL_TEMPLATE_REGISTRY, type EmailTemplateEntry } from "@/features/emails/registry";

export const metadata: Metadata = {
  title: "Plantillas de correo",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Conteo de overrides por plantilla; {} si la DB falla (la lista nunca se rompe). */
async function countOverridesByTemplate(): Promise<Record<string, number>> {
  try {
    const rows = await prisma.emailTemplateOverride.groupBy({
      by: ["templateId"],
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.templateId, r._count._all]));
  } catch {
    return {};
  }
}

export default async function EmailTemplatesPage() {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const overrideCounts = await countOverridesByTemplate();

  const groups = new Map<string, EmailTemplateEntry[]>();
  for (const tpl of EMAIL_TEMPLATE_REGISTRY) {
    const list = groups.get(tpl.group) ?? [];
    list.push(tpl);
    groups.set(tpl.group, list);
  }

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Mail className="h-5 w-5" />}
        title="Plantillas de correo"
        subtitle={`${EMAIL_TEMPLATE_REGISTRY.length} correos transaccionales. Toca una plantilla para verla renderizada, editar sus textos clave o enviarte una prueba.`}
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Configuración" },
          { label: "Plantillas de correo" },
        ]}
      />
      <AdminPageBody>
        <AdminNotice tone="info">
          Los textos base de cada correo viven en código (mezclan variables, estilos inline para
          clientes de correo y textos legales). Acá editas{" "}
          <strong>asunto, preheader y titular</strong>; tus cambios se guardan como override y el
          texto original queda de respaldo. Los datos globales (email de contacto, WhatsApp, razón
          social) se editan en{" "}
          <Link
            href="/admin/contenido/paginas/global"
            className="font-semibold underline underline-offset-2"
          >
            Ajustes del sitio
          </Link>
          . El asunto y preheader de la bienvenida al newsletter también se pueden editar en la{" "}
          <Link
            href="/admin/contenido/paginas/emails"
            className="font-semibold underline underline-offset-2"
          >
            página «emails» del CMS
          </Link>{" "}
          <ExternalLink className="inline h-3 w-3" />.
        </AdminNotice>

        {[...groups.entries()].map(([group, templates]) => (
          <section key={group}>
            <h2 className="font-display text-brand-purple-dark mb-3 text-lg font-bold">{group}</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((tpl) => {
                const overrides = overrideCounts[tpl.id] ?? 0;
                return (
                  <Link key={tpl.id} href={`/admin/email-templates/${tpl.id}`} className="group">
                    <AdminCard className="group-hover:border-brand-purple/40 h-full p-4 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-brand-purple-dark text-sm font-bold">{tpl.name}</h3>
                        <ChevronRight className="text-brand-purple/40 group-hover:text-brand-purple h-4 w-4 flex-shrink-0 transition-colors" />
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{tpl.description}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <code className="bg-brand-purple/5 text-brand-purple-dark/70 rounded px-1.5 py-0.5 text-[11px]">
                          {tpl.id}
                        </code>
                        {overrides > 0 && (
                          <AdminBadge tone="pink">
                            {overrides} texto{overrides === 1 ? "" : "s"} personalizado
                            {overrides === 1 ? "" : "s"}
                          </AdminBadge>
                        )}
                      </div>
                    </AdminCard>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </AdminPageBody>
    </AdminPage>
  );
}
