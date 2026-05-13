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
}: {
  size?: "normal" | "compact" | "flexible" | "invisible";
  theme?: "auto" | "light" | "dark";
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
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
  }, [siteKey, size, theme]);

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
      <div ref={containerRef} className="cf-turnstile" />
    </>
  );
}
