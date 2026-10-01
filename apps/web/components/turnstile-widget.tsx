"use client";

/*
 * <TurnstileWidget> — wrapper minimal del widget Cloudflare Turnstile.
 *
 * Sin dependencias externas: carga el script oficial y monta el widget
 * con `window.turnstile.render`. El token generado se pone en un input
 * hidden `cf-turnstile-response` que el server action lee de FormData.
 *
 * Si NEXT_PUBLIC_TURNSTILE_SITE_KEY no está seteado, renderea un input
 * hidden vacío (modo dev). El server `verifyTurnstileToken` lo permite
 * en development.
 *
 * Props opcionales (consumidores actuales no las pasan — comportamiento
 * idéntico al de siempre):
 *   - onTokenChange(token|null): espejo de los callbacks del challenge
 *     (éxito → token; expirado/error → null). Lo usa el form del newsletter
 *     para montar el challenge PEREZOSO y bloquear el submit hasta tener
 *     token (2026-10-01, perf: el script + iframe de Cloudflare ya no se
 *     cargan en toda página pública solo por tener el footer en viewport).
 *   - refreshKey: al cambiar, desmonta y re-monta el challenge (token
 *     gastado/expirado → reto nuevo).
 */

import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "auto" | "light" | "dark";
          size?: "normal" | "compact" | "flexible" | "invisible";
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export function TurnstileWidget({
  size = "flexible",
  theme = "light",
  onTokenChange,
  refreshKey = 0,
}: {
  size?: "normal" | "compact" | "flexible" | "invisible";
  theme?: "auto" | "light" | "dark";
  onTokenChange?: (token: string | null) => void;
  refreshKey?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Ref para el callback: si entrara en las deps del effect de montaje, un inline
  // arrow del caller re-montaría el challenge en cada render del form (reto +
  // token nuevos). Se actualiza en effect (nunca durante el render).
  const onTokenChangeRef = useRef(onTokenChange);
  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    let cancelled = false;
    const tryRender = () => {
      if (cancelled) return;
      if (window.turnstile && containerRef.current) {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          size,
          callback: (token) => onTokenChangeRef.current?.(token),
          "expired-callback": () => onTokenChangeRef.current?.(null),
          "error-callback": () => onTokenChangeRef.current?.(null),
        });
      } else {
        // El script aún no cargó — reintentamos
        setTimeout(tryRender, 200);
      }
    };
    tryRender();

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget ya removido */
        }
      }
    };
  }, [siteKey, size, theme, refreshKey]);

  if (!siteKey) {
    // Dev sin keys: input vacío para satisfacer la lectura del server
    // action sin bloquear formularios.
    return <input type="hidden" name="cf-turnstile-response" value="" />;
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        async
        defer
      />
      {/*
       * NO usar className="cf-turnstile" — Cloudflare auto-detecta esa
       * clase y dispara render automático ANTES de que nuestro useEffect
       * corra window.turnstile.render() con la sitekey. Sin sitekey en
       * data-attr el auto-render falla con:
       *   "Invalid or missing type for parameter sitekey, expected string"
       * Bug observado en logs 2026-05-12 (M.0 hotfix).
       */}
      <div ref={containerRef} className="lucams-turnstile-host" />
    </>
  );
}
