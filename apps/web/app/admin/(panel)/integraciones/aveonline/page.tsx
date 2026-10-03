/*
 * Admin > Integraciones > Aveonline — gestión de webhooks (lo TÉCNICO de la
 * integración).
 *
 * La configuración de NEGOCIO del transporte (transportadoras del checkout +
 * envío propio Lucam's) se movió a /admin/envios (decisión del owner: no es
 * parte de la integración Aveonline). Acá quedan solo los webhooks de
 * tracking: registrar uno nuevo (apuntando a /api/webhooks/aveonline) o
 * eliminar los existentes.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plug, Trash2, Truck, Webhook } from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminNotice,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminEmpty,
} from "@/components/admin-page";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { getCurrentAdmin } from "@/lib/auth";
import { listAveonlineWebhooks } from "@/features/shipping/aveonline";
import { WebhookRegistrationForm } from "./webhook-form";
import { deleteAveonlineWebhookAction } from "./actions";

export const metadata: Metadata = { title: "Aveonline · Integraciones" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function AveonlineIntegrationPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const errorMsg = typeof sp.error === "string" ? sp.error : null;

  // Default sugerido del input — toma SITE_URL pero el admin puede sobreescribir
  // (útil cuando se usa ngrok en dev: pega ngrok URL + click registrar).
  const defaultBaseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "https://lucamsshop.com";
  const hasSecret = !!process.env.AVEONLINE_WEBHOOK_SECRET?.trim();

  // Listar webhooks actuales
  let webhooks: Array<{ url?: string; [k: string]: unknown }> = [];
  let listError: string | null = null;
  try {
    const result = await listAveonlineWebhooks();
    webhooks = result.items as { url?: string }[];
  } catch (err) {
    listError = err instanceof Error ? err.message : String(err);
  }

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Plug className="h-5 w-5" />}
        title="Aveonline"
        subtitle="Webhooks de tracking y estado de la integración"
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Configuración" },
          { label: "Integraciones", href: "/admin/integraciones" },
          { label: "Aveonline" },
        ]}
      />

      <AdminPageBody>
        {/* La configuración de transporte es de negocio → vive en /admin/envios. */}
        <AdminNotice tone="info">
          <Truck className="mr-1 inline h-4 w-4" />
          Las transportadoras del checkout y el envío propio Lucam&apos;s ahora se configuran en{" "}
          <Link href="/admin/envios" className="font-semibold underline">
            Envíos →
          </Link>
        </AdminNotice>

        {errorMsg && <AdminNotice tone="error">{decodeURIComponent(errorMsg)}</AdminNotice>}

        {/* H7 — pantalla técnica: aviso permanente para que Lucy no toque nada. */}
        <AdminNotice tone="info">
          <strong>Esta pantalla es para soporte técnico.</strong> Los webhooks ya están configurados
          — no cambies nada aquí a menos que te lo indique soporte.
        </AdminNotice>

        {!hasSecret && (
          <AdminNotice tone="warning">
            <strong>AVEONLINE_WEBHOOK_SECRET no configurado.</strong> Genera uno con{" "}
            <code className="rounded bg-amber-100 px-1.5 py-0.5">openssl rand -hex 32</code> y
            agregalo a <code>apps/web/.env.local</code> antes de registrar el webhook.
          </AdminNotice>
        )}

        {/* Form registro */}
        <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Webhook className="text-brand-purple h-4 w-4" />
            <h2 className="text-brand-purple-dark text-sm font-bold">
              Registrar webhook en Aveonline
            </h2>
          </div>
          <p className="text-brand-muted mb-3 text-xs">
            Aveonline llamará a esta URL cada vez que cambie el estado de una guía (recogida, en
            tránsito, entregada, etc.). El path{" "}
            <code className="bg-brand-purple/10 rounded px-1.5 py-0.5">
              /api/webhooks/aveonline
            </code>{" "}
            ya está implementado y valida el <code>secret</code> automáticamente.
          </p>
          <WebhookRegistrationForm defaultBaseUrl={defaultBaseUrl} disabled={!hasSecret} />
        </section>

        {/* Lista webhooks actuales */}
        <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-brand-purple-dark mb-3 text-sm font-bold">
            Webhooks registrados ({webhooks.length})
          </h2>
          {listError && <AdminNotice tone="error">No se pudo listar: {listError}</AdminNotice>}
          {webhooks.length === 0 && !listError ? (
            <AdminEmpty
              icon={<Webhook className="h-5 w-5" />}
              title="Sin webhooks registrados"
              description="Registrá uno arriba para que Aveonline empiece a notificar cambios de estado de guías."
            />
          ) : (
            <AdminTable>
              <AdminTableHead>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">URL</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {webhooks.map((w, i) => (
                  <AdminTableRow key={i}>
                    <td className="px-4 py-3 font-mono text-xs break-all">
                      {w.url ?? JSON.stringify(w).slice(0, 100)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {w.url && (
                        <ConfirmAction
                          action={deleteAveonlineWebhookAction}
                          message="¿Eliminar este webhook? Aveonline dejará de avisar a esa URL los cambios de estado de las guías."
                          className="inline"
                        >
                          <input type="hidden" name="url" value={w.url} />
                          <Hint content="Eliminar este webhook">
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </Hint>
                        </ConfirmAction>
                      )}
                    </td>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          )}
        </section>

        {/* Ayuda */}
        <section className="border-brand-purple/10 bg-brand-purple/5 rounded-xl border p-5">
          <h3 className="text-brand-purple-dark mb-2 text-sm font-bold">¿Cómo funciona?</h3>
          <ol className="text-brand-purple-dark/75 list-decimal space-y-1 pl-5 text-xs">
            <li>Aveonline necesita una URL pública (HTTPS) para llamarte.</li>
            <li>
              En desarrollo local puedes usar <code>ngrok http 4000</code> para exponer{" "}
              <code>localhost:4000</code> con HTTPS.
            </li>
            <li>
              En producción usa tu dominio real (
              <code>https://lucamsshop.com/api/webhooks/aveonline</code>).
            </li>
            <li>
              Aveonline incluirá el <code>secret</code> en cada request — nuestro endpoint lo valida
              y descarta peticiones falsas.
            </li>
          </ol>
          <p className="text-brand-muted mt-3 text-xs">
            Doc oficial:{" "}
            <Link
              href="https://integraciones.aveonline.co/docs/avecrm/crearWebhook/"
              target="_blank"
              className="underline"
            >
              integraciones.aveonline.co/docs/avecrm/crearWebhook
            </Link>
          </p>
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
