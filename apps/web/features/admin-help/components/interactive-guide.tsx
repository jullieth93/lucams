"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AdminRole } from "@lucams/db";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  ListChecks,
  RotateCcw,
  X,
} from "lucide-react";
import { saveHelpProgressAction } from "../actions";
import {
  buildModuleSteps,
  buildOnboardingSteps,
  buildPlaybookSteps,
  getProceduresForRole,
} from "../step-builders";
import type {
  AdminHelpProgress,
  AdminHelpStep,
  AdminModuleGuide,
  AdminOnboardingGuide,
  AdminPlaybook,
} from "../types";

type GuideTarget = AdminModuleGuide | AdminOnboardingGuide | AdminPlaybook;

export function AdminInteractiveGuide({
  guide,
  role,
  initialProgress = null,
  onProgressChange,
  onNavigate,
  onClose,
  autoStart = false,
  variant = "inline",
}: {
  guide: GuideTarget;
  role: AdminRole;
  initialProgress?: AdminHelpProgress | null;
  onProgressChange?: (progress: AdminHelpProgress) => void;
  onNavigate?: () => void;
  onClose?: () => void;
  autoStart?: boolean;
  variant?: "inline" | "welcome-floating";
}) {
  const isOnboarding = "role" in guide;
  const isPlaybook = "trigger" in guide;
  const procedures = !isOnboarding && !isPlaybook ? getProceduresForRole(guide, role) : [];

  const [procedureId, setProcedureId] = useState<string>("");
  const validProgress = initialProgress?.version === guide.version ? initialProgress : null;
  const [active, setActive] = useState(autoStart);
  const [currentStep, setCurrentStep] = useState(validProgress?.currentStep ?? 0);
  const [completed, setCompleted] = useState(Boolean(validProgress?.completedAt));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const steps: AdminHelpStep[] = useMemo(() => {
    if (isOnboarding) return buildOnboardingSteps(guide);
    if (isPlaybook) return buildPlaybookSteps(guide, role);
    return buildModuleSteps(guide, role, procedureId || undefined);
  }, [guide, isOnboarding, isPlaybook, procedureId, role]);

  const boundedStep = Math.min(currentStep, Math.max(steps.length - 1, 0));
  const step = steps[boundedStep];

  async function persist(intent: "progress" | "complete" | "dismiss", nextStep: number) {
    setSaving(true);
    const result = await saveHelpProgressAction({
      guideId: guide.id,
      currentStep: nextStep,
      intent,
    });
    if (result.ok && result.progress) {
      onProgressChange?.(result.progress);
      setMessage(null);
    } else if (!result.ok) {
      setMessage("El avance continúa en pantalla, pero no pudimos guardarlo en el servidor.");
    }
    setSaving(false);
  }

  function start() {
    setActive(true);
    setCompleted(false);
    setCurrentStep(validProgress?.currentStep ?? 0);
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
    if (!procedureId) {
      await persist("progress", boundedStep);
    }
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
    if (!procedureId) {
      await persist("progress", 0);
    }
  }

  // Tarjeta discreta de bienvenida en primer login (abajo a la izquierda, sin bloquear ni iluminar main).
  if (variant === "welcome-floating") {
    if (!active) return null;
    return (
      <section
        className="fixed bottom-4 left-4 z-[60] w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        aria-label={`Recorrido: ${guide.title}`}
        aria-live="polite"
      >
        <div className="bg-brand-purple-dark flex items-start justify-between gap-3 px-4 py-3 text-white">
          <div className="flex items-center gap-2.5">
            <GraduationCap className="h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="text-xs font-medium text-slate-200">Bienvenida a tu rol</p>
              <h3 className="font-display text-sm font-bold">{guide.title}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActive(false);
              onClose?.();
            }}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-white hover:bg-white/10"
            aria-label="Posponer bienvenida por esta sesión"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-sm leading-5 text-slate-700">{guide.summary}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/ayuda?tab=dia-1"
              onClick={() => {
                setActive(false);
                onClose?.();
              }}
              className="bg-brand-purple-dark hover:bg-brand-purple inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition-colors"
            >
              Ir a mi Día 1 y Rutina <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void dismiss()}
            className="min-h-11 text-xs font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900 disabled:opacity-50"
          >
            No mostrar automáticamente esta ruta
          </button>
        </div>
      </section>
    );
  }

  if (!active) {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
        {procedures.length > 0 && (
          <div>
            <label
              htmlFor={`procedure-${guide.id}`}
              className="text-xs font-semibold text-slate-700"
            >
              ¿Qué quieres practicar o verificar?
            </label>
            <select
              id={`procedure-${guide.id}`}
              value={procedureId}
              onChange={(event) => {
                setProcedureId(event.target.value);
                setCurrentStep(0);
                setCompleted(false);
              }}
              className="focus:border-brand-purple mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800"
            >
              <option value="">Checklist general de verificación</option>
              {procedures.map((procedure) => (
                <option key={procedure.id} value={procedure.id}>
                  Procedimiento: {procedure.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={start}
            className="bg-brand-purple-dark hover:bg-brand-purple inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            <ListChecks className="h-4 w-4" aria-hidden />
            {validProgress && !completed && !procedureId
              ? "Retomar checklist"
              : isOnboarding
                ? "Iniciar checklist Día 1"
                : isPlaybook
                  ? "Practicar flujo paso a paso"
                  : "Iniciar recorrido interactivo"}
          </button>
          {completed && !procedureId && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              <Check className="h-3.5 w-3.5" aria-hidden /> Completado
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      aria-label={`Recorrido: ${guide.title}`}
      aria-live="polite"
    >
      <div className="bg-brand-purple-dark flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div>
          <p className="text-xs font-medium text-slate-200">
            {isOnboarding
              ? "Checklist de inducción Día 1"
              : isPlaybook
                ? "Checklist de flujo E2E"
                : "Checklist operativo paso a paso"}
          </p>
          <h3 className="font-display text-sm font-bold sm:text-base">{guide.title}</h3>
        </div>
        <button
          type="button"
          onClick={() => void close()}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-white hover:bg-white/10"
          aria-label="Cerrar recorrido"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {completed ? (
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-3 text-emerald-900">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h4 className="font-bold">Checklist completado</h4>
              <p className="text-sm text-slate-600">
                Tu progreso quedó guardado en tu perfil administrativo.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void restart()}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> Repetir
            </button>
            <button
              type="button"
              onClick={() => {
                setActive(false);
                onClose?.();
              }}
              className="bg-brand-purple-dark min-h-11 rounded-lg px-4 text-sm font-semibold text-white"
            >
              Terminar
            </button>
          </div>
        </div>
      ) : step ? (
        <div className="space-y-4 p-5">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>
                Paso {boundedStep + 1} de {steps.length}
              </span>
              <span>{Math.round(((boundedStep + 1) / steps.length) * 100)} %</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              <div
                className="bg-brand-purple h-full transition-all"
                style={{ width: `${((boundedStep + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <h4 className="text-brand-purple-dark text-base font-bold">{step.title}</h4>
            <p className="mt-1.5 text-sm leading-6 text-slate-700">{step.body}</p>
            {step.href && step.hrefLabel && (
              <Link
                href={step.href}
                onClick={onNavigate}
                className="text-brand-purple-dark mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
              >
                {step.hrefLabel} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </div>

          {message && (
            <p className="text-xs font-medium text-amber-900" role="status">
              {message}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={boundedStep === 0 || saving}
              onClick={() => void previous()}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void next()}
              className="bg-brand-purple-dark hover:bg-brand-purple inline-flex min-h-11 items-center gap-1 rounded-lg px-4 text-sm font-semibold text-white transition-colors disabled:opacity-50"
            >
              {boundedStep === steps.length - 1 ? "Finalizar" : "Siguiente"}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
