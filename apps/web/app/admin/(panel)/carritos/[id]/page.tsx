/*
 * Admin > Carritos abandonados > Diagnóstico y envío (`/admin/carritos/[id]`).
 *
 * Muestra qué sucedió realmente con el carrito:
 *   1. Línea de tiempo de checkout (`Datos` → `Envío` → `Pago`), recordatorios,
 *      pedidos creados, rechazos Wompi o cotizaciones vinculadas.
 *   2. Productos y diseños personalizados del carrito (vivos o desde snapshot inmutable).
 *   3. Ficha del cliente (`Contacto 360` + WhatsApp directo al comprador).
 *   4. Preview real del correo y acción de envío manual con confirmación.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileText,
  MailWarning,
  MessageCircle,
  Package,
  ShoppingCart,
  UserRound,
} from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { getCurrentAdmin } from "@/lib/auth";
import { hasCapability } from "@/lib/admin-rbac";
import { formatCOP } from "@/lib/format";
import { customerWaLink } from "@/lib/wa";
import {
  ABANDONED_STATUS_LABEL,
  CHECKOUT_STEP_LABEL,
  CLOSED_REASON_LABEL,
  getAbandonedCartDetail,
} from "@/features/cart/admin-service";
import { getCartRecoverySettings } from "@/features/cart/recovery-settings";
import { sendReminderAction } from "../actions";

export const metadata: Metadata = { title: "Diagnóstico de carrito abandonado" };

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const CUID_RE = /^c[a-z0-9]{24}$/;

const STEP_ORDER = ["DATOS", "ENVIO", "PAGO"] as const;

export default async function AdminCarritoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  const canRead360 = hasCapability(session.admin.role, "contacts:read_360");

  const { id } = await params;
  const sp = await searchParams;
  if (!CUID_RE.test(id)) notFound();

  const [detail, settings] = await Promise.all([
    getAbandonedCartDetail(id),
    getCartRecoverySettings(),
  ]);
  if (!detail) notFound();

  const canSend =
    settings.enabled &&
    detail.status !== "recovered" &&
    detail.status !== "closed" &&
    detail.itemsSource === "live" &&
    detail.items.length > 0;

  const tooSoonUntil =
    detail.lastReminderSentAt && settings.intervalHours > 0
      ? new Date(detail.lastReminderSentAt.getTime() + settings.intervalHours * 3_600_000)
      : null;
  const blockedByInterval = tooSoonUntil !== null && tooSoonUntil.getTime() > new Date().getTime();

  const reachedIndex = detail.checkoutStep
    ? STEP_ORDER.indexOf(detail.checkoutStep as (typeof STEP_ORDER)[number])
    : 0;

  const waUrl = detail.contact?.whatsappPhone
    ? customerWaLink(
        detail.contact.whatsappPhone,
        `Hola${detail.contact.displayName ? ` ${detail.contact.displayName}` : ""}, te escribimos de Lucams Shop para ayudarte a completar tu pedido pendiente. `,
      )
    : null;

  const allWompiDeclines = detail.linkedOrders.flatMap((o) =>
    o.wompiDeclines.map((d) => ({ ...d, orderNumber: o.number })),
  );

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<ShoppingCart className="h-5 w-5" />}
        title={
          detail.contact?.displayName
            ? `Carrito de ${detail.contact.displayName}`
            : `Carrito de ${detail.email}`
        }
        subtitle={
          <>
            Registrado el {dateFmt.format(detail.createdAt)} · {detail.email} ·{" "}
            {detail.lineItems.length} {detail.lineItems.length === 1 ? "línea" : "líneas"} ·{" "}
            <strong className="text-brand-purple-dark">{formatCOP(detail.totalCents)}</strong>
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Marketing" },
          { label: "Carritos abandonados", href: "/admin/carritos" },
          { label: "Diagnóstico" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canRead360 && detail.contact && (
              <Link
                href={`/admin/clientes/${encodeURIComponent(detail.contact.id)}`}
                className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-10 items-center gap-1.5 rounded-xl border bg-white px-3.5 py-2 text-xs font-semibold"
              >
                <UserRound className="h-4 w-4" />
                Contacto 360
              </Link>
            )}
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" />
                Escribir al cliente por WhatsApp
              </a>
            )}
          </div>
        }
      />

      <AdminPageBody>
        <Link
          href="/admin/carritos"
          className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-xs font-semibold"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a la bandeja de carritos
        </Link>

        {typeof sp.sent === "string" && (
          <AdminNotice tone="success">
            Recordatorio enviado a {sp.sent}. El cliente recibe el correo con el link para retomar
            su compra.
          </AdminNotice>
        )}
        {typeof sp.notice === "string" && <AdminNotice tone="info">{sp.notice}</AdminNotice>}
        {typeof sp.error === "string" && <AdminNotice tone="error">{sp.error}</AdminNotice>}

        {/* 1. ¿Qué sucedió realmente con este carrito? */}
        <AdminCard className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-brand-purple-dark text-sm font-bold">
                ¿Qué sucedió realmente con este carrito?
              </h2>
              <p className="text-brand-muted mt-0.5 text-xs">
                Trazabilidad del avance en checkout, intentos de cobro y desenlace comercial.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {detail.status === "recovered" ? (
                <AdminBadge tone="emerald">{ABANDONED_STATUS_LABEL.recovered}</AdminBadge>
              ) : detail.status === "closed" ? (
                <AdminBadge tone="slate">{ABANDONED_STATUS_LABEL.closed}</AdminBadge>
              ) : detail.status === "reminded" ? (
                <AdminBadge tone="blue">
                  {ABANDONED_STATUS_LABEL.reminded}
                  {detail.reminderCount > 1 ? ` ×${detail.reminderCount}` : ""}
                </AdminBadge>
              ) : (
                <AdminBadge tone="amber">{ABANDONED_STATUS_LABEL.pending}</AdminBadge>
              )}
              {detail.closedReason && (
                <AdminBadge tone={detail.closedReason === "ORDER_PAID" ? "emerald" : "purple"}>
                  {CLOSED_REASON_LABEL[detail.closedReason] ?? detail.closedReason}
                </AdminBadge>
              )}
            </div>
          </div>

          {/* Barra visual de progreso por pasos del checkout */}
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {STEP_ORDER.map((st, idx) => {
              const reached = idx <= Math.max(0, reachedIndex);
              const isLastReached =
                idx === Math.max(0, reachedIndex) && detail.status !== "recovered";
              return (
                <div
                  key={st}
                  className={`rounded-xl border p-3 ${
                    detail.status === "recovered"
                      ? "border-emerald-200 bg-emerald-50/60"
                      : isLastReached
                        ? "border-amber-300 bg-amber-50/70"
                        : reached
                          ? "border-brand-purple/20 bg-brand-purple/5"
                          : "border-slate-200 bg-slate-50/60 opacity-70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-brand-purple-dark text-xs font-bold">
                      {CHECKOUT_STEP_LABEL[st]}
                    </span>
                    {reached ? (
                      <CheckCircle2
                        className={`h-4 w-4 shrink-0 ${
                          detail.status === "recovered"
                            ? "text-emerald-600"
                            : isLastReached
                              ? "text-amber-600"
                              : "text-brand-purple"
                        }`}
                      />
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400">No alcanzado</span>
                    )}
                  </div>
                  <p className="text-brand-muted mt-1 text-[11px]">
                    {isLastReached
                      ? "Último paso registrado antes de abandonar"
                      : reached
                        ? "Completado por el cliente"
                        : "El cliente se detuvo antes de llegar acá"}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Señales concretas: rechazos Wompi, pedidos y cotizaciones */}
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* Pedidos asociados / intentos de pago */}
            <div className="border-brand-purple/10 rounded-xl border bg-[#FFF8F0]/50 p-3.5">
              <p className="text-brand-purple-dark flex items-center gap-1.5 text-xs font-bold">
                <Package className="text-brand-purple h-4 w-4" />
                Pedidos e intentos de pago ({detail.linkedOrders.length})
              </p>
              {detail.linkedOrders.length === 0 ? (
                <p className="text-brand-muted mt-1.5 text-xs">
                  El cliente aún no generó una orden de pago (se quedó antes de confirmar pago).
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {detail.linkedOrders.map((ord) => (
                    <li
                      key={ord.id}
                      className="border-brand-purple/10 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-xs"
                    >
                      <div>
                        <Link
                          href={`/admin/pedidos/${encodeURIComponent(ord.number)}`}
                          className="text-brand-purple font-mono font-bold hover:underline"
                        >
                          {ord.number}
                        </Link>
                        <span className="text-brand-muted ml-2">
                          {ord.paymentMethod} · {formatCOP(ord.total)} ·{" "}
                          {dateFmt.format(ord.createdAt)}
                        </span>
                      </div>
                      <AdminBadge
                        tone={
                          ord.status === "PAID" ||
                          ord.status === "FULFILLING" ||
                          ord.status === "SHIPPED" ||
                          ord.status === "DELIVERED"
                            ? "emerald"
                            : ord.status === "PENDING_PAYMENT"
                              ? "amber"
                              : "slate"
                        }
                      >
                        {ord.status}
                      </AdminBadge>
                    </li>
                  ))}
                </ul>
              )}

              {allWompiDeclines.length > 0 && (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/80 p-2.5 text-xs text-rose-900">
                  <p className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="h-4 w-4 text-rose-600" />
                    Rechazos o fallos reportados por Wompi ({allWompiDeclines.length})
                  </p>
                  <ul className="mt-1.5 space-y-1 text-[11px]">
                    {allWompiDeclines.map((dec) => (
                      <li key={dec.externalId}>
                        <strong>{dec.orderNumber}</strong> · {dec.paymentMethodType ?? "Medio N/D"}{" "}
                        ({dec.status}){dec.statusMessage ? ` — «${dec.statusMessage}»` : ""} ·{" "}
                        {dateFmt.format(dec.createdAt)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Cotizaciones / Recordatorios enviados */}
            <div className="border-brand-purple/10 rounded-xl border bg-[#FFF8F0]/50 p-3.5">
              <p className="text-brand-purple-dark flex items-center gap-1.5 text-xs font-bold">
                <FileText className="text-brand-purple h-4 w-4" />
                Historial de recuperación y cotizaciones
              </p>
              <div className="text-brand-purple-dark/85 mt-1.5 space-y-1 text-xs">
                <p>
                  Recordatorios por correo enviados: <strong>{detail.reminderCount}</strong>
                  {detail.lastReminderSentAt &&
                    ` (último: ${dateFmt.format(detail.lastReminderSentAt)})`}
                </p>
                {detail.recoveredAt && (
                  <p className="font-semibold text-emerald-700">
                    Recuperado el {dateFmt.format(detail.recoveredAt)}
                  </p>
                )}
              </div>

              {detail.linkedQuotes.length > 0 && (
                <div className="mt-2.5 border-t border-purple-200/50 pt-2">
                  <p className="text-brand-muted mb-1.5 text-[11px] font-semibold">
                    Cotizaciones vinculadas a este cliente:
                  </p>
                  <ul className="space-y-1.5">
                    {detail.linkedQuotes.map((qt) => (
                      <li
                        key={qt.id}
                        className="border-brand-purple/10 flex items-center justify-between rounded-lg border bg-white px-2.5 py-1.5 text-xs"
                      >
                        <Link
                          href={`/admin/cotizaciones/${encodeURIComponent(qt.id)}`}
                          className="text-brand-purple font-mono font-bold hover:underline"
                        >
                          {qt.number}
                        </Link>
                        <span className="text-brand-muted text-[11px]">
                          {formatCOP(qt.total)} · {qt.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </AdminCard>

        {/* 2. Productos y diseños personalizados del carrito */}
        <AdminCard className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-brand-purple-dark text-sm font-bold">
                Productos y diseños en el carrito ({detail.lineItems.length})
              </h2>
              <p className="text-brand-muted text-xs">
                {detail.itemsSource === "live"
                  ? "Líneas activas en el carrito actual del cliente."
                  : detail.itemsSource === "snapshot"
                    ? "Snapshot preservado al momento del abandono (el carrito vivo ya cambió o se cerró)."
                    : detail.itemsSource === "order"
                      ? "Reconstruido desde el pedido asociado."
                      : "No quedaron líneas registradas en este carrito."}
              </p>
            </div>
            <span className="text-brand-purple-dark font-display text-base font-bold tabular-nums">
              Subtotal: {formatCOP(detail.totalCents)}
            </span>
          </div>

          {detail.lineItems.length === 0 ? (
            <p className="text-brand-muted mt-3 text-xs">
              Este registro histórico se vació antes de capturar productos.
            </p>
          ) : (
            <ul className="divide-brand-purple/10 mt-3 divide-y">
              {detail.lineItems.map((li, idx) => {
                const thumb = li.designPreviewUrl ?? li.imageUrl;
                return (
                  <li
                    key={`${li.productName}-${idx}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={li.productName}
                          className="border-brand-purple/15 h-12 w-12 shrink-0 rounded-lg border object-cover"
                        />
                      ) : (
                        <div className="bg-brand-purple/10 text-brand-purple flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
                          LCM
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-brand-purple-dark text-sm font-bold">
                            {li.productName}
                          </span>
                          {li.designId && (
                            <AdminBadge tone="pink">Diseño personalizado en Estudio</AdminBadge>
                          )}
                        </div>
                        <p className="text-brand-muted text-xs">
                          {li.variantName ? `${li.variantName} · ` : ""}
                          Cantidad: {li.qty}
                          {li.units ? ` (${li.units} unidades físicas)` : ""} ·{" "}
                          {formatCOP(li.unitPrice)} c/u
                        </p>
                        {li.productSlug && (
                          <Link
                            href={`/producto/${encodeURIComponent(li.productSlug)}`}
                            target="_blank"
                            className="text-brand-purple inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
                          >
                            Ver ficha pública <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="text-brand-purple-dark text-sm font-bold tabular-nums">
                      {formatCOP(li.qty * li.unitPrice)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </AdminCard>

        {/* 3. Acción de envío manual de correo */}
        <AdminCard className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 text-sm">
              <h2 className="text-brand-purple-dark text-sm font-bold">
                Envío de correo de recuperación
              </h2>
              <p className="text-brand-muted text-xs">
                Envía un link único (hash SHA-256) para que el cliente retome su carrito en un clic.
              </p>
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
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
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
              <p className="text-brand-muted inline-flex max-w-md items-start gap-1.5 text-xs">
                <MailWarning className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {!settings.enabled
                  ? "El módulo está apagado (Configuración): no se pueden enviar recordatorios."
                  : detail.status === "recovered"
                    ? "Este carrito ya se convirtió en pedido pagado: no requiere recordatorio."
                    : detail.status === "closed"
                      ? `Este carrito ya se cerró (${CLOSED_REASON_LABEL[detail.closedReason ?? ""] ?? "cotizado o vaciado"}): no requiere correo de carrito.`
                      : "El carrito vivo ya no tiene productos activos para restaurar por link."}
              </p>
            )}
          </div>
        </AdminCard>

        {/* 4. Preview REAL del correo */}
        {detail.items.length > 0 && (
          <AdminCard className="p-5">
            <h2 className="text-brand-purple-dark mb-1 text-sm font-bold">
              Así se visualiza el correo de recuperación
            </h2>
            <p className="text-brand-muted mb-3 text-xs">
              Preview del template real con los productos de este carrito (el link del preview es de
              ejemplo; el correo enviado genera un token único seguro).
            </p>
            <iframe
              src={`/admin/carritos/${detail.id}/preview`}
              sandbox=""
              title={`Preview del correo de recuperación para ${detail.email}`}
              className="border-brand-purple/10 h-[500px] w-full rounded-lg border bg-white"
            />
          </AdminCard>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
