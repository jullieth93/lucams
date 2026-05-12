/*
 * <NewsletterForm /> — formulario de suscripción al newsletter.
 *
 * Single opt-in con checkbox de consentimiento Ley 1581. Toast sonner
 * al enviar (success/error). useActionState para pending state +
 * mensajes server-side.
 */

"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribeNewsletterAction, type NewsletterFormState } from "@/features/newsletter/actions";

export function NewsletterForm({ compact = false }: { compact?: boolean }) {
  const emailId = useId();
  const consentId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<NewsletterFormState | null, FormData>(
    subscribeNewsletterAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "¡Listo!");
      formRef.current?.reset();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="w-full">
      <div className={"flex w-full gap-2 " + (compact ? "flex-row" : "flex-col sm:flex-row")}>
        <label htmlFor={emailId} className="sr-only">
          Email
        </label>
        <Input
          id={emailId}
          name="email"
          type="email"
          required
          placeholder="tu-email@ejemplo.com"
          disabled={pending}
          className="bg-white"
        />
        <Button
          type="submit"
          disabled={pending}
          className="bg-brand-purple hover:bg-brand-purple-dark text-white"
        >
          {pending ? "Enviando..." : "Suscribirme"}
        </Button>
      </div>
      <label
        htmlFor={consentId}
        className="text-brand-purple-dark/70 mt-2 flex items-start gap-2 text-xs"
      >
        <input
          id={consentId}
          name="consent"
          type="checkbox"
          required
          disabled={pending}
          className="text-brand-purple focus:ring-brand-purple/30 border-brand-purple/40 mt-0.5 h-3.5 w-3.5 rounded"
        />
        <span>
          Acepto recibir comunicaciones de Lucams_shop. Podré dar de baja cuando quiera. Ver{" "}
          <a
            href="/legal/privacidad"
            className="text-brand-purple underline-offset-2 hover:underline"
            target="_blank"
            rel="noopener"
          >
            Aviso de Privacidad
          </a>{" "}
          (Ley 1581).
        </span>
      </label>
    </form>
  );
}
