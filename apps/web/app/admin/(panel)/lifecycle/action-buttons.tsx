"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play, RotateCcw, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminConfirm } from "@/components/admin/use-admin-confirm";
import {
  retryLifecycleMessageAction,
  sendLifecycleTestAction,
  setEnrollmentStatusAction,
  setLifecycleJourneyStatusAction,
} from "@/features/lifecycle/actions";
import type { LifecycleJourneyStatus } from "@lucams/db";
import { useLifecycleSensitiveAction } from "@/features/lifecycle/use-sensitive-action";

export function LifecycleStatusButtons({
  journeyId,
  status,
  firstStepId,
}: {
  journeyId: string;
  status: LifecycleJourneyStatus;
  firstStepId?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
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
      <Button
        type="button"
        variant="outline"
        disabled={pending || !firstStepId}
        onClick={() =>
          execute(
            () => sendLifecycleTestAction({ journeyId, stepId: firstStepId }),
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
}: {
  enrollmentId: string;
  status: "ACTIVE" | "COMPLETED" | "EXITED" | "SUPPRESSED";
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
      ) : status === "SUPPRESSED" ? (
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
