"use client";

/*
 * <ContactForm> — form de /contacto con useActionState.
 * Validadores estandarizados Colombia (nombre máx 5 palabras + capitalización,
 * EmailInput con sugerencia de dominios y corrección de typos en 1 clic,
 * autorización expresa Ley 1581 y estado controlado para no perder lo escrito).
 */

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmailInput } from "@/components/email-input";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { capitalizeName, personNameError } from "@/lib/colombia-validators";
import { submitContactAction } from "@/features/support/actions";
import {
  SUBJECT_LABELS,
  SUPPORT_SUBJECTS,
  ORDER_RELATED_SUBJECTS,
  type SupportSubject,
} from "@/features/support/schemas";

export function ContactForm({
  successNote = "Te respondemos a tu email en menos de 24h hábiles. Tu ticket es",
}: {
  /** Texto del panel de éxito, resuelto en el server desde el CMS
   *  (`support.contacto.success-note`) — el client no lee el CMS. */
  successNote?: string;
}) {
  const [state, formAction, pending] = useActionState(submitContactAction, null);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState<SupportSubject>("CONSULTA_PRODUCTO");
  const [orderNumber, setOrderNumber] = useState("");
  const [message, setMessage] = useState("");
  const [dataConsent, setDataConsent] = useState(false);
  const asksOrderNumber = ORDER_RELATED_SUBJECTS.includes(subject);

  useEffect(() => {
    if (state?.ok) {
      toast.success("¡Mensaje enviado! Te respondemos en menos de 24h hábiles ✨");
    } else if (state && !state.ok && state.error) {
      toast.error(state.error);
    }
  }, [state]);

  if (state?.ok) {
    return (
      <div className="border-brand-purple/15 from-brand-turquoise/10 to-brand-pink/10 rounded-2xl border bg-gradient-to-br p-6 text-center">
        <div className="text-brand-purple-dark text-4xl">✨</div>
        <h3 className="font-display text-brand-purple-dark mt-2 text-xl">
          ¡Listo! Recibimos tu mensaje
        </h3>
        <p className="text-brand-purple-dark/70 mt-2 text-sm">
          {successNote}{" "}
          <span className="font-mono text-xs">{state.ticketId.slice(0, 8).toUpperCase()}</span>.
        </p>
        {state.threadPath && (
          <div className="mt-4">
            <Link
              href={state.threadPath}
              className="bg-brand-purple hover:bg-brand-purple-dark inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors"
            >
              Seguir y responder mi solicitud →
            </Link>
          </div>
        )}
        <p className="text-brand-muted mt-3 text-xs">Si es urgente, escríbenos por WhatsApp.</p>
      </div>
    );
  }

  const nameErr =
    (nameTouched ? personNameError(name, 5) : null) ??
    (state && !state.ok ? state.fieldErrors?.name?.[0] : null);
  const emailErr = state && !state.ok ? state.fieldErrors?.email?.[0] : null;
  const consentErr = state && !state.ok ? state.fieldErrors?.dataConsent?.[0] : null;

  return (
    <form action={formAction} className="space-y-4">
      {state && !state.ok && state.error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="contact-name" className="text-brand-purple-dark/80 text-sm">
          Tu nombre completo *
        </Label>
        <Input
          id="contact-name"
          name="name"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          placeholder="Lucía Rodríguez"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim()) setName(capitalizeName(name));
            setNameTouched(true);
          }}
          aria-invalid={Boolean(nameErr)}
          aria-describedby={nameErr ? "contact-name-error" : undefined}
          className="border-brand-purple/20 focus-visible:ring-brand-purple/30 bg-white"
        />
        {nameErr ? (
          <p id="contact-name-error" className="text-xs text-red-700">
            {nameErr}
          </p>
        ) : (
          <p className="text-brand-muted text-[11px]">Solo letras, máximo 5 palabras.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact-email" className="text-brand-purple-dark/80 text-sm">
          Correo electrónico *
        </Label>
        <EmailInput
          id="contact-email"
          name="email"
          required
          maxLength={200}
          autoComplete="email"
          placeholder="lucia@ejemplo.com"
          value={email}
          onValueChange={setEmail}
          aria-invalid={Boolean(emailErr)}
          aria-describedby={emailErr ? "contact-email-error" : undefined}
          className="border-brand-purple/20 focus-visible:ring-brand-purple/30 bg-white"
        />
        {emailErr && (
          <p id="contact-email-error" className="text-xs text-red-700">
            {emailErr}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact-subject" className="text-brand-purple-dark/80 text-sm">
          Asunto *
        </Label>
        <select
          id="contact-subject"
          name="subject"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value as SupportSubject)}
          className="border-brand-purple/20 focus:ring-brand-purple/30 h-10 w-full rounded-md border bg-white px-3 text-sm focus:ring-2 focus:outline-none"
        >
          {SUPPORT_SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {SUBJECT_LABELS[s]}
            </option>
          ))}
        </select>
        {state && !state.ok && state.fieldErrors?.subject && (
          <p className="text-xs text-red-700">{state.fieldErrors.subject[0]}</p>
        )}
      </div>

      {asksOrderNumber && (
        <div className="space-y-1.5">
          <Label htmlFor="contact-order-number" className="text-brand-purple-dark/80 text-sm">
            Número de pedido <span className="text-brand-muted font-normal">(opcional)</span>
          </Label>
          <Input
            id="contact-order-number"
            name="orderNumber"
            maxLength={20}
            inputMode="text"
            autoComplete="off"
            placeholder="LCM-2026-0001"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 bg-white"
          />
          <p className="text-brand-muted text-xs">
            Lo encuentras en el correo de confirmación de tu compra.
          </p>
          {state && !state.ok && state.fieldErrors?.orderNumber && (
            <p className="text-xs text-red-700">{state.fieldErrors.orderNumber[0]}</p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="contact-message" className="text-brand-purple-dark/80 text-sm">
          Mensaje *
        </Label>
        <Textarea
          id="contact-message"
          name="message"
          required
          minLength={10}
          maxLength={4000}
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Cuéntanos en qué te podemos ayudar..."
          className="border-brand-purple/20 focus-visible:ring-brand-purple/30 resize-y bg-white"
        />
        {state && !state.ok && state.fieldErrors?.message && (
          <p className="text-xs text-red-700">{state.fieldErrors.message[0]}</p>
        )}
      </div>

      <div className="border-brand-purple/15 rounded-xl border bg-[#FFF8F0]/70 p-3.5">
        <label className="flex cursor-pointer items-start gap-2.5 text-xs">
          <input
            type="checkbox"
            name="dataConsent"
            required
            checked={dataConsent}
            onChange={(e) => setDataConsent(e.target.checked)}
            aria-invalid={Boolean(consentErr)}
            className="accent-brand-purple mt-0.5 h-4 w-4 shrink-0 rounded"
          />
          <span className="text-brand-purple-dark/90">
            Autorizo el tratamiento de mis datos personales para atender esta solicitud conforme al{" "}
            <Link
              href="/legal/privacidad"
              target="_blank"
              className="text-brand-purple-dark hover:text-brand-purple font-semibold underline underline-offset-2"
            >
              Aviso de Privacidad
            </Link>{" "}
            (Ley 1581 de 2012). *
          </span>
        </label>
        {consentErr && <p className="mt-1.5 text-xs text-red-700">{consentErr}</p>}
      </div>

      <div className="pt-1">
        <TurnstileWidget size="flexible" />
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="bg-brand-purple hover:bg-brand-purple-dark w-full text-white"
        size="lg"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enviando...
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Enviar mensaje
          </>
        )}
      </Button>
    </form>
  );
}
