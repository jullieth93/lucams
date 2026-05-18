"use client";

/*
 * <RouteToasts> — convierte ?added=1 / ?error=... / ?success=... en
 * toasts sonner y limpia el query string del URL.
 *
 * Mount global en app/layout.tsx una sola vez. Lee searchParams en
 * cada navegación y dispara los toasts correspondientes.
 *
 * Mapping:
 *  - ?added=1            → toast.success "Agregado al carrito ✨"
 *  - ?subscribed=1       → toast.success "¡Suscrito al newsletter!"
 *  - ?success=<key>      → diccionario de claves → mensajes
 *  - ?error=<mensaje>    → toast.error con el mensaje URL-decoded
 *
 * Después de disparar el toast, replace() limpia el query string para
 * que un refresh no vuelva a mostrarlo.
 */

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

function showSuccess(conf: { msg: string; href?: string; cta?: string }) {
  if (conf.href && conf.cta) {
    toast.success(conf.msg, {
      action: {
        label: conf.cta,
        onClick: () => {
          window.location.href = conf.href!;
        },
      },
    });
  } else {
    toast.success(conf.msg);
  }
}

const SUCCESS_MESSAGES: Record<string, { msg: string; href?: string; cta?: string }> = {
  added: {
    msg: "✨ Agregado al carrito",
    href: "/carrito",
    cta: "Ver carrito",
  },
  personalized: { msg: "💜 Tu diseño está listo y agregado al carrito" },
  removed: { msg: "Producto removido del carrito." },
  subscribed: { msg: "¡Suscrito al newsletter! Te avisamos del lanzamiento ✨" },
  saved: { msg: "Guardado ✓" },
  published: { msg: "Publicado ✨ Cambio visible en el sitio." },
  "link-invalido": { msg: "El link ya no es válido. Pide uno nuevo." },
  "link-expirado": { msg: "El link expiró. Pide uno nuevo." },
};

export function RouteToasts() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handled: string[] = [];

    // success message via specific key (?subscribed=1)
    for (const key of Object.keys(SUCCESS_MESSAGES)) {
      if (sp.get(key) === "1") {
        showSuccess(SUCCESS_MESSAGES[key]);
        handled.push(key);
      }
    }

    // ?success=<key> (más flexible)
    const successKey = sp.get("success");
    if (successKey && SUCCESS_MESSAGES[successKey]) {
      showSuccess(SUCCESS_MESSAGES[successKey]);
      handled.push("success");
    }

    // ?error=<mensaje>
    const error = sp.get("error");
    if (error) {
      // Si matchea un key conocido, usar mensaje pretty; sino mostrar raw
      const conf = SUCCESS_MESSAGES[error];
      toast.error(conf ? conf.msg : decodeURIComponent(error));
      handled.push("error");
    }

    if (handled.length === 0) return;

    // Limpiar query string preservando el resto de params
    const params = new URLSearchParams(sp.toString());
    for (const k of handled) params.delete(k);
    const qs = params.toString();
    queueMicrotask(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.toString()]);

  return null;
}
