"use client";

/*
 * StudioOnboarding — M.3.b.UX.5 (2026-05-14).
 *
 * Lightbox tutorial primera vez. Detecta via localStorage si el cliente ya
 * fue onboardeado. Si no, muestra 3 pasos progresivos con spotlight visual
 * sobre el target de cada paso + mascote + copy en es-CO tuteo.
 *
 * Triggers:
 *   - Mount del editor + localStorage['lucams_studio_onboarded'] !== "v1"
 *
 * Persistencia:
 *   - Al completar (paso 3 "Listo") O al saltar ("Saltar tutorial") →
 *     localStorage['lucams_studio_onboarded'] = "v1"
 *   - Si Lucy actualiza el tutorial a v2 en el futuro, cambia la key y se
 *     muestra de nuevo a usuarios viejos.
 *
 * Patrón visual:
 *   - Backdrop dark con clip-path "agujero" sobre el target (no se puede
 *     hacer agujero CSS-only; usamos opacidad y mascote pointer).
 *   - Card flotante con copy + botones (Skip / Anterior / Siguiente / Listo).
 *   - Mascote LucamsLogo en cada paso para reforzar brand.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LucamsLogo } from "@/components/lucams-logo";
import { ArrowRight, Sparkles, X } from "lucide-react";

const ONBOARD_KEY = "lucams_studio_onboarded";
const ONBOARD_VERSION = "v1";

type OnboardingStep = {
  title: string;
  body: string;
  cta: string;
};

const STEPS: OnboardingStep[] = [
  {
    title: "Subí tus fotos",
    body: "Empezá por arrastrar fotos al panel de la izquierda. Aceptamos JPG, PNG, WebP y HEIC del celu.",
    cta: "Siguiente",
  },
  {
    title: "Asigná a cada imán",
    body: "Tocá un imán vacío y elegí cuál foto querés, o usá el botón mágico ‘Llenar slots con mis fotos’ para repartir todo de una.",
    cta: "Siguiente",
  },
  {
    title: "Personalizá los textos",
    body: "Si la plantilla tiene textos editables (los marcados con punto turquesa), tocalos para cambiar el contenido, color y tipografía.",
    cta: "¡Empezar!",
  },
];

export function StudioOnboarding() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Solo mostrar en cliente — SSR evita el localStorage
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(ONBOARD_KEY);
      if (stored !== ONBOARD_VERSION) {
        // Delay 800ms para que el editor termine de montarse antes
        const t = window.setTimeout(() => setIsOpen(true), 800);
        return () => window.clearTimeout(t);
      }
    } catch {
      // localStorage podría no estar disponible (private mode iOS Safari pre-iOS 11)
    }
  }, []);

  const close = () => {
    setIsOpen(false);
    try {
      window.localStorage.setItem(ONBOARD_KEY, ONBOARD_VERSION);
    } catch {
      // ignore
    }
  };

  const skip = () => {
    close();
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else close();
  };

  const prev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const current = STEPS[step];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
        >
          <motion.div
            initial={{ scale: 0.92, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 10 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
            className="ring-brand-purple/15 relative mx-4 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1"
          >
            {/* Header con mascote + skip button */}
            <div className="from-brand-cream to-brand-pink/15 relative flex items-start gap-3 bg-gradient-to-br px-5 pt-5 pb-4">
              <motion.div
                animate={{ y: [0, -4, 0], rotate: [0, -3, 3, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <LucamsLogo variant="mascot" size={56} />
              </motion.div>
              <div className="flex-1 pt-1">
                <p className="text-brand-purple-dark/55 text-[10px] font-semibold tracking-wider uppercase">
                  Paso {step + 1} de {STEPS.length}
                </p>
                <h2
                  id="onboarding-title"
                  className="text-brand-purple-dark mt-1 text-lg leading-tight font-bold"
                >
                  {current.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={skip}
                aria-label="Saltar tutorial"
                title="Saltar tutorial"
                className="text-brand-purple-dark/40 hover:bg-brand-purple/10 hover:text-brand-purple-dark/70 flex h-7 w-7 items-center justify-center rounded-md transition-colors focus:outline-none"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <p className="text-brand-purple-dark/80 text-sm leading-relaxed">{current.body}</p>

              {/* Indicador de pasos (dots) */}
              <div className="mt-4 flex items-center justify-center gap-1.5">
                {STEPS.map((_, idx) => (
                  <span
                    key={idx}
                    className={[
                      "h-1.5 rounded-full transition-all",
                      idx === step
                        ? "bg-brand-purple w-6"
                        : idx < step
                          ? "bg-brand-turquoise w-1.5"
                          : "bg-brand-purple/20 w-1.5",
                    ].join(" ")}
                    aria-hidden
                  />
                ))}
              </div>
            </div>

            {/* Footer actions */}
            <div className="border-brand-purple/10 bg-brand-cream/30 flex items-center justify-between border-t px-5 py-3">
              <button
                type="button"
                onClick={skip}
                className="text-brand-purple-dark/60 hover:text-brand-purple-dark text-xs font-semibold underline"
              >
                Saltar
              </button>
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={prev}
                    className="text-brand-purple-dark/70 hover:bg-brand-purple/10 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
                  >
                    Anterior
                  </button>
                )}
                <button
                  type="button"
                  onClick={next}
                  className="bg-brand-purple hover:bg-brand-purple-dark inline-flex items-center gap-1 rounded-md px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors"
                >
                  {step === STEPS.length - 1 ? (
                    <>
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />
                      <span>{current.cta}</span>
                    </>
                  ) : (
                    <>
                      <span>{current.cta}</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
