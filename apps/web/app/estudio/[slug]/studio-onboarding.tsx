"use client";

/*
 * StudioOnboarding — M.3.b.UX.5 (2026-05-14); tour POR PRODUCTO (Fase 2 · item
 * 2.8, 2026-10-07).
 *
 * Lightbox tutorial primera vez. Detecta via localStorage si el cliente ya fue
 * onboardeado EN ESTA SUPERFICIE. Si no, muestra los 3 pasos genéricos + las
 * FEATURES del lienzo del producto actual (config declarativa en
 * lib/studio-tour.ts — p.ej. Polaroid IG: foto de perfil, textos del post,
 * marco; Calendario: sets, año/letra; Separadores: caras A/B y respaldo en
 * blanco) con spotlight visual sobre el target de cada paso + mascote + copy
 * en es-CO tuteo.
 *
 * Triggers:
 *   - Mount del editor + localStorage['lucams_studio_onboarded_<surface>'] !== "v1"
 *
 * Persistencia (item 2.8 — ANTES una sola clave global
 * 'lucams_studio_onboarded': quien veía el tutorial de los fotoimanes no
 * aprendía las funciones del lienzo del calendario):
 *   - Al completar (último paso "Listo") O al saltar ("Saltar tutorial") →
 *     localStorage['lucams_studio_onboarded_<surface>'] = "v1"
 *   - La clave global vieja queda sin uso (convive; no se borra): los usuarios
 *     previos ven UNA vez el tour de cada superficie — la intención del item.
 *   - Si Lucy actualiza el tutorial a v2 en el futuro, cambia la key y se
 *     muestra de nuevo a usuarios viejos.
 *
 * Patrón visual:
 *   - Backdrop dark con clip-path "agujero" sobre el target (no se puede
 *     hacer agujero CSS-only; usamos opacidad y mascote pointer).
 *   - Card flotante con copy + botones (Skip / Anterior / Siguiente / Listo).
 *   - Mascote LucamsLogo en cada paso para reforzar brand.
 *   - Las features del producto llevan un ICONO junto al título (mapa lucide
 *     por clave declarativa del tour).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LucamsLogo } from "@/components/lucams-logo";
import { Hint } from "@/components/ui/tooltip";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { useDialogA11y } from "./use-dialog-a11y";
import {
  ArrowRight,
  Sparkles,
  X,
  CircleUserRound,
  Type,
  Frame,
  CalendarDays,
  CaseSensitive,
  Columns2,
  Square,
  StretchVertical,
  Copy,
  Palette,
  type LucideIcon,
} from "lucide-react";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText, type StudioTexts } from "./studio-texts";
import {
  tourStorageKey,
  tourFeaturesFor,
  type StudioTourSurface,
  type StudioTourIcon,
} from "./lib/studio-tour";

const ONBOARD_VERSION = "v1";

/** Mapa de los iconos declarativos del tour a componentes lucide. */
const TOUR_ICONS: Record<StudioTourIcon, LucideIcon> = {
  user: CircleUserRound,
  type: Type,
  frame: Frame,
  calendar: CalendarDays,
  font: CaseSensitive,
  faces: Columns2,
  blank: Square,
  strip: StretchVertical,
  units: Copy,
  palette: Palette,
};

type OnboardingStep = {
  title: string;
  body: string;
  /** Copy alternativo para MÓVIL: no hay "panel de la izquierda" ni drag (es touch);
   *  el patrón en móvil es "toca y sube tu foto" (hallazgo de investigación Fase 3). */
  bodyMobile?: string;
  cta: string;
  /** Icono de feature del producto (pasos del tour por superficie, item 2.8). */
  icon?: StudioTourIcon;
};

// #14 — el sustantivo del slot se parametriza por producto: en /estudio/separadores-libros los slots
// son "separador", no "imán" (pantalla=físico). #7/#13 — copy en es-CO tuteo (sin voseo).
// Ola 4 — los formatos salen del CMS (estudio.fotos.formatos, via texts) igual que los uploaders.
// Roadmap B1 — todos los textos del tutorial son campos CMS (estudio.lienzo.onboarding-*).
// Item 2.8 — a los 3 pasos genéricos se suman las FEATURES del lienzo del producto
// (estudio.tour.*), cada una como un paso con su icono.
function buildSteps(
  noun: string,
  surface: StudioTourSurface,
  texts: StudioTexts,
): OnboardingStep[] {
  const vars = { sustantivo: noun, formatos: texts.fotos.formatos };
  const generic: OnboardingStep[] = [
    {
      title: texts.lienzo.onboarding1Titulo,
      body: fillStudioText(texts.lienzo.onboarding1Cuerpo, vars),
      bodyMobile: fillStudioText(texts.lienzo.onboarding1CuerpoMovil, vars),
      cta: texts.comun.siguiente,
    },
    {
      title: fillStudioText(texts.lienzo.onboarding2Titulo, vars),
      body: fillStudioText(texts.lienzo.onboarding2Cuerpo, vars),
      bodyMobile: fillStudioText(texts.lienzo.onboarding2CuerpoMovil, vars),
      cta: texts.comun.siguiente,
    },
  ];
  const features: OnboardingStep[] = tourFeaturesFor(surface, texts).map((f) => ({
    title: f.title,
    body: f.body,
    cta: texts.comun.siguiente,
    icon: f.icon,
  }));
  const last: OnboardingStep = {
    title: texts.lienzo.onboarding3Titulo,
    body: texts.lienzo.onboarding3Cuerpo,
    cta: texts.lienzo.onboardingCtaEmpezar,
  };
  return [...generic, ...features, last];
}

/** Detecta viewport móvil (< lg) de forma reactiva para elegir el copy correcto. */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export function StudioOnboarding({
  slotNoun = "imán",
  surface = "default",
  onOpenChange,
}: {
  slotNoun?: string;
  /** Item 2.8 — superficie del tour (tipo de producto): decide las features y
   *  la clave de localStorage ("ya lo vi" por superficie). */
  surface?: StudioTourSurface;
  /** Item 2.8 — el editor pausa el auto-trigger del banner de gestos mientras
   *  el tour está abierto (convivencia con StudioGesturesHint). */
  onOpenChange?: (open: boolean) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const isMobile = useIsMobile();
  const texts = useStudioTexts();
  const STEPS = buildSteps(slotNoun, surface, texts);

  // Item 2.8 — reportar el open al editor (suprime el auto-trigger del banner
  // de gestos mientras el tour tapa la pantalla).
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    // Solo mostrar en cliente — SSR evita el localStorage
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(tourStorageKey(surface));
      if (stored !== ONBOARD_VERSION) {
        // Delay 800ms para que el editor termine de montarse antes
        const t = window.setTimeout(() => setIsOpen(true), 800);
        return () => window.clearTimeout(t);
      }
    } catch {
      // localStorage podría no estar disponible (private mode iOS Safari pre-iOS 11)
    }
  }, [surface]);

  const close = useCallback(() => {
    setIsOpen(false);
    try {
      window.localStorage.setItem(tourStorageKey(surface), ONBOARD_VERSION);
    } catch {
      // ignore
    }
  }, [surface]);

  // #15 — foco inicial + trap + Escape + retorno de foco del onboarding.
  useDialogA11y(dialogRef, { onClose: close, active: isOpen });

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
  const CurrentIcon = current.icon ? TOUR_ICONS[current.icon] : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dialogRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm outline-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          tabIndex={-1}
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
                // #16 — sin bobbing infinito si el usuario pide reducir movimiento (WCAG 2.2.2).
                animate={reduced ? { y: 0, rotate: 0 } : { y: [0, -4, 0], rotate: [0, -3, 3, 0] }}
                transition={{ duration: 3, repeat: reduced ? 0 : Infinity, ease: "easeInOut" }}
              >
                <LucamsLogo variant="mascot" size={56} />
              </motion.div>
              <div className="flex-1 pt-1">
                <p className="text-brand-muted text-[10px] font-semibold tracking-wider uppercase">
                  {fillStudioText(texts.lienzo.onboardingPaso, {
                    n: step + 1,
                    total: STEPS.length,
                  })}
                </p>
                <h2
                  id="onboarding-title"
                  className="text-brand-purple-dark mt-1 flex items-center gap-2 text-lg leading-tight font-bold"
                >
                  {CurrentIcon && (
                    <CurrentIcon className="text-brand-pink h-5 w-5 shrink-0" aria-hidden />
                  )}
                  {current.title}
                </h2>
              </div>
              <Hint content={texts.comun.saltarTutorial}>
                <button
                  type="button"
                  onClick={skip}
                  aria-label={texts.comun.saltarTutorial}
                  className="text-brand-muted hover:bg-brand-purple/10 hover:text-brand-purple-dark/70 flex h-7 w-7 items-center justify-center rounded-md transition-colors focus:outline-none"
                >
                  <X className="h-4 w-4" />
                </button>
              </Hint>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <p className="text-brand-purple-dark/80 text-sm leading-relaxed">
                {isMobile && current.bodyMobile ? current.bodyMobile : current.body}
              </p>

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
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold underline"
              >
                {texts.lienzo.onboardingSaltar}
              </button>
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={prev}
                    className="text-brand-purple-dark/70 hover:bg-brand-purple/10 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
                  >
                    {texts.comun.anterior}
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
