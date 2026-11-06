"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createLifecycleJourneyAction,
  updateLifecycleJourneyAction,
} from "@/features/lifecycle/actions";
import type { LifecycleJourneyInput, LifecycleJourneyStepInput } from "@/features/lifecycle/types";
import { useLifecycleSensitiveAction } from "@/features/lifecycle/use-sensitive-action";

const CONDITION_OPTIONS = [
  ["ALWAYS", "Siempre"],
  ["NO_PAID_ORDER", "Aún no tiene pedido pagado"],
  ["HAS_ABANDONED_CART", "Tiene carrito abandonado"],
  ["HAS_LOYALTY_POINTS", "Tiene puntos disponibles"],
  ["HAS_DESIGN_ACTIVITY", "Tiene actividad de diseño"],
  ["HAS_OPT_IN", "Tiene consentimiento vigente"],
  ["ORDER_DELIVERED", "Tiene pedido entregado"],
  ["NO_ORDER_SINCE_ENROLLMENT", "No compró desde la inscripción"],
] as const;

function emptyStep(position: number): LifecycleJourneyStepInput {
  return {
    position,
    delayMinutes: 0,
    subject: "",
    heading: "",
    preheader: "",
    body: "",
    ctaLabel: "",
    ctaPath: "/recomendador",
    commercial: true,
    condition: "ALWAYS",
  };
}

const INITIAL_JOURNEY: LifecycleJourneyInput = {
  key: "",
  name: "",
  description: "",
  trigger: "FIRST_PURCHASE",
  status: "DRAFT",
  requireOptIn: true,
  inactivityDays: 90,
  entryLookbackDays: 30,
  cooldownDays: 180,
  maxMessagesPerDay: 2,
  quietStartHour: 20,
  quietEndHour: 8,
  steps: [emptyStep(1)],
};

export function LifecycleJourneyForm({
  journeyId,
  initialJourney = INITIAL_JOURNEY,
}: {
  journeyId?: string;
  initialJourney?: LifecycleJourneyInput;
}) {
  const router = useRouter();
  const [journey, setJourney] = useState(initialJourney);
  const [message, setMessage] = useState<string | null>(null);
  const { pending, execute, reauthModal } = useLifecycleSensitiveAction();

  function updateField<K extends keyof LifecycleJourneyInput>(
    key: K,
    value: LifecycleJourneyInput[K],
  ) {
    setJourney((current) => ({ ...current, [key]: value }));
  }

  function updateStep(index: number, field: keyof LifecycleJourneyStepInput, value: unknown) {
    setJourney((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, [field]: value } : step,
      ),
    }));
  }

  function addStep() {
    setJourney((current) => ({
      ...current,
      steps: [...current.steps, emptyStep(current.steps.length + 1)],
    }));
  }

  function removeStep(index: number) {
    setJourney((current) => ({
      ...current,
      steps: current.steps.filter((_, stepIndex) => stepIndex !== index),
    }));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setJourney((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.steps.length) return current;
      const steps = [...current.steps];
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return {
        ...current,
        steps: steps.map((step, stepIndex) => ({ ...step, position: stepIndex + 1 })),
      };
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    execute(
      () =>
        journeyId
          ? updateLifecycleJourneyAction({ journeyId, ...journey })
          : createLifecycleJourneyAction(journey),
      (result) => {
        setMessage(result.message);
        if (result.ok) {
          if (!journeyId && result.id) router.push(`/admin/lifecycle/${result.id}`);
          router.refresh();
        }
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="font-display text-brand-purple-dark text-lg font-bold">
          Configuración general
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-brand-purple-dark block text-sm font-semibold">
            Clave única
            <input
              required
              value={journey.key}
              onChange={(event) => updateField("key", event.target.value)}
              placeholder="primera-compra"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
            />
            <span className="text-brand-muted mt-1 block text-xs font-normal">
              Solo minúsculas, números y guiones.
            </span>
          </label>
          <label className="text-brand-purple-dark block text-sm font-semibold">
            Nombre visible
            <input
              required
              value={journey.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Primera compra"
              className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
            />
          </label>
        </div>
        <label className="text-brand-purple-dark mt-4 block text-sm font-semibold">
          Propósito del recorrido
          <textarea
            required
            rows={3}
            value={journey.description}
            onChange={(event) => updateField("description", event.target.value)}
            className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
          />
        </label>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-brand-purple-dark block text-sm font-semibold">
            Disparador
            <select
              value={journey.trigger}
              onChange={(event) =>
                updateField("trigger", event.target.value as LifecycleJourneyInput["trigger"])
              }
              className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
            >
              <option value="FIRST_PURCHASE">Primera compra</option>
              <option value="SECOND_PURCHASE">Segunda compra</option>
              <option value="REACTIVATION">Reactivación</option>
              <option value="HIGH_INTENT">Alta intención</option>
              <option value="B2B_FOLLOW_UP">Seguimiento B2B</option>
            </select>
          </label>
          <label className="text-brand-purple-dark block text-sm font-semibold">
            Estado
            <select
              value={journey.status}
              onChange={(event) =>
                updateField("status", event.target.value as LifecycleJourneyInput["status"])
              }
              className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
              disabled={!journeyId}
            >
              <option value="DRAFT">Borrador</option>
              <option value="ACTIVE">Activo</option>
              <option value="PAUSED">Pausado</option>
              <option value="ARCHIVED">Archivado</option>
            </select>
          </label>
        </div>
        <label className="text-brand-purple-dark mt-4 flex items-start gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={journey.requireOptIn}
            onChange={(event) => updateField("requireOptIn", event.target.checked)}
            className="accent-brand-purple mt-0.5 h-4 w-4"
          />
          <span>
            Exigir consentimiento de newsletter para inscribir
            <span className="text-brand-muted block text-xs font-normal">
              Los pasos promocionales siempre vuelven a validar el consentimiento, aunque el
              recorrido no lo exija al inscribir.
            </span>
          </span>
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-brand-purple-dark block text-sm font-semibold">
            Inactividad (días)
            <input
              type="number"
              min={0}
              max={3650}
              required
              value={journey.inactivityDays}
              onChange={(event) => updateField("inactivityDays", Number(event.target.value))}
              className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="text-brand-purple-dark block text-sm font-semibold">
            Ventana de entrada (días)
            <input
              type="number"
              min={1}
              max={3650}
              required
              value={journey.entryLookbackDays}
              onChange={(event) => updateField("entryLookbackDays", Number(event.target.value))}
              className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="text-brand-purple-dark block text-sm font-semibold">
            Cooldown (días)
            <input
              type="number"
              min={0}
              max={3650}
              required
              value={journey.cooldownDays}
              onChange={(event) => updateField("cooldownDays", Number(event.target.value))}
              className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="text-brand-purple-dark block text-sm font-semibold">
            Mensajes por día
            <input
              type="number"
              min={1}
              max={20}
              required
              value={journey.maxMessagesPerDay}
              onChange={(event) => updateField("maxMessagesPerDay", Number(event.target.value))}
              className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-brand-purple-dark block text-sm font-semibold">
            Silencio desde (hora)
            <input
              type="number"
              min={0}
              max={23}
              required
              value={journey.quietStartHour}
              onChange={(event) => updateField("quietStartHour", Number(event.target.value))}
              className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="text-brand-purple-dark block text-sm font-semibold">
            Silencio hasta (hora)
            <input
              type="number"
              min={0}
              max={23}
              required
              value={journey.quietEndHour}
              onChange={(event) => updateField("quietEndHour", Number(event.target.value))}
              className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-brand-purple-dark text-lg font-bold">
            Pasos y contenido
          </h2>
          <Button
            type="button"
            variant="outline"
            onClick={addStep}
            disabled={journey.steps.length >= 12}
          >
            <Plus className="mr-2 h-4 w-4" /> Agregar paso
          </Button>
        </div>
        {journey.steps.map((step, index) => (
          <fieldset
            key={step.id ?? `new-${index}`}
            className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <legend className="text-brand-purple-dark px-1 text-sm font-bold">
                Paso {index + 1}
              </legend>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => moveStep(index, -1)}
                  disabled={index === 0}
                  aria-label={`Subir paso ${index + 1}`}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => moveStep(index, 1)}
                  disabled={index === journey.steps.length - 1}
                  aria-label={`Bajar paso ${index + 1}`}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                {journey.steps.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeStep(index)}
                    aria-label={`Eliminar paso ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-brand-purple-dark block text-sm font-semibold">
                Espera en minutos
                <input
                  type="number"
                  min={0}
                  max={525600}
                  required
                  value={step.delayMinutes}
                  onChange={(event) =>
                    updateStep(index, "delayMinutes", Number(event.target.value))
                  }
                  className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
                />
                <span className="text-brand-muted mt-1 block text-xs font-normal">
                  0 = inmediato · 1440 = 1 día · 10080 = 7 días.
                </span>
              </label>
              <label className="text-brand-purple-dark block text-sm font-semibold">
                Condición
                <select
                  value={step.condition}
                  onChange={(event) => updateStep(index, "condition", event.target.value)}
                  className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
                >
                  {CONDITION_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-brand-purple-dark block text-sm font-semibold">
                Asunto
                <input
                  required
                  maxLength={160}
                  value={step.subject}
                  onChange={(event) => updateStep(index, "subject", event.target.value)}
                  className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
                />
              </label>
              <label className="text-brand-purple-dark block text-sm font-semibold">
                Preheader
                <input
                  required
                  maxLength={240}
                  value={step.preheader}
                  onChange={(event) => updateStep(index, "preheader", event.target.value)}
                  className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
                />
              </label>
            </div>
            <label className="text-brand-purple-dark mt-4 block text-sm font-semibold">
              Titular del correo
              <input
                required
                maxLength={200}
                value={step.heading}
                onChange={(event) => updateStep(index, "heading", event.target.value)}
                className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="text-brand-purple-dark mt-4 block text-sm font-semibold">
              Contenido
              <textarea
                required
                rows={4}
                maxLength={5000}
                value={step.body}
                onChange={(event) => updateStep(index, "body", event.target.value)}
                className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
              />
              <span className="text-brand-muted mt-1 block text-xs font-normal">
                Usa {"{nombre}"} para personalizar el saludo. Separa párrafos con una línea en
                blanco.
              </span>
            </label>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-brand-purple-dark block text-sm font-semibold">
                Texto del botón
                <input
                  required
                  maxLength={100}
                  value={step.ctaLabel}
                  onChange={(event) => updateStep(index, "ctaLabel", event.target.value)}
                  className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
                />
              </label>
              <label className="text-brand-purple-dark block text-sm font-semibold">
                Ruta interna del botón
                <input
                  required
                  value={step.ctaPath}
                  onChange={(event) => updateStep(index, "ctaPath", event.target.value)}
                  className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
                />
              </label>
            </div>
            <label className="text-brand-purple-dark mt-4 flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={step.commercial}
                onChange={(event) => updateStep(index, "commercial", event.target.checked)}
                className="accent-brand-purple h-4 w-4"
              />
              Es mensaje comercial (exige opt-in y lleva baja en un clic)
            </label>
          </fieldset>
        ))}
      </section>

      <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <Button type="submit" disabled={pending} className="bg-brand-purple-dark text-white">
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {journeyId ? "Guardar recorrido" : "Crear borrador"}
        </Button>
        {message && (
          <p className="text-sm text-slate-700" role="status">
            {message}
          </p>
        )}
      </div>
      {reauthModal}
    </form>
  );
}
