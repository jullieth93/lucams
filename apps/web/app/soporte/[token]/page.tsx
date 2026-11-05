/*
 * `/soporte/[token]` — Seguimiento e hilo bidireccional autenticado por token (`Fase 10 · S21`).
 *
 * Permite a compradores invitados (o titulares desde el enlace de su correo) consultar el
 * estado de su solicitud, leer las respuestas públicas del equipo y responder sin fricción.
 *
 * Privacidad y seguridad:
 *  - `robots: noindex, nofollow` + `referrer: no-referrer` para nunca filtrar `[token]`.
 *  - Solo expone el primer nombre y mensajes públicos (`isInternal: false`).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LifeBuoy, MessageCircle, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublicSupportThreadByToken } from "@/features/support/public-thread-service";
import { SUBJECT_LABELS, type SUPPORT_SUBJECTS } from "@/features/support/schemas";
import { CustomerTicketReplyForm } from "@/components/support/customer-ticket-reply-form";
import { formatDateTimeCO } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Seguimiento de solicitud de soporte",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Recibida y pendiente de respuesta",
  IN_PROGRESS: "En atención por nuestro equipo",
  CLOSED: "Resuelta",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  OPEN: "bg-amber-100 text-amber-900",
  IN_PROGRESS: "bg-brand-purple/15 text-brand-purple-dark",
  CLOSED: "bg-emerald-100 text-emerald-900",
};

function subjectLabel(subject: string): string {
  return SUBJECT_LABELS[subject as (typeof SUPPORT_SUBJECTS)[number]] ?? subject;
}

export default async function PublicSupportThreadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const thread = await getPublicSupportThreadByToken(token);
  if (!thread) notFound();

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-6 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-brand-purple/10 text-brand-purple inline-flex h-9 w-9 items-center justify-center rounded-full">
              <LifeBuoy className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-brand-purple-dark font-mono text-sm font-bold">
              Solicitud #{thread.shortId}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                STATUS_BADGE_CLASS[thread.status] ?? "bg-slate-100 text-slate-700"
              }`}
            >
              {STATUS_LABEL[thread.status] ?? thread.status}
            </span>
          </div>

          <h1 className="font-display text-brand-purple-dark text-2xl sm:text-3xl">
            Hola {thread.customerFirstName}, aquí está el hilo de tu solicitud
          </h1>
          <p className="text-brand-muted text-sm">
            Asunto:{" "}
            <strong className="text-brand-purple-dark">{subjectLabel(thread.subject)}</strong>
            {thread.orderNumber ? ` · Pedido indicado: ${thread.orderNumber}` : ""}
          </p>
        </header>

        <section className="border-brand-purple/15 space-y-4 rounded-2xl border bg-white p-5 shadow-xs sm:p-6">
          <div className="rounded-xl bg-[#FFF8F0] p-4">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-brand-purple-dark font-semibold">Tu mensaje inicial</span>
              <span className="text-brand-muted">{formatDateTimeCO(thread.createdAt)}</span>
            </div>
            <p className="text-brand-purple-dark/90 mt-2 text-sm whitespace-pre-wrap">
              {thread.message}
            </p>
          </div>

          {thread.messages.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-brand-purple-dark flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
                <MessageCircle className="h-3.5 w-3.5" />
                Conversación
              </h2>
              <ul className="space-y-2.5">
                {thread.messages.map((m) => {
                  const isAdmin = m.authorKind === "ADMIN";
                  return (
                    <li
                      key={m.id}
                      className={`rounded-xl border p-3.5 text-sm ${
                        isAdmin
                          ? "border-brand-purple/25 bg-brand-purple/5"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-brand-purple-dark font-semibold">
                          {isAdmin ? "Equipo Lucams Shop" : "Tú"}
                        </span>
                        <span className="text-brand-muted">{formatDateTimeCO(m.createdAt)}</span>
                      </div>
                      <p className="text-brand-purple-dark/90 mt-1.5 whitespace-pre-wrap">
                        {m.body}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <CustomerTicketReplyForm mode="guest" token={token} ticketStatus={thread.status} />
        </section>

        <footer className="text-brand-muted mt-6 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="text-brand-purple h-4 w-4" />
            Enlace privado de seguimiento. También te avisamos por correo cuando respondamos.
          </span>
          <Link
            href="/productos"
            className="text-brand-purple hover:text-brand-purple-dark font-semibold underline-offset-2 hover:underline"
          >
            Ir a la tienda →
          </Link>
        </footer>
      </main>
      <SiteFooter />
    </div>
  );
}
