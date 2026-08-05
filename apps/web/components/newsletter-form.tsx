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
import { TurnstileWidget } from "@/components/turnstile-widget";
import { subscribeNewsletterAction, type NewsletterFormState } from "@/features/newsletter/actions";

export function NewsletterForm({
  compact = false,
  variant = "light",
}: {
  compact?: boolean;
  variant?: "light" | "dark";
}) {
  const isDark = variant === "dark";
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
        className={
          "mt-2 flex items-start gap-2 text-xs " +
          (isDark ? "text-white/80" : "text-brand-purple-dark/70")
        }
      >
        <input
          id={consentId}
          name="consent"
          type="checkbox"
          required
          disabled={pending}
          className={
            "mt-0.5 h-3.5 w-3.5 rounded " +
            (isDark
              ? "text-brand-pink border-white/40 bg-white/10 focus:ring-white/30"
              : "text-brand-purple focus:ring-brand-purple/30 border-brand-purple/40")
          }
        />
        <span>
          Acepto recibir comunicaciones de Lucams_shop. Podré dar de baja cuando quiera (Ley 1581).
        </span>
      </label>
      {/* El enlace va FUERA del label del checkbox: dentro, clicarlo también
          alternaba el consentimiento (y no debe). */}
      <p className={"mt-1 text-xs " + (isDark ? "text-white/80" : "text-brand-purple-dark/70")}>
        Ver{" "}
        <a
          href="/legal/privacidad"
          className={
            "underline-offset-2 hover:underline " +
            (isDark ? "text-brand-coral hover:text-white" : "text-brand-purple")
          }
          target="_blank"
          rel="noopener"
        >
          Aviso de Privacidad
        </a>
        .
      </p>
      <div className="mt-2">
        <TurnstileWidget size="compact" theme={isDark ? "dark" : "light"} />
      </div>
    </form>
  );
}
