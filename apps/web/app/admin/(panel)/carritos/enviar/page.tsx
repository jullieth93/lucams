/*
 * Admin > Carritos abandonados > Envío masivo — confirmación (Fase 4,
 * 2026-10-13).
 *
 * Paso intermedio entre la selección de la bandeja (checkboxes + bar flotante)
 * y el envío: lista los carritos seleccionados con su estado y muestra el
 * PREVIEW REAL del correo del primero (cada correo es personalizado con los
 * productos de su carrito; desde la tabla se puede abrir el detalle de
 * cualquiera para ver el suyo). Recién acá se confirma y sale el lote.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MailWarning, Send } from "lucide-react";
import {
  AdminBadge,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { getCurrentAdmin } from "@/lib/auth";
import { formatCOP } from "@/lib/format";
import {
  ABANDONED_STATUS_LABEL,
  getAbandonedCartDetail,
  type AbandonedCartDetail,
} from "@/features/cart/admin-service";
import { getCartRecoverySettings } from "@/features/cart/recovery-settings";
import { bulkSendRemindersAction } from "../actions";

export const metadata: Metadata = { title: "Enviar recordatorios" };

const CUID_RE = /^c[a-z0-9]{24}$/;

export default async function AdminCarritosEnviarPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const idsRaw = typeof sp.ids === "string" ? sp.ids : "";
  const ids = [
    ...new Set(
      idsRaw
        .split(",")
        .map((v) => v.trim())
        .filter((v) => CUID_RE.test(v)),
    ),
  ];
  if (ids.length === 0)
    redirect("/admin/carritos?error=Selecci%C3%B3n%20vac%C3%ADa%20o%20inv%C3%A1lida");

  const [details, settings] = await Promise.all([
    Promise.all(ids.map((id) => getAbandonedCartDetail(id))),
    getCartRecoverySettings(),
  ]);
  const found = details.filter((d): d is AbandonedCartDetail => d !== null);
  if (found.length === 0) redirect("/admin/carritos?error=Ning%C3%BAn%20carrito%20v%C3%A1lido");

  const sendable = found.filter((d) => d.status !== "recovered" && d.items.length > 0);
  const notSendable = found.filter((d) => d.status === "recovered" || d.items.length === 0);
  // Preview del primero enviable (cada correo sale personalizado con su carrito).
  const previewTarget = sendable[0] ?? null;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Send className="h-5 w-5" />}
        title={`Enviar ${sendable.length} recordatorio${sendable.length === 1 ? "" : "s"}`}
        subtitle="Revisa la selección y el correo antes de confirmar — el envío es inmediato."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Marketing" },
          { label: "Carritos abandonados", href: "/admin/carritos" },
          { label: "Envío masivo" },
        ]}
      />

      <AdminPageBody>
        <Link
          href="/admin/carritos"
          className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-xs font-semibold"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a la bandeja
        </Link>

        {!settings.enabled && (
          <AdminNotice tone="warning">
            <strong>El módulo está apagado</strong> (Configuración): aunque confirmes, no se enviará
            nada.
          </AdminNotice>
        )}
        {notSendable.length > 0 && (
          <AdminNotice tone="info">
            {notSendable.length} de los seleccionados no recibirán correo (ya recuperados o sin
            productos).
          </AdminNotice>
        )}

        {/* Selección */}
        <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-brand-purple-dark mb-3 text-sm font-bold">
            Seleccionados ({found.length})
          </h2>
          <ul className="divide-brand-purple/8 divide-y text-sm">
            {found.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <Link
                    href={`/admin/carritos/${d.id}`}
                    className="text-brand-purple-dark hover:text-brand-purple text-xs font-semibold"
                  >
                    {d.email}
                  </Link>
                  <p className="text-brand-muted text-[11px]">
                    {d.items.length} {d.items.length === 1 ? "ítem" : "ítems"} ·{" "}
                    {formatCOP(d.totalCents)}
                    {d.reminderCount > 0 &&
                      ` · ya recibió ${d.reminderCount} recordatorio${d.reminderCount === 1 ? "" : "s"}`}
                  </p>
                </div>
                {d.status === "recovered" ? (
                  <AdminBadge tone="emerald">{ABANDONED_STATUS_LABEL.recovered}</AdminBadge>
                ) : d.items.length === 0 ? (
                  <AdminBadge tone="slate">Sin productos</AdminBadge>
                ) : d.status === "reminded" ? (
                  <AdminBadge tone="blue">{ABANDONED_STATUS_LABEL.reminded}</AdminBadge>
                ) : (
                  <AdminBadge tone="amber">{ABANDONED_STATUS_LABEL.pending}</AdminBadge>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Preview del correo */}
        {previewTarget && (
          <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-brand-purple-dark mb-1 text-sm font-bold">
              Así le llega el correo (ejemplo: {previewTarget.email})
            </h2>
            <p className="text-brand-muted mb-3 text-xs">
              Cada cliente recibe el suyo personalizado con los productos de SU carrito — abre
              cualquier fila de arriba para previsualizar otro.
            </p>
            <iframe
              src={`/admin/carritos/${previewTarget.id}/preview`}
              title={`Preview del correo de recuperación para ${previewTarget.email}`}
              className="border-brand-purple/10 h-[520px] w-full rounded-lg border bg-white"
            />
          </section>
        )}

        {/* Confirmación */}
        <section className="border-brand-purple/10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-brand-muted inline-flex max-w-md items-start gap-1.5 text-xs">
            <MailWarning className="mt-0.5 h-4 w-4 flex-shrink-0" />
            Se envían solo a los {sendable.length} carritos enviables. La anti-duplicación del
            módulo omite los que ya recibieron un recordatorio hace menos de{" "}
            {settings.intervalHours} h.
          </p>
          <ConfirmAction
            action={bulkSendRemindersAction}
            message={`¿Enviar ${sendable.length} recordatorio${sendable.length === 1 ? "" : "s"} ahora? Los correos salen de inmediato.`}
          >
            {sendable.map((d) => (
              <input key={d.id} type="hidden" name="ids" value={d.id} />
            ))}
            <button
              type="submit"
              disabled={sendable.length === 0 || !settings.enabled}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Confirmar y enviar {sendable.length}
            </button>
          </ConfirmAction>
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
