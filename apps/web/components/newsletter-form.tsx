/*
 * <NewsletterForm /> — formulario de suscripción al newsletter.
 *
 * Single opt-in con checkbox de consentimiento Ley 1581. Toast sonner
 * al enviar (success/error). useActionState para pending state +
 * mensajes server-side.
 *
 * Turnstile PEREZOSO (2026-10-01, perf): este form vive en el footer de TODA
 * página pública y antes montaba el challenge de Cloudflare (script
 * afterInteractive + iframe, ~120KB+ y CPU de terceros) siempre. Ahora el
 * challenge se monta solo cuando el form entra en viewport (IntersectionObserver)
 * o al primer focus del campo email — lo que ocurra primero. Si el usuario
 * envía antes de que el challenge resuelva, el submit se BLOQUEA en cliente,
 * se espera el token y se reenvía solo (requestSubmit) — nunca sale un submit
 * sin token (el server lo rechazaría con "Validación anti-bot falló").
 * Sin site key (dev) no hay gate: el server permite token vacío fuera de prod.
 */

"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
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

  // ── Turnstile perezoso ──
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [challengeActive, setChallengeActive] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  // El challenge reportó expirado/error (onTokenChange(null)) → el próximo
  // submit bloqueado re-monta el reto (refreshKey) en vez de esperar en vano.
  const [challengeFailed, setChallengeFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const pendingSubmitRef = useRef(false);
  const [waitingChallenge, setWaitingChallenge] = useState(false);
  // Token GASTADO por una suscripción exitosa (Turnstile es de un solo uso: el
  // server lo valida y consume — re-suscribirse con el mismo token falla).
  // Ref, no state: lo escribe el effect de éxito y lo lee el gate del submit;
  // handleChallengeToken lo limpia cuando llega un reto nuevo.
  const tokenSpentRef = useRef(false);

  // Activación al entrar en viewport (una sola vez). El focus del email se
  // maneja con onFocusCapture del form (ocurre antes que cualquier submit).
  // Sin IntersectionObserver (navegador muy viejo / jsdom) no hay observer: el
  // focus y el propio submit (handleSubmit) activan el challenge igual.
  useEffect(() => {
    if (!siteKey || challengeActive) return;
    const form = formRef.current;
    if (!form || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setChallengeActive(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" }, // pre-cargar ANTES de que el widget sea visible
    );
    io.observe(form);
    return () => io.disconnect();
  }, [siteKey, challengeActive]);

  // Token recibido con un submit bloqueado esperando → reenviar el form.
  useEffect(() => {
    if (token && pendingSubmitRef.current) {
      pendingSubmitRef.current = false;
      setWaitingChallenge(false);
      formRef.current?.requestSubmit();
    }
  }, [token]);

  useEffect(() => {
    if (state?.ok) {
      tokenSpentRef.current = true;
      toast.success(state.message ?? "¡Listo!");
      formRef.current?.reset();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  function handleChallengeToken(t: string | null) {
    tokenSpentRef.current = false; // reto nuevo: el token anterior ya no importa
    setToken(t);
    setChallengeFailed(t === null);
    if (t === null && pendingSubmitRef.current) {
      // El reto falló/expiró mientras un submit esperaba: soltar el botón; el
      // próximo intento fuerza un reto nuevo (refreshKey en handleSubmit).
      pendingSubmitRef.current = false;
      setWaitingChallenge(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!siteKey) return; // dev sin keys: pasa directo
    // Token válido = resuelto y NO gastado por una suscripción previa.
    if (token !== null && !tokenSpentRef.current) return;
    e.preventDefault();
    pendingSubmitRef.current = true;
    setWaitingChallenge(true);
    if (!challengeActive) {
      // El challenge ni siquiera estaba montado (submit sin focus previo): montarlo ya.
      setChallengeActive(true);
      return;
    }
    // Montado pero sin token utilizable: si falló/expiró, o si el token quedó
    // gastado (re-suscripción), hay que re-montar el reto; si aún está
    // resolviendo, basta esperar — handleChallengeToken dispara el reenvío.
    if (challengeFailed || token !== null) {
      setChallengeFailed(false);
      setToken(null);
      setRefreshKey((k) => k + 1);
    }
  }

  const busy = pending || waitingChallenge;

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={handleSubmit}
      onFocusCapture={() => setChallengeActive(true)}
      className="w-full"
    >
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
          disabled={busy}
          className="text-brand-purple-dark bg-white"
        />
        <Button
          type="submit"
          disabled={busy}
          className="bg-brand-purple hover:bg-brand-purple-dark text-white"
        >
          {busy ? "Enviando..." : "Suscribirme"}
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
          disabled={busy}
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
        {/* Montaje perezoso: hasta que el form se ve o recibe foco, solo va el
            input hidden (misma forma que el modo dev sin site key — el gate de
            handleSubmit impide que salga un submit real sin token en prod). */}
        {challengeActive ? (
          <TurnstileWidget
            size="compact"
            theme={isDark ? "dark" : "light"}
            onTokenChange={handleChallengeToken}
            refreshKey={refreshKey}
          />
        ) : (
          <input type="hidden" name="cf-turnstile-response" value="" />
        )}
      </div>
    </form>
  );
}
