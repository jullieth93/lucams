/*
 * Admin > Plantillas de correo > detalle (Fase 4, feedback Lucy 2026-09-18).
 *
 * Vista de UNA plantilla del registry (features/emails/registry.ts):
 *   - Asunto y preheader renderizados con el sample data (overrides aplicados).
 *   - Preview del HTML en iframe contra la ruta ./preview (documento propio,
 *     estilos aislados) con toggle desktop 600px / móvil 375px (PreviewPanel).
 *   - Editor inline de los textos clave (SUBJECT / PREHEADER / HEADING) —
 *     guarda overrides EmailTemplateOverride con fallback al copy base.
 *   - "Enviarme una prueba": el correo renderizado llega al email del admin
 *     logueado (subject con prefijo [PRUEBA]).
 *
 * Los overrides admiten tokens {campo} (ej. "Pedido {orderNumber} confirmado")
 * interpolados con los datos del envío — sin eso un asunto editado perdería
 * el número de pedido (ver features/emails/overrides.ts).
 *
 * RBAC: SUPERADMIN (layout + ROUTE_ROLES en lib/admin-rbac; la ruta ./preview
 * repite el check porque los layouts no envuelven route handlers).
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Mail } from "lucide-react";
import {
  AdminCard,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import {
  EMAIL_OVERRIDE_KEY_LABEL,
  extractHeading,
  extractPreheader,
  getEmailOverrides,
  type EmailOverrideMap,
} from "@/features/emails/overrides";
import { getEmailTemplate } from "@/features/emails/registry";
import { OverrideFieldForm } from "./override-field-form";
import { PreviewPanel } from "./preview-panel";
import { SendTestButton } from "./send-test-button";

export const metadata: Metadata = {
  title: "Plantilla de correo",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function EmailTemplateDetailPage({ params }: { params: Params }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const tpl = getEmailTemplate(id);
  if (!tpl) notFound();

  // Render efectivo (con overrides) para el asunto/preheader visibles, render
  // base para el texto original de cada campo, y los overrides guardados.
  const [rendered, base, overrides] = await Promise.all([
    tpl.renderSample(),
    tpl.renderBase(),
    getEmailOverrides(tpl.id),
  ]);

  const preheader = extractPreheader(rendered.html);
  const baseValueByKey: EmailOverrideMap = {
    SUBJECT: base.subject,
    PREHEADER: extractPreheader(base.html) ?? undefined,
    HEADING: extractHeading(base.html) ?? undefined,
  };

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Mail className="h-5 w-5" />}
        title={tpl.name}
        subtitle={tpl.description}
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Configuración" },
          { label: "Plantillas de correo", href: "/admin/email-templates" },
          { label: tpl.name },
        ]}
        actions={<SendTestButton templateId={tpl.id} />}
      />
      <AdminPageBody>
        <AdminCard className="p-4">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-brand-purple-dark/60 text-xs font-semibold tracking-wide uppercase">
                Asunto (con datos de ejemplo)
              </dt>
              <dd className="text-brand-purple-dark font-semibold">{rendered.subject}</dd>
            </div>
            {preheader && (
              <div>
                <dt className="text-brand-purple-dark/60 text-xs font-semibold tracking-wide uppercase">
                  Preheader (preview en la bandeja)
                </dt>
                <dd className="text-brand-purple-dark/80">{preheader}</dd>
              </div>
            )}
            <div>
              <dt className="text-brand-purple-dark/60 text-xs font-semibold tracking-wide uppercase">
                Identificador
              </dt>
              <dd>
                <code className="bg-brand-purple/5 text-brand-purple-dark/70 rounded px-1.5 py-0.5 text-xs">
                  {tpl.id}
                </code>
              </dd>
            </div>
          </dl>
        </AdminCard>

        <section>
          <h2 className="font-display text-brand-purple-dark mb-3 text-lg font-bold">
            Vista previa
          </h2>
          <PreviewPanel src={`/admin/email-templates/${tpl.id}/preview`} title={tpl.name} />
        </section>

        <section>
          <h2 className="font-display text-brand-purple-dark mb-3 text-lg font-bold">
            Textos editables
          </h2>
          <AdminNotice tone="info">
            Puedes usar tokens como <code>{"{orderNumber}"}</code>, <code>{"{customerName}"}</code>{" "}
            o <code>{"{productName}"}</code> según los datos del correo — se reemplazan solos en
            cada envío. Un campo vacío usa el texto original. Si un token no existe para esta
            plantilla, quedará literal en el preview para que lo corrijas.
          </AdminNotice>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {tpl.editableKeys.map((key) => (
              <OverrideFieldForm
                key={key}
                templateId={tpl.id}
                fieldKey={key}
                label={EMAIL_OVERRIDE_KEY_LABEL[key]}
                baseValue={baseValueByKey[key] ?? ""}
                overrideValue={overrides[key] ?? null}
              />
            ))}
          </div>
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
