/*
 * /mi-cuenta/soporte — Bandeja de tickets del cliente (5.3, 2026-09-13).
 *
 * ADR-092 difería esta bandeja; aprobada en la remediación 360°. El canal de
 * respuesta SIGUE siendo el correo (la respuesta es humana, llega al email de
 * la cuenta): acá el cliente solo consulta qué pidió y en qué estado está.
 * Copy honesto al respecto — no se promete chat ni respuesta en pantalla.
 *
 * Solo tickets con customerId (creados logueado desde /contacto); los de
 * invitado no tienen dueño y quedan fuera. Aislamiento por customerId.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, LifeBuoy, Mail } from "lucide-react";
import { CmsText } from "@/components/cms/cms-text";
import { getCurrentCustomer } from "@/lib/auth";
import { listTicketsForCustomer } from "@/features/support/customer-service";
import { SUBJECT_LABELS, type SUPPORT_SUBJECTS } from "@/features/support/schemas";
import { getAccountTexts } from "../account-texts.server";

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
    listTicketsForCustomer(session.customer.id),
    getAccountTexts(),
  ]);

  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/mi-cuenta"
        className="text-brand-muted hover:text-brand-purple-dark mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="h-4 w-4" /> {texts.back.miCuenta}
      </Link>

      <header className="mb-6">
        <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
          <CmsText blockKey="account.support.heading" fallback="Mis solicitudes de soporte" />
        </h1>
        <p className="text-brand-muted mt-1 text-sm">
          <CmsText
            blockKey="account.support.subtext"
            fallback="Te respondemos por correo, a tu email. Aquí puedes ver en qué va cada solicitud."
          />
        </p>
      </header>

      {/* Copy honesto (ADR-092): la respuesta es humana y llega por email — esta
          bandeja es solo consulta, no un chat. */}
      <div className="border-brand-purple/15 mb-6 flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-sm">
        <span className="bg-brand-purple/10 text-brand-purple flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full">
          <Mail className="h-4 w-4" aria-hidden />
        </span>
        <p className="text-brand-muted text-sm leading-snug">
          <CmsText
            blockKey="account.support.email-note"
            fallback="Cuando tengamos respuesta te escribimos a tu correo (revisa también spam). ¿Necesitas algo más? Escríbenos desde"
          />{" "}
          <Link
            href="/contacto"
            className="text-brand-pink-ink hover:text-brand-coral-ink font-semibold"
          >
            <CmsText blockKey="account.support.contact-cta" fallback="contacto" />
          </Link>
          .
        </p>
      </div>

      {tickets.length === 0 ? (
        <div className="border-brand-purple/15 flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-white px-6 py-12 text-center">
          <LifeBuoy className="text-brand-pink/50 h-10 w-10" />
          <p className="text-brand-purple-dark font-semibold">
            <CmsText blockKey="account.support.empty.title" fallback="Aún no tienes solicitudes" />
          </p>
          <p className="text-brand-muted max-w-sm text-sm">
            <CmsText
              blockKey="account.support.empty.subtext"
              fallback="Cuando nos escribas desde el formulario de contacto, tu solicitud aparecerá aquí con su estado ✨"
            />
          </p>
          <Link
            href="/contacto"
            className="bg-brand-purple hover:bg-brand-purple-dark mt-1 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
          >
            <LifeBuoy className="h-4 w-4" />
            <CmsText blockKey="account.support.empty.cta" fallback="Ir a contacto" />
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {tickets.map((t) => (
            <li
              key={t.shortId}
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
                  {dateFmt.format(t.createdAt)}
                </span>
              </div>
              <p className="text-brand-purple-dark mt-1.5 text-sm font-semibold">
                {subjectLabel(t.subject)}
              </p>
              <p className="text-brand-muted mt-1 text-sm whitespace-pre-line">{t.message}</p>
              {t.resolvedAt && (
                <p className="text-brand-muted mt-2 text-xs">
                  Resuelta el {dateFmt.format(t.resolvedAt)} — te avisamos por correo.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
