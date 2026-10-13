/*
 * Admin > Carritos abandonados > Detalle (Fase 4, 2026-10-13).
 *
 * Pantalla de envío manual de UN recordatorio: muestra el resumen del carrito
 * y el PREVIEW REAL del correo (iframe a ./preview, que renderiza el template
 * cart-recovery con los items del carrito — mismo render con overrides que el
 * envío) y recién ahí el botón «Enviar recordatorio ahora». El token del link
 * del preview es ficticio; el real se genera en el envío (F-11).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MailWarning, ShoppingCart } from "lucide-react";
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
import { ABANDONED_STATUS_LABEL, getAbandonedCartDetail } from "@/features/cart/admin-service";
import { getCartRecoverySettings } from "@/features/cart/recovery-settings";
import { sendReminderAction } from "../actions";

export const metadata: Metadata = { title: "Carrito abandonado" };

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const CUID_RE = /^c[a-z0-9]{24}$/;

export default async function AdminCarritoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const sp = await searchParams;
  if (!CUID_RE.test(id)) notFound();

  const [detail, settings] = await Promise.all([
    getAbandonedCartDetail(id),
    getCartRecoverySettings(),
  ]);
  if (!detail) notFound();

  const canSend = settings.enabled && detail.status !== "recovered" && detail.items.length > 0;
  const tooSoonUntil =
    detail.lastReminderSentAt && settings.intervalHours > 0
      ? new Date(detail.lastReminderSentAt.getTime() + settings.intervalHours * 3_600_000)
      : null;
  const blockedByInterval = tooSoonUntil !== null && tooSoonUntil.getTime() > new Date().getTime();

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<ShoppingCart className="h-5 w-5" />}
        title={`Carrito de ${detail.email}`}
        subtitle={
          <>
            Abandonado el {dateFmt.format(detail.createdAt)} · {detail.items.length}{" "}
            {detail.items.length === 1 ? "ítem" : "ítems"} · {formatCOP(detail.totalCents)}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Marketing" },
          { label: "Carritos abandonados", href: "/admin/carritos" },
          { label: "Detalle" },
        ]}
      />

      <AdminPageBody>
        <Link
          href="/admin/carritos"
          className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-xs font-semibold"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a la bandeja
        </Link>

        {typeof sp.sent === "string" && (
          <AdminNotice tone="success">
            Recordatorio enviado a {sp.sent}. El cliente recibe el correo con el link para retomar
            su compra.
          </AdminNotice>
        )}
        {typeof sp.notice === "string" && <AdminNotice tone="info">{sp.notice}</AdminNotice>}
        {typeof sp.error === "string" && <AdminNotice tone="error">{sp.error}</AdminNotice>}

        {/* Estado y acción */}
        <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 text-sm">
              <p className="text-brand-purple-dark flex items-center gap-2 font-semibold">
                Estado:
                {detail.status === "recovered" ? (
                  <AdminBadge tone="emerald">{ABANDONED_STATUS_LABEL.recovered}</AdminBadge>
                ) : detail.status === "reminded" ? (
                  <AdminBadge tone="blue">
                    {ABANDONED_STATUS_LABEL.reminded}
                    {detail.reminderCount > 1 ? ` ×${detail.reminderCount}` : ""}
                  </AdminBadge>
                ) : (
                  <AdminBadge tone="amber">{ABANDONED_STATUS_LABEL.pending}</AdminBadge>
                )}
              </p>
              {detail.lastReminderSentAt && (
                <p className="text-brand-muted text-xs">
                  Último recordatorio: {dateFmt.format(detail.lastReminderSentAt)} (
                  {detail.reminderCount} en total)
                </p>
              )}
              {detail.recoveredAt && (
                <p className="text-brand-muted text-xs">
                  Recuperado el {dateFmt.format(detail.recoveredAt)}
                </p>
              )}
            </div>

            {canSend ? (
              <div className="flex flex-col items-end gap-1">
                <ConfirmAction
                  action={sendReminderAction}
                  message={`¿Enviar el recordatorio a ${detail.email}? El correo sale ahora con el link para retomar la compra.`}
                >
                  <input type="hidden" name="id" value={detail.id} />
                  <input type="hidden" name="email" value={detail.email} />
                  <button
                    type="submit"
                    disabled={blockedByInterval}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Enviar recordatorio ahora
                  </button>
                </ConfirmAction>
                {blockedByInterval && tooSoonUntil && (
                  <p className="text-brand-muted max-w-xs text-right text-[11px]">
                    Anti-duplicación: ya se envió uno hace poco — podrás reenviar desde{" "}
                    {tooSoonUntil.toLocaleString("es-CO")}.
                  </p>
                )}
                {!blockedByInterval && detail.lastReminderSentAt && (
                  <p className="text-brand-muted max-w-xs text-right text-[11px]">
                    Ya recibió {detail.reminderCount} recordatorio
                    {detail.reminderCount === 1 ? "" : "s"} — revisa el preview antes de reenviar.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-brand-muted inline-flex max-w-sm items-start gap-1.5 text-xs">
                <MailWarning className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {!settings.enabled
                  ? "El módulo está apagado (Configuración): no se pueden enviar recordatorios."
                  : detail.status === "recovered"
                    ? "Este carrito ya fue recuperado: nada que recordar."
                    : "El carrito ya no tiene productos: nada que recordar."}
              </p>
            )}
          </div>
        </section>

        {/* Preview REAL del correo */}
        <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-brand-purple-dark mb-1 text-sm font-bold">Así le llega el correo</h2>
          <p className="text-brand-muted mb-3 text-xs">
            Preview del template real con los productos de este carrito (el link del preview es de
            ejemplo; el correo real lleva el link de recuperación único).
          </p>
          <iframe
            src={`/admin/carritos/${detail.id}/preview`}
            title={`Preview del correo de recuperación para ${detail.email}`}
            className="border-brand-purple/10 h-[520px] w-full rounded-lg border bg-white"
          />
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
