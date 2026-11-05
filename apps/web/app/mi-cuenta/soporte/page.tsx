/*
 * `/mi-cuenta/soporte` — Bandeja bidireccional de solicitudes del cliente (`S21`).
 *
 * Evoluciona la bandeja de solo lectura a conversación bidireccional completa:
 * el cliente ve tanto sus mensajes como las respuestas públicas del equipo, y
 * puede responder directamente desde aquí (reabriendo el ticket si estaba cerrado).
 * Las notas internas (`isInternal: true`) están excluidas en SQL.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, LifeBuoy, Mail } from "lucide-react";
import { getCurrentCustomer } from "@/lib/auth";
import { listBidirectionalTicketsForCustomer } from "@/features/support/public-thread-service";
import { SUBJECT_LABELS, type SUPPORT_SUBJECTS } from "@/features/support/schemas";
import { CustomerTicketReplyForm } from "@/components/support/customer-ticket-reply-form";
import { getAccountTexts } from "../account-texts.server";
import { formatDateCO } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Soporte",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Recibido",
  IN_PROGRESS: "En atención",
  CLOSED: "Resuelto",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  OPEN: "bg-amber-100 text-amber-900",
  IN_PROGRESS: "bg-brand-purple/15 text-brand-purple-dark",
  CLOSED: "bg-emerald-100 text-emerald-900",
};

function ticketStatusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

function ticketStatusBadgeClass(status: string): string {
  return STATUS_BADGE_CLASS[status] ?? "bg-slate-100 text-slate-700";
}

function subjectLabel(subject: string): string {
  return SUBJECT_LABELS[subject as (typeof SUPPORT_SUBJECTS)[number]] ?? subject;
}

export default async function MiCuentaSoportePage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta/soporte");

  const [tickets, texts] = await Promise.all([
    listBidirectionalTicketsForCustomer(session.customer.id),
    getAccountTexts(),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/mi-cuenta"
        className="text-brand-muted hover:text-brand-purple-dark -mt-2 mb-4 inline-flex min-h-10 items-center gap-1 text-sm"
      >
        <ChevronLeft className="h-4 w-4" /> {texts.back.miCuenta}
      </Link>

      <header className="mb-6">
        <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
          Mis solicitudes de soporte
        </h1>
        <p className="text-brand-muted mt-1 text-sm">
          Consulta nuestras respuestas por correo o continúa la conversación directamente aquí.
        </p>
      </header>

      <div className="border-brand-purple/15 mb-6 flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-sm">
        <span className="bg-brand-purple/10 text-brand-purple flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full">
          <Mail className="h-4 w-4" aria-hidden />
        </span>
        <p className="text-brand-muted text-sm leading-snug">
          Cada respuesta del equipo llega también a tu correo. ¿Tienes un tema nuevo? Abre una
          solicitud en{" "}
          <Link
            href="/contacto"
            className="text-brand-pink-ink hover:text-brand-coral-ink font-semibold"
          >
            contacto
          </Link>
          .
        </p>
      </div>

      {tickets.length === 0 ? (
        <div className="border-brand-purple/15 flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-white px-6 py-12 text-center">
          <LifeBuoy className="text-brand-pink/50 h-10 w-10" />
          <p className="text-brand-purple-dark font-semibold">Aún no tienes solicitudes</p>
          <p className="text-brand-muted max-w-sm text-sm">
            Cuando nos escribas desde el formulario de contacto, tu solicitud aparecerá aquí con su
            estado ✨
          </p>
          <Link
            href="/contacto"
            className="bg-brand-purple hover:bg-brand-purple-dark mt-1 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
          >
            <LifeBuoy className="h-4 w-4" />
            Ir a contacto
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {tickets.map((t) => (
            <li
              key={t.id}
              className="border-brand-purple/15 rounded-2xl border bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-brand-purple-dark font-mono text-sm font-semibold">
                  #{t.shortId}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ticketStatusBadgeClass(t.status)}`}
                >
                  {ticketStatusLabel(t.status)}
                </span>
                <span className="text-brand-muted ml-auto text-xs">
                  {formatDateCO(t.createdAt)}
                </span>
              </div>
              <p className="text-brand-purple-dark mt-1.5 text-sm font-semibold">
                {subjectLabel(t.subject)}
              </p>
              <p className="text-brand-muted mt-1 text-sm whitespace-pre-line">{t.message}</p>
              {t.ownOrderNumber && (
                <p className="mt-2 text-xs">
                  <Link
                    href={`/mi-cuenta/pedidos/${t.ownOrderNumber}`}
                    className="text-brand-pink-ink hover:text-brand-coral-ink font-semibold"
                  >
                    Ver mi pedido
                  </Link>{" "}
                  <span className="text-brand-muted font-mono">{t.ownOrderNumber}</span>
                </p>
              )}
              {t.messages.length > 0 && (
                <div className="border-brand-purple/15 mt-3 rounded-xl border bg-white/60 p-3">
                  <p className="text-brand-purple-dark text-xs font-semibold">Conversación</p>
                  <ul className="mt-2 space-y-2">
                    {t.messages.map((m) => (
                      <li
                        key={m.id}
                        className={`border-l-2 pl-3 ${
                          m.authorKind === "ADMIN"
                            ? "border-brand-purple"
                            : "border-brand-turquoise"
                        }`}
                      >
                        <p className="text-brand-purple-dark text-[11px] font-semibold">
                          {m.authorKind === "ADMIN" ? "Equipo Lucams" : "Tú"} ·{" "}
                          <span className="text-brand-muted font-normal">
                            {formatDateCO(m.createdAt)}
                          </span>
                        </p>
                        <p className="text-brand-purple-dark/90 mt-0.5 text-sm whitespace-pre-line">
                          {m.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {t.resolvedAt && (
                <p className="text-brand-muted mt-2 text-xs">
                  Resuelta el {formatDateCO(t.resolvedAt)} — te avisamos por correo.
                </p>
              )}

              <CustomerTicketReplyForm mode="account" ticketId={t.id} ticketStatus={t.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
