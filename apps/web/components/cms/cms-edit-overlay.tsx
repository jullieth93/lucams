"use client";

/*
 * <CmsEditOverlay> — overlay del modo edición in-place (roadmap C1 paso 2).
 *
 * Lo monta el root layout cuando la cookie lucams_cms_edit está activa (solo
 * la puede sembrar un admin desde /admin/contenido). Dos piezas:
 *
 *  1. Banner fijo ARRIBA (no abajo: el banner de consentimiento de cookies es
 *     fixed bottom con z-[9000] y taparía el overlay; arriba no compite con
 *     nada — el header sticky del sitio queda debajo mientras dura el modo)
 *     y ofrece «Salir» (borra la cookie y devuelve a la misma página).
 *  2. Click delegation en fase de captura: cualquier click sobre un
 *     [data-cms-key] (lo anotan <CmsText>/<CmsMarkdown> en este modo) abre el
 *     editor de ese campo vía la puerta /admin/contenido/campos/por-key/[key].
 *     Captura + preventDefault: en modo edición los CTAs se EDITAN, no se
 *     navegan. El hover punteado lo pone el CSS (html.cms-edit-mode).
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";

export function CmsEditOverlay() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    document.documentElement.classList.add("cms-edit-mode");
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-cms-key]");
      const key = el?.getAttribute("data-cms-key");
      if (!key) return;
      e.preventDefault();
      e.stopPropagation();
      router.push(`/admin/contenido/campos/por-key/${encodeURIComponent(key)}`);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.documentElement.classList.remove("cms-edit-mode");
      document.removeEventListener("click", onClick, true);
    };
  }, [router]);

  // Dentro del panel el overlay estorba (y no hay [data-cms-key] que editar).
  if (pathname.startsWith("/admin")) return null;

  return (
    <div className="bg-brand-purple-dark fixed inset-x-0 top-0 z-[9500] flex items-center justify-center gap-3 px-4 py-2.5 text-sm text-white shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
      <Pencil className="h-4 w-4 flex-shrink-0" />
      <span className="min-w-0 truncate">
        Modo edición: haz clic en un texto del sitio para abrir su editor en el CMS.
      </span>
      {/* Salir por form MPA (POST → route handler → 303 → carga completa):
          una Server Action + redirect() dejaba el Router Cache del cliente
          con la versión anotada de la página (bug de la verificación E2E). */}
      <form method="POST" action="/api/admin/cms/edit-mode" className="flex-shrink-0">
        <input type="hidden" name="op" value="disable" />
        <input type="hidden" name="next" value={pathname} />
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-white/25"
        >
          <X className="h-3.5 w-3.5" />
          Salir
        </button>
      </form>
    </div>
  );
}
