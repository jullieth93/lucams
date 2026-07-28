"use client";

/*
 * <CookiesBanner> + <CookiesPreferencesModal>
 *
 * Banner bottom-fixed Ley 1581 que aparece la primera vez que un
 * visitante llega al sitio sin cookie `cookie_consent_v1`. Tres
 * acciones primarias:
 *  - "Solo necesarias"     → reject opcionales
 *  - "Personalizar"        → abre modal con 4 switches granulares
 *  - "Aceptar todas"       → opt-in completo
 *
 * Después de elegir:
 *  1. Set cookie client-side (efecto inmediato — analytics scripts
 *     pueden leerla en el mismo paint)
 *  2. Dispara evento custom "cookie-consent-changed"
 *  3. Fire-and-forget server action que registra Consent[] en DB
 *     (4 filas: necessary / functional / analytics / marketing)
 *
 * `<CookiesReopener>` es un trigger reusable (ej. footer + página
 * legal/cookies) que reabre el modal después de la primera vez.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Sparkles, Cookie } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { persistCookieConsentAction } from "@/features/consent/actions";
import {
  acceptAllPreferences,
  emptyPreferences,
  readClientCookiePreferences,
  rejectAllPreferences,
  writeClientCookiePreferences,
  type CookiePreferences,
} from "@/lib/cookie-consent";

const REOPEN_EVENT = "cookies-banner-reopen";

/** Trigger global para reabrir el modal de preferencias. */
export function openCookiesPreferences() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REOPEN_EVENT));
}

export function CookiesBanner() {
  const [show, setShow] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [prefs, setPrefs] = useState<CookiePreferences>(emptyPreferences());
  // El banner es para visitantes del STOREFRONT (Ley 1581); dentro de /admin solo
  // estorba (tapa acciones del panel en cada navegador nuevo). El modal de
  // preferencias sigue disponible desde el footer legal si alguien lo reabre allá.
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin") ?? false;

  // Detectar primera visita (sin cookie persistida)
  useEffect(() => {
    queueMicrotask(() => {
      const existing = readClientCookiePreferences();
      if (existing) {
        setPrefs(existing);
      } else {
        setShow(true);
      }
    });
  }, []);

  // Escuchar trigger global para reabrir desde otros componentes
  useEffect(() => {
    const handler = () => setModalOpen(true);
    window.addEventListener(REOPEN_EVENT, handler);
    return () => window.removeEventListener(REOPEN_EVENT, handler);
  }, []);

  function commit(next: CookiePreferences) {
    writeClientCookiePreferences(next);
    setPrefs(next);
    setShow(false);
    setModalOpen(false);
    // Audit DB fire-and-forget (no bloquea UX)
    void persistCookieConsentAction(next);
  }

  if (!show && !modalOpen) return null;
  if (isAdmin) return null;

  return (
    <>
      {show && (
        <div
          role="dialog"
          aria-labelledby="cookies-banner-title"
          className="border-brand-purple/15 fixed inset-x-0 bottom-0 z-[9000] border-t bg-white shadow-2xl"
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-8">
            <div className="flex-1">
              <h2
                id="cookies-banner-title"
                className="text-brand-purple-dark flex items-center gap-2 text-sm font-semibold"
              >
                <Cookie className="text-brand-purple h-4 w-4" />
                Cookies en Lucams_shop
              </h2>
              <p className="text-brand-purple-dark/75 mt-1 text-xs leading-relaxed">
                Usamos cookies necesarias para que el sitio funcione (autenticación, carrito) y
                cookies opcionales para mejorar tu experiencia. Tu decisión queda guardada según el{" "}
                <Link
                  href="/legal/privacidad"
                  className="text-brand-purple font-medium hover:underline"
                >
                  Aviso de Privacidad
                </Link>{" "}
                · Ley 1581 / SIC.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
              <button
                type="button"
                onClick={() => commit(rejectAllPreferences())}
                className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 rounded-full border bg-white px-4 py-2 text-xs font-semibold"
              >
                Solo necesarias
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="text-brand-purple-dark hover:text-brand-purple rounded-full px-4 py-2 text-xs font-semibold underline-offset-2 hover:underline"
              >
                Personalizar
              </button>
              <button
                type="button"
                onClick={() => commit(acceptAllPreferences())}
                className="bg-brand-purple hover:bg-brand-purple-dark rounded-full px-5 py-2 text-xs font-semibold text-white shadow-sm"
              >
                Aceptar todas
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg" showCloseButton={false}>
          <DialogHeader>
            <div className="mb-1 flex items-center justify-between">
              <DialogTitle className="font-display text-brand-purple-dark text-xl">
                Preferencias de cookies
              </DialogTitle>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Cerrar"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <DialogDescription className="text-brand-purple-dark/70 text-sm">
              Elige qué cookies quieres permitir. Las necesarias no se pueden desactivar porque
              hacen que el sitio funcione (login, carrito).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <PreferenceRow
              title="Necesarias"
              description="Autenticación, carrito, anti-fraude, balanceo de carga. Sin estas el sitio no funciona."
              checked={true}
              disabled
              onChange={() => {}}
            />
            <PreferenceRow
              title="Funcionales"
              description="Recordar preferencias (idioma, vista de catálogo) y mejorar la experiencia."
              checked={prefs.functional}
              onChange={(v) => setPrefs((p) => ({ ...p, functional: v }))}
            />
            <PreferenceRow
              title="Analíticas"
              description="Métricas anónimas de uso para entender qué funciona y qué no."
              checked={prefs.analytics}
              onChange={(v) => setPrefs((p) => ({ ...p, analytics: v }))}
            />
            <PreferenceRow
              title="Marketing"
              description="Recomendaciones personalizadas y campañas relevantes."
              checked={prefs.marketing}
              onChange={(v) => setPrefs((p) => ({ ...p, marketing: v }))}
            />
          </div>

          <div className="border-brand-purple/10 mt-2 flex flex-wrap justify-end gap-2 border-t pt-4">
            <button
              type="button"
              onClick={() => commit(rejectAllPreferences())}
              className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 rounded-full border bg-white px-4 py-2 text-xs font-semibold"
            >
              Solo necesarias
            </button>
            <button
              type="button"
              onClick={() => commit({ ...prefs, savedAt: new Date().toISOString() })}
              className="bg-brand-purple hover:bg-brand-purple-dark inline-flex items-center gap-1 rounded-full px-5 py-2 text-xs font-semibold text-white shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Guardar mis preferencias
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PreferenceRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={
        "border-brand-purple/10 flex items-start gap-3 rounded-lg border p-3 transition " +
        (disabled ? "bg-slate-50" : "bg-white hover:bg-slate-50")
      }
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="border-brand-purple/30 text-brand-purple focus:ring-brand-purple/30 mt-0.5 h-4 w-4 rounded disabled:opacity-50"
      />
      <div className="flex-1">
        <div className="text-brand-purple-dark text-sm font-semibold">
          {title}
          {disabled && (
            <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
              Siempre activas
            </span>
          )}
        </div>
        <p className="text-brand-muted text-xs leading-snug">{description}</p>
      </div>
    </label>
  );
}

/**
 * <CookiesReopenLink> — text button reusable para reabrir el modal
 * desde footer o página /legal/cookies.
 */
export function CookiesReopenLink({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={openCookiesPreferences}
      className="text-brand-purple-dark hover:text-brand-purple font-semibold underline-offset-2 hover:underline"
    >
      {children}
    </button>
  );
}
