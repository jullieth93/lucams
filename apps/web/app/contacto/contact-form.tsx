"use client";

/*
 * <ContactForm> — form de /contacto con useActionState.
 * Validación cliente mínima (HTML5 + required) + Zod server-side.
 * Toast sonner al success/error.
 */

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { submitContactAction } from "@/features/support/actions";
import { SUBJECT_LABELS, SUPPORT_SUBJECTS } from "@/features/support/schemas";

export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitContactAction, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success("¡Mensaje enviado! Te respondemos en menos de 24h ✨");
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
          Te respondemos a tu email en menos de 24h. Tu ticket es{" "}
          <span className="font-mono text-xs">{state.ticketId.slice(0, 8).toUpperCase()}</span>.
        </p>
        <p className="text-brand-purple-dark/60 mt-3 text-xs">
          Si es urgente, escríbenos por WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="contact-name" className="text-brand-purple-dark/80 text-sm">
          Tu nombre
        </Label>
        <Input
          id="contact-name"
          name="name"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          placeholder="Lucía Rodríguez"
          className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
        />
        {state?.fieldErrors?.name && (
          <p className="text-xs text-red-700">{state.fieldErrors.name[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact-email" className="text-brand-purple-dark/80 text-sm">
          Email
        </Label>
        <Input
          id="contact-email"
          name="email"
          type="email"
          required
          maxLength={200}
          autoComplete="email"
          placeholder="lucia@ejemplo.com"
          className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
        />
        {state?.fieldErrors?.email && (
          <p className="text-xs text-red-700">{state.fieldErrors.email[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact-subject" className="text-brand-purple-dark/80 text-sm">
          Asunto
        </Label>
        <select
          id="contact-subject"
          name="subject"
          required
          defaultValue="CONSULTA_PRODUCTO"
          className="border-brand-purple/20 focus:ring-brand-purple/30 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        >
          {SUPPORT_SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {SUBJECT_LABELS[s]}
            </option>
          ))}
        </select>
        {state?.fieldErrors?.subject && (
          <p className="text-xs text-red-700">{state.fieldErrors.subject[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact-message" className="text-brand-purple-dark/80 text-sm">
          Mensaje
        </Label>
        <Textarea
          id="contact-message"
          name="message"
          required
          minLength={10}
          maxLength={4000}
          rows={6}
          placeholder="Contanos en qué te podemos ayudar..."
          className="border-brand-purple/20 focus-visible:ring-brand-purple/30 resize-y"
        />
        {state?.fieldErrors?.message && (
          <p className="text-xs text-red-700">{state.fieldErrors.message[0]}</p>
        )}
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

      <p className="text-brand-purple-dark/50 text-center text-xs">
        Tu información se trata según el{" "}
        <a href="/legal/privacidad" className="text-brand-purple hover:underline">
          Aviso de Privacidad
        </a>
        . Sin spam.
      </p>
    </form>
  );
}
