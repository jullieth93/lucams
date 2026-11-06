"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminRole } from "@lucams/db";
import { Check, ChevronLeft, ChevronRight, Play, RotateCcw, X } from "lucide-react";
import { saveHelpProgressAction } from "../actions";
import { buildModuleSteps, buildOnboardingSteps, getProceduresForRole } from "../registry";
import type {
  AdminHelpProgress,
  AdminHelpStep,
  AdminModuleGuide,
  AdminOnboardingGuide,
} from "../types";

type Guide = AdminModuleGuide | AdminOnboardingGuide;

export function AdminInteractiveGuide({
  guide,
  role,
  initialProgress = null,
  onStart,
  onClose,
  autoStart = false,
}: {
  guide: Guide;
  role: AdminRole;
  initialProgress?: AdminHelpProgress | null;
  onStart?: () => void;
  onClose?: () => void;
  autoStart?: boolean;
}) {
  const isOnboarding = "role" in guide;
  const procedures = isOnboarding ? [] : getProceduresForRole(guide, role);
  const [procedureId, setProcedureId] = useState<string>("");
  const validProgress = initialProgress?.version === guide.version ? initialProgress : null;
  const [active, setActive] = useState(autoStart);
  const [currentStep, setCurrentStep] = useState(validProgress?.currentStep ?? 0);
  const [completed, setCompleted] = useState(Boolean(validProgress?.completedAt));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const steps: AdminHelpStep[] = useMemo(
    () =>
      isOnboarding
        ? buildOnboardingSteps(guide)
        : buildModuleSteps(guide, role, procedureId || undefined),
    [guide, isOnboarding, procedureId, role],
  );
  const boundedStep = Math.min(currentStep, Math.max(steps.length - 1, 0));
  const step = steps[boundedStep];

  useEffect(() => {
    if (!active || !step) return;
    const target = document.querySelector<HTMLElement>(`[data-admin-help="${step.anchor}"]`);
    if (!target) return;
    const previousOutline = target.style.outline;
    const previousOffset = target.style.outlineOffset;
    target.style.outline = "3px solid rgba(124, 106, 173, 0.5)";
    target.style.outlineOffset = "4px";
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
    return () => {
      target.style.outline = previousOutline;
      target.style.outlineOffset = previousOffset;
    };
  }, [active, step]);

  async function persist(intent: "progress" | "complete" | "dismiss", nextStep: number) {
    setSaving(true);
    const result = await saveHelpProgressAction({
      guideId: guide.id,
      currentStep: nextStep,
      intent,
    });
    setMessage(result.ok ? null : "El recorrido continúa, pero no pudimos guardar el avance.");
    setSaving(false);
  }

  async function start() {
    setActive(true);
    setCompleted(false);
    setCurrentStep(validProgress?.currentStep ?? 0);
    onStart?.();
  }

  async function next() {
    if (boundedStep >= steps.length - 1) {
      await persist("complete", boundedStep);
      setCompleted(true);
      return;
    }
    const nextStep = boundedStep + 1;
    setCurrentStep(nextStep);
    await persist("progress", nextStep);
  }

  async function previous() {
    const nextStep = Math.max(0, boundedStep - 1);
    setCurrentStep(nextStep);
    await persist("progress", nextStep);
  }

  async function close() {
    await persist("progress", boundedStep);
    setActive(false);
    onClose?.();
  }

  async function dismiss() {
    await persist("dismiss", boundedStep);
    setActive(false);
    onClose?.();
  }

  async function restart() {
    setCompleted(false);
    setCurrentStep(0);
    setActive(true);
    await persist("progress", 0);
  }

  if (!active) {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
        {!isOnboarding && procedures.length > 0 && (
          <div>
            <label
              htmlFor={`procedure-${guide.id}`}
              className="text-xs font-semibold text-slate-700"
            >
              ¿Qué quieres aprender?
            </label>
            <select
              id={`procedure-${guide.id}`}
              value={procedureId}
              onChange={(event) => {
                setProcedureId(event.target.value);
                setCurrentStep(0);
                setCompleted(false);
              }}
              className="focus:border-brand-purple mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">Recorrido general del módulo</option>
              {procedures.map((procedure) => (
                <option key={procedure.id} value={procedure.id}>
                  {procedure.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void start()}
            className="bg-brand-purple hover:bg-brand-purple-dark inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
          >
            <Play className="h-4 w-4" aria-hidden />
            {validProgress && !completed
              ? "Retomar recorrido"
              : isOnboarding
                ? "Iniciar ruta de aprendizaje"
                : "Iniciar recorrido interactivo"}
          </button>
          {completed && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <Check className="h-4 w-4" /> Completado
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <section
      className="fixed right-4 bottom-4 z-[70] w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      aria-label={`Recorrido: ${guide.title}`}
      aria-live="polite"
    >
      <div className="bg-brand-purple-dark flex items-start justify-between gap-3 px-4 py-3 text-white">
        <div>
          <p className="text-xs text-white/70">
            {isOnboarding ? "Ruta de aprendizaje" : "Guía interactiva opcional"}
          </p>
          <h3 className="font-display font-bold">{guide.title}</h3>
        </div>
        <button
          type="button"
          onClick={() => void close()}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-white/10"
          aria-label="Cerrar recorrido"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      {completed ? (
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-3 text-emerald-800">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-5 w-5" />
            </span>
            <div>
              <h4 className="font-bold">Recorrido completado</h4>
              <p className="text-sm">Tu avance quedó guardado.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void restart()}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 font-medium"
            >
              <RotateCcw className="h-4 w-4" /> Repetir
            </button>
            <button
              type="button"
              onClick={() => {
                setActive(false);
                onClose?.();
              }}
              className="bg-brand-purple min-h-11 rounded-lg px-4 font-semibold text-white"
            >
              Terminar
            </button>
          </div>
        </div>
      ) : step ? (
        <div className="space-y-4 p-5">
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>
                Paso {boundedStep + 1} de {steps.length}
              </span>
              <span>{Math.round(((boundedStep + 1) / steps.length) * 100)} %</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              <div
                className="bg-brand-purple h-full transition-all"
                style={{ width: `${((boundedStep + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>
          <div>
            <h4 className="text-brand-purple-dark text-lg font-bold">{step.title}</h4>
            <p className="mt-2 text-sm leading-6 text-slate-700">{step.body}</p>
          </div>
          {message && (
            <p className="text-xs text-amber-800" role="status">
              {message}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={boundedStep === 0 || saving}
              onClick={() => void previous()}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-300 px-3 font-medium disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void next()}
              className="bg-brand-purple inline-flex min-h-11 items-center gap-1 rounded-lg px-4 font-semibold text-white disabled:opacity-50"
            >
              {boundedStep === steps.length - 1 ? "Finalizar" : "Siguiente"}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {isOnboarding && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void dismiss()}
              className="min-h-11 text-xs font-medium text-slate-500 underline underline-offset-4"
            >
              No mostrar automáticamente esta ruta
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
