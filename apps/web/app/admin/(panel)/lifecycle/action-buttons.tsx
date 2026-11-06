"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play, RotateCcw, Send, Settings2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminConfirm } from "@/components/admin/use-admin-confirm";
import {
  retryLifecycleMessageAction,
  saveLifecycleSettingsAction,
  sendLifecycleTestAction,
  setEnrollmentStatusAction,
  setLifecycleJourneyStatusAction,
} from "@/features/lifecycle/actions";
import type { LifecycleJourneyStatus } from "@lucams/db";
import { useLifecycleSensitiveAction } from "@/features/lifecycle/use-sensitive-action";

export function LifecycleEngineControls({
  enabled,
  maxMessagesPerDay,
  dryRun,
}: {
  enabled: boolean;
  maxMessagesPerDay: number;
  dryRun: boolean;
}) {
  const router = useRouter();
  const [engineEnabled, setEngineEnabled] = useState(enabled);
  const [dailyLimit, setDailyLimit] = useState(maxMessagesPerDay);
  const [message, setMessage] = useState<string | null>(null);
  const { pending, execute, reauthModal } = useLifecycleSensitiveAction();

  return (
    <form
      className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        execute(
          () =>
            saveLifecycleSettingsAction({ enabled: engineEnabled, maxMessagesPerDay: dailyLimit }),
          (result) => {
            setMessage(result.message);
            if (result.ok) router.refresh();
          },
        );
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-brand-purple-dark flex items-center gap-2 text-lg font-bold">
            <Settings2 className="h-5 w-5" /> Control general del motor
          </h2>
          <p className="text-brand-muted mt-1 text-sm">
            {engineEnabled
              ? "El motor puede inscribir y ejecutar recorridos activos."
              : "El motor está pausado: conserva el historial, pero no inscribe ni ejecuta."}
          </p>
          {dryRun && (
            <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
              Modo de prueba: las ejecuciones se registran como DRY_RUN y nunca llaman a Resend.
            </p>
          )}
        </div>
        <label className="text-brand-purple-dark flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={engineEnabled}
            onChange={(event) => setEngineEnabled(event.target.checked)}
            className="accent-brand-purple h-4 w-4"
          />
          Motor general activo
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-brand-purple-dark block text-sm font-semibold">
          Límite global por contacto y día
          <input
            type="number"
            min={1}
            max={20}
            required
            value={dailyLimit}
            onChange={(event) => setDailyLimit(Number(event.target.value))}
            className="border-brand-purple/25 mt-1 block w-32 rounded-xl border-2 px-3 py-2 text-sm outline-none"
          />
          <span className="text-brand-muted mt-1 block text-xs font-normal">
            Hora Colombia · incluye todos los recorridos.
          </span>
        </label>
        <Button type="submit" disabled={pending} className="bg-brand-purple-dark text-white">
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar control general
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

export function LifecycleStatusButtons({
  journeyId,
  status,
  steps,
}: {
  journeyId: string;
  status: LifecycleJourneyStatus;
  steps: Array<{ id: string; position: number; subject: string }>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [stepId, setStepId] = useState(steps[0]?.id);
  const { pending, execute, reauthModal } = useLifecycleSensitiveAction();
  const { confirm, confirmDialog } = useAdminConfirm();

  function changeStatus(next: LifecycleJourneyStatus) {
    execute(
      () => setLifecycleJourneyStatusAction({ journeyId, status: next }),
      (result) => {
        setMessage(result.message);
        if (result.ok) router.refresh();
      },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "ACTIVE" ? (
        <Button
          type="button"
          onClick={() => changeStatus("ACTIVE")}
          disabled={pending}
          className="bg-emerald-700 text-white"
        >
          <Play className="mr-2 h-4 w-4" /> Activar
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => changeStatus("PAUSED")}
          disabled={pending}
        >
          <Pause className="mr-2 h-4 w-4" /> Pausar
        </Button>
      )}
      <label className="text-brand-purple-dark text-xs font-semibold">
        Paso para probar
        <select
          value={stepId}
          onChange={(event) => setStepId(event.target.value)}
          className="border-brand-purple/25 ml-1 rounded-md border bg-white px-2 py-2 text-xs"
        >
          {steps.map((step) => (
            <option key={step.id} value={step.id}>
              {step.position}. {step.subject}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="button"
        variant="outline"
        disabled={pending || !stepId}
        onClick={() =>
          execute(
            () => sendLifecycleTestAction({ journeyId, stepId }),
            (result) => setMessage(result.message),
          )
        }
      >
        <Send className="mr-2 h-4 w-4" /> Enviarme una prueba
      </Button>
      {status !== "ARCHIVED" && (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={async () => {
            if (
              !(await confirm("El recorrido dejará de inscribir nuevos contactos. ¿Archivarlo?", {
                confirmLabel: "Archivar",
              }))
            )
              return;
            changeStatus("ARCHIVED");
          }}
        >
          <Square className="mr-2 h-4 w-4" /> Archivar
        </Button>
      )}
      {message && (
        <span className="text-xs text-slate-600" role="status">
          {message}
        </span>
      )}
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {confirmDialog}
      {reauthModal}
    </div>
  );
}

export function EnrollmentActionButtons({
  enrollmentId,
  status,
  exitReason,
}: {
  enrollmentId: string;
  status: "ACTIVE" | "COMPLETED" | "EXITED" | "SUPPRESSED";
  exitReason: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const { pending, execute, reauthModal } = useLifecycleSensitiveAction();
  const { confirm, confirmDialog } = useAdminConfirm();

  function run(action: "pause" | "resume" | "exit") {
    execute(
      () => setEnrollmentStatusAction({ enrollmentId, action }),
      (result) => {
        setMessage(result.message);
        if (result.ok) router.refresh();
      },
    );
  }

  return (
    <div className="flex items-center gap-1">
      {status === "ACTIVE" ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => run("pause")}
          disabled={pending}
          aria-label="Pausar inscripción"
        >
          <Pause className="h-3.5 w-3.5" />
        </Button>
      ) : status === "SUPPRESSED" && exitReason === "ADMIN_PAUSED" ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => run("resume")}
          disabled={pending}
          aria-label="Reanudar inscripción"
        >
          <Play className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {(status === "ACTIVE" || status === "SUPPRESSED") && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          aria-label="Finalizar inscripción"
          onClick={async () => {
            if (
              !(await confirm("Esta inscripción dejará de recibir mensajes. ¿Finalizarla?", {
                confirmLabel: "Finalizar",
              }))
            )
              return;
            run("exit");
          }}
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
      )}
      {message && (
        <span className="sr-only" role="status">
          {message}
        </span>
      )}
      {confirmDialog}
      {reauthModal}
    </div>
  );
}

export function RetryMessageButton({ messageId }: { messageId: string }) {
  const router = useRouter();
  const { pending, execute, reauthModal } = useLifecycleSensitiveAction();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          execute(
            () => retryLifecycleMessageAction({ messageId }),
            (result) => {
              setMessage(result.message);
              if (result.ok) router.refresh();
            },
          )
        }
      >
        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reintentar
      </Button>
      {message && (
        <span className="sr-only" role="status">
          {message}
        </span>
      )}
      {reauthModal}
    </span>
  );
}
