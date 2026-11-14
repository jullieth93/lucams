/*
 * Admin > Integraciones > Aveonline — gestión de webhooks (lo TÉCNICO de la
 * integración).
 *
 * La configuración de NEGOCIO del transporte (transportadoras del checkout +
 * envío propio Lucams) se movió a /admin/envios (decisión del owner: no es
 * parte de la integración Aveonline). Acá quedan solo los webhooks de
 * tracking: registrar uno nuevo (apuntando a /api/webhooks/aveonline) o
 * eliminar los existentes.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Cog,
  HeartPulse,
  Plug,
  Trash2,
  Truck,
  Webhook,
} from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminNotice,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminEmpty,
  KpiCard,
  QuickLink,
} from "@/components/admin-page";
import { ReauthForm } from "@/components/admin/mfa-reauth";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { mapAveonlineHealth, probeAveonlineSafely } from "@/lib/integration-health";
import { getCanonicalSiteUrl, getTrustedSelfBaseUrl } from "@/lib/origin";
import { isCatalogMode } from "@/lib/store-mode";
import { listAveonlineWebhooks } from "@/features/shipping/aveonline";
import { WebhookRegistrationForm } from "./webhook-form";
import { deleteAveonlineWebhookAction } from "./actions";

export const metadata: Metadata = {
  title: "Aveonline · Integraciones",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function AveonlineIntegrationPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole(ADMIN_ROLE_SETS.SUPER);
  if (isCatalogMode()) redirect("/admin/dashboard");

  const sp = await searchParams;
  const errorMsg = typeof sp.error === "string" ? sp.error : null;

  const canonicalSiteUrl = getCanonicalSiteUrl();
  const trustedSelfUrl = getTrustedSelfBaseUrl();
  const isOriginLocked = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL_ENV);
  const allowedOrigins = Array.from(
    new Set(
      [canonicalSiteUrl, trustedSelfUrl]
        .map((u) => {
          try {
            const parsed = new URL(u);
            return parsed.protocol === "https:" ? parsed.origin : null;
          } catch {
            return null;
          }
        })
        .filter((u): u is string => Boolean(u)),
    ),
  );
  const defaultBaseUrl = allowedOrigins[0] ?? canonicalSiteUrl;
  const canonicalWebhookUrl = `${defaultBaseUrl.replace(/\/+$/, "")}/api/webhooks/aveonline`;
  const hasSecret = !!process.env.AVEONLINE_WEBHOOK_SECRET?.trim();
  const aveonlineConfigured =
    !!process.env.AVEONLINE_USUARIO?.trim() && !!process.env.AVEONLINE_CLAVE?.trim();
  const productionDeployment = process.env.VERCEL_ENV === "production";

  // Listar webhooks actuales y diagnosticar autenticación en paralelo
  const [webhooksOutcome, probe] = await Promise.all([
    listAveonlineWebhooks().then(
      (res) => ({ items: res.items as { url?: string }[], error: null as string | null }),
      (err: unknown) => ({
        items: [] as { url?: string }[],
        error: err instanceof Error ? err.message : String(err),
      }),
    ),
    aveonlineConfigured ? probeAveonlineSafely() : Promise.resolve(null),
  ]);

  const webhooks = webhooksOutcome.items;
  const listError = webhooksOutcome.error;
  const aveValue = probe && !probe.probeFailed ? probe.value : null;
  const aveHealth = mapAveonlineHealth(probe, { productionDeployment });
  const canonicalRegistered = webhooks.some(
    (w) => w.url?.replace(/\/+$/, "") === canonicalWebhookUrl,
  );

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Plug className="h-5 w-5" />}
        title="Aveonline · Webhooks y Conector"
        subtitle="Suscripción de eventos de transporte, postura de autenticación y puente logístico"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Configuración" },
          { label: "Integraciones", href: "/admin/integraciones" },
          { label: "Aveonline" },
        ]}
        actions={
          <AdminButton href="/admin/integraciones" variant="secondary" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a Integraciones
          </AdminButton>
        }
      />

      <AdminPageBody>
        {errorMsg && <AdminNotice tone="error">{decodeURIComponent(errorMsg)}</AdminNotice>}

        {/* H7 — pantalla técnica: aviso permanente para que Lucy no toque nada por accidente. */}
        <AdminNotice tone="info">
          <strong>Pantalla de soporte técnico (Superadmin).</strong> El registro y la eliminación de
          webhooks exigen confirmación con tu segundo factor (TOTP) y bloquean dominios externos en
          entornos desplegados. Las transportadoras y tarifas del checkout se gestionan en{" "}
          <Link href="/admin/envios" className="font-semibold underline">
            Envíos →
          </Link>
        </AdminNotice>

        {!hasSecret && (
          <AdminNotice tone="warning">
            <strong>AVEONLINE_WEBHOOK_SECRET no configurado.</strong> Genera uno con{" "}
            <code className="rounded bg-amber-100 px-1.5 py-0.5">openssl rand -hex 32</code> y
            agrégalo a <code>apps/web/.env.local</code> (o a las variables de Vercel) antes de
            registrar el webhook.
          </AdminNotice>
        )}

        {/* KPIs de postura técnica del conector */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Estado de autenticación"
            value={
              !aveonlineConfigured
                ? "Sin credenciales"
                : aveHealth.status === "ok"
                  ? "Autenticado"
                  : aveHealth.status === "warn"
                    ? "Revisar modo"
                    : "Error"
            }
            trend={
              aveHealth.status === "ok" ? "up" : aveHealth.status === "fail" ? "down" : "neutral"
            }
            trendLabel={
              aveValue?.idempresa
                ? `idempresa #${aveValue.idempresa}${aveValue.isDemoAccount ? " (demo)" : " (comercial)"}`
                : (aveHealth.detail ?? "Configura AVEONLINE_USUARIO/CLAVE")
            }
          />
          <KpiCard
            label="Modo declarado"
            value={aveValue?.mode === "production" ? "Producción" : "Pruebas (test)"}
            trend="neutral"
            trendLabel={
              process.env.AVEONLINE_GENERATE_REAL === "true"
                ? "Generación real habilitada"
                : "Guías en modo simulación segura"
            }
          />
          <KpiCard
            label="Secreto de webhook"
            value={hasSecret ? "Configurado" : "Faltante"}
            trend={hasSecret ? "up" : "down"}
            trendLabel={
              hasSecret ? "Validación por token JSON activa" : "Requerido para recibir eventos"
            }
          />
          <KpiCard
            label="Webhooks listados"
            value={webhooks.length}
            trend={canonicalRegistered ? "up" : "neutral"}
            trendLabel={
              canonicalRegistered
                ? "URL oficial activa en AveCRM"
                : "Verifica registro o listado AveCRM"
            }
          />
        </div>

        {/* Form registro */}
        <AdminCard className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Webhook className="text-brand-purple h-4 w-4" />
              <h2 className="text-brand-purple-dark font-display text-base font-bold">
                Registrar webhook en Aveonline
              </h2>
            </div>
            {canonicalRegistered && (
              <AdminBadge tone="emerald">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                URL canónica registrada
              </AdminBadge>
            )}
          </div>
          <p className="text-brand-muted mb-4 text-xs leading-relaxed">
            Aveonline llamará a esta ruta cada vez que cambie el estado de una guía (recogida, en
            tránsito, novedad o entregada). El receptor{" "}
            <code className="bg-brand-purple/10 rounded px-1.5 py-0.5">
              /api/webhooks/aveonline
            </code>{" "}
            valida el token secreto en el cuerpo JSON (sin exponer secretos en la URL) e
            idempotentemente actualiza el pedido.
          </p>
          <WebhookRegistrationForm
            defaultBaseUrl={defaultBaseUrl}
            allowedOrigins={allowedOrigins}
            isOriginLocked={isOriginLocked}
            disabled={!hasSecret || !aveonlineConfigured}
          />
        </AdminCard>

        {/* Lista webhooks actuales */}
        <AdminCard className="p-5">
          <h2 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
            Webhooks registrados ({webhooks.length})
          </h2>
          {listError && <AdminNotice tone="error">No se pudo listar: {listError}</AdminNotice>}
          {webhooks.length === 0 && !listError ? (
            <AdminEmpty
              icon={<Webhook className="h-5 w-5" />}
              title="Sin webhooks listados por AveCRM"
              description="Registra el webhook arriba para que Aveonline notifique los cambios de estado de las guías (además del respaldo automático por cron de seguimiento)."
            />
          ) : (
            <AdminTable>
              <AdminTableHead>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">URL registrada</th>
                  <th className="px-4 py-3 text-left font-semibold">Coincidencia</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {webhooks.map((w, i) => {
                  const isCanonical = w.url?.replace(/\/+$/, "") === canonicalWebhookUrl;
                  return (
                    <AdminTableRow key={i}>
                      <td className="px-4 py-3 font-mono text-xs break-all">
                        {w.url ?? JSON.stringify(w).slice(0, 100)}
                      </td>
                      <td className="px-4 py-3">
                        {isCanonical ? (
                          <AdminBadge tone="emerald">Dominio oficial</AdminBadge>
                        ) : (
                          <AdminBadge tone="amber">Otro origen</AdminBadge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {w.url && (
                          <ReauthForm
                            action={deleteAveonlineWebhookAction}
                            confirmMessage="¿Eliminar este webhook? Aveonline dejará de notificar a esa URL los cambios de estado de las guías."
                            className="inline"
                          >
                            <input type="hidden" name="url" value={w.url} />
                            <Hint content="Eliminar este webhook (requiere 2FA)">
                              <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </Hint>
                          </ReauthForm>
                        )}
                      </td>
                    </AdminTableRow>
                  );
                })}
              </AdminTableBody>
            </AdminTable>
          )}
        </AdminCard>

        {/* Conexiones 360° del ecosistema logístico */}
        <section>
          <h2 className="text-brand-purple-dark/70 mb-2.5 text-xs font-bold tracking-wider uppercase">
            Conexiones del flujo logístico
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <QuickLink
              href="/admin/envios"
              icon={Truck}
              label="Transportadoras y Envío Lucams"
              description="Activa o pausa transportadoras aliadas, reglas de peso y zonas locales."
            />
            <QuickLink
              href="/admin/contenido/paginas/global"
              icon={Cog}
              label="Origen de despacho (PICKUP)"
              description="Ciudad, dirección, teléfono y NIT remitente que Aveonline exige al generar guías."
            />
            <QuickLink
              href="/admin/observability"
              icon={HeartPulse}
              label="Salud de webhooks y crons"
              description="Monitorea eventos recibidos, reintentos y respaldo del cron de tracking."
            />
          </div>
        </section>

        {/* Ayuda */}
        <section className="border-brand-purple/10 bg-brand-purple/5 rounded-xl border p-5">
          <h3 className="text-brand-purple-dark mb-2 text-sm font-bold">¿Cómo funciona?</h3>
          <ol className="text-brand-purple-dark/75 list-decimal space-y-1 pl-5 text-xs">
            <li>Aveonline necesita una URL pública HTTPS para entregar eventos de estado.</li>
            <li>
              En desarrollo local puedes usar <code>ngrok http 4000</code> para exponer{" "}
              <code>localhost:4000</code> con HTTPS temporal.
            </li>
            <li>
              En STG y Producción el sistema bloquea automáticamente dominios externos y fija{" "}
              <code>{canonicalWebhookUrl}</code>.
            </li>
            <li>
              Aveonline incluirá el <code>secret</code> en cada notificación JSON — nuestro endpoint
              lo valida en tiempo constante y descarta peticiones no autorizadas.
            </li>
          </ol>
          <p className="text-brand-muted mt-3 text-xs">
            Documentación oficial:{" "}
            <Link
              href="https://integraciones.aveonline.co/docs/avecrm/crearWebhook/"
              target="_blank"
              rel="noreferrer"
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
