"use client";

/*
 * Panel lateral de asignación de responsable y prioridad con concurrencia optimista (`S21`).
 */

import { useActionState } from "react";
import { UserCheck } from "lucide-react";
import { updateTicketGovernanceAction } from "../actions";

type St = { error?: string; success?: string } | null;

const PRIORITIES = [
  { value: "LOW", label: "Baja" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "Alta" },
  { value: "URGENT", label: "Urgente" },
] as const;

export function TicketAssignmentForm({
  ticketId,
  currentAssignedAdminId,
  currentPriority,
  currentActorAdminId,
  assignableAdmins,
  updatedAtIso,
}: {
  ticketId: string;
  currentAssignedAdminId: string | null;
  currentPriority: string;
  currentActorAdminId: string;
  assignableAdmins: Array<{ id: string; email: string; role: string }>;
  updatedAtIso: string;
}) {
  const [st, run, pending] = useActionState<St, FormData>(updateTicketGovernanceAction, null);

  return (
    <div className="space-y-3">
      {currentAssignedAdminId !== currentActorAdminId && (
        <form action={run}>
          <input type="hidden" name="id" value={ticketId} />
          <input type="hidden" name="assignedToAdminId" value={currentActorAdminId} />
          <input type="hidden" name="priority" value={currentPriority} />
          <input type="hidden" name="expectedUpdatedAt" value={updatedAtIso} />
          <button
            type="submit"
            disabled={pending}
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60"
          >
            <UserCheck className="h-3.5 w-3.5" />
            Asignarme este caso
          </button>
        </form>
      )}

      <form action={run} className="space-y-2.5">
        <input type="hidden" name="id" value={ticketId} />
        <input type="hidden" name="expectedUpdatedAt" value={updatedAtIso} />

        <div>
          <label
            htmlFor={`assign-select-${ticketId}`}
            className="text-brand-purple-dark mb-1 block text-xs font-semibold"
          >
            Responsable
          </label>
          <select
            id={`assign-select-${ticketId}`}
            name="assignedToAdminId"
            defaultValue={currentAssignedAdminId ?? "UNASSIGNED"}
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-10 w-full rounded-lg border bg-white px-2.5 text-xs focus:ring-2 focus:outline-none"
          >
            <option value="UNASSIGNED">Sin asignar</option>
            {assignableAdmins.map((adm) => (
              <option key={adm.id} value={adm.id}>
                {adm.email}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={`priority-select-${ticketId}`}
            className="text-brand-purple-dark mb-1 block text-xs font-semibold"
          >
            Prioridad
          </label>
          <select
            id={`priority-select-${ticketId}`}
            name="priority"
            defaultValue={currentPriority || "NORMAL"}
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-10 w-full rounded-lg border bg-white px-2.5 text-xs focus:ring-2 focus:outline-none"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {st && (st.success || st.error) && (
          <p className={`text-xs font-medium ${st.success ? "text-emerald-700" : "text-rose-700"}`}>
            {st.success ?? st.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="bg-brand-purple hover:bg-brand-purple-dark min-h-10 w-full rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar responsable y prioridad"}
        </button>
      </form>
    </div>
  );
}
