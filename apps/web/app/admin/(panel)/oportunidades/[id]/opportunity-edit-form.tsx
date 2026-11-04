"use client";

/*
 * Editor interactivo de etapa, presupuesto, responsable y conversión de `Opportunity` (`S24`).
 */

import { useActionState, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import { AdminCard } from "@/components/admin-page";
import {
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_STAGES,
  type OpportunityStage,
} from "@/features/opportunities/schemas";
import {
  updateOpportunityAction,
  type AdminOpportunityActionState,
} from "@/features/opportunities/actions";

type Props = {
  opportunityId: string;
  initialStage: OpportunityStage;
  initialExpectedUnits: number | null;
  initialExpectedAmountCop: number;
  initialOwnerAdminId: string | null;
  initialInternalNotes: string | null;
  initialLostReason: string | null;
  initialConvertedOrderNumber: string | null;
  currentAdminId: string;
  assignableAdmins: Array<{ id: string; email: string }>;
};

export function OpportunityEditForm({
  opportunityId,
  initialStage,
  initialExpectedUnits,
  initialExpectedAmountCop,
  initialOwnerAdminId,
  initialInternalNotes,
  initialLostReason,
  initialConvertedOrderNumber,
  currentAdminId,
  assignableAdmins,
}: Props) {
  const [stage, setStage] = useState<OpportunityStage>(initialStage);
  const [state, formAction, pending] = useActionState<AdminOpportunityActionState, FormData>(
    updateOpportunityAction,
    null,
  );

  const initialPesos = Math.round(initialExpectedAmountCop / 100);

  return (
    <AdminCard className="p-5">
      <h2 className="text-brand-purple-dark font-display text-base font-bold">
        Gestión del negocio y etapa comercial
      </h2>
      <p className="text-brand-muted mt-0.5 text-xs">
        Avanza la etapa según la conversación con el cliente y vincula el número de pedido cuando se
        concrete.
      </p>

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="id" value={opportunityId} />
        <input type="hidden" name="stage" value={stage} />

        {/* Stepper interactivo de etapas */}
        <div className="space-y-1.5">
          <span className="text-brand-muted block text-[11px] font-semibold uppercase">
            Etapa actual del pipeline
          </span>
          <div className="flex flex-wrap gap-1.5">
            {OPPORTUNITY_STAGES.map((st) => {
              const selected = stage === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStage(st)}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    selected
                      ? st === "WON"
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : st === "LOST"
                          ? "border-rose-600 bg-rose-600 text-white"
                          : "border-brand-purple bg-brand-purple text-white"
                      : "border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/10 bg-[#FFF8F0]/60"
                  }`}
                >
                  {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {OPPORTUNITY_STAGE_LABELS[st]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="opp-units"
              className="text-brand-muted block text-[11px] font-semibold uppercase"
            >
              Unidades estimadas
            </label>
            <input
              id="opp-units"
              name="expectedUnits"
              type="number"
              min={0}
              defaultValue={initialExpectedUnits ?? ""}
              className="border-brand-purple/20 text-brand-purple-dark mt-1 min-h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="opp-pesos"
              className="text-brand-muted block text-[11px] font-semibold uppercase"
            >
              Valor estimado (pesos COP)
            </label>
            <input
              id="opp-pesos"
              name="expectedAmountPesos"
              type="number"
              min={0}
              step={1000}
              defaultValue={initialPesos}
              placeholder="Ej. 850000"
              className="border-brand-purple/20 text-brand-purple-dark mt-1 min-h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm tabular-nums"
            />
          </div>

          <div>
            <label
              htmlFor="opp-owner"
              className="text-brand-muted block text-[11px] font-semibold uppercase"
            >
              Responsable comercial
            </label>
            <select
              id="opp-owner"
              name="ownerAdminId"
              defaultValue={initialOwnerAdminId ?? currentAdminId}
              className="border-brand-purple/20 text-brand-purple-dark mt-1 min-h-10 w-full rounded-lg border bg-white px-2.5 py-2 text-xs font-medium"
            >
              <option value="UNASSIGNED">Sin asignar</option>
              {assignableAdmins.map((adm) => (
                <option key={adm.id} value={adm.id}>
                  {adm.id === currentAdminId ? `Yo (${adm.email})` : adm.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        {stage === "LOST" && (
          <div>
            <label htmlFor="opp-lost-reason" className="block text-xs font-semibold text-rose-800">
              Motivo de pérdida (obligatorio al marcar como Perdida) *
            </label>
            <input
              id="opp-lost-reason"
              name="lostReason"
              type="text"
              required
              minLength={3}
              maxLength={300}
              defaultValue={initialLostReason ?? ""}
              placeholder="Ej. Fecha de evento demasiado cercana / presupuesto fuera de rango"
              className="mt-1 min-h-10 w-full rounded-lg border border-rose-300 bg-rose-50/40 px-3 py-2 text-sm text-rose-950"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="opp-order"
            className="text-brand-muted block text-[11px] font-semibold uppercase"
          >
            Pedido convertido (opcional, ej. LCM-2026-0145)
          </label>
          <input
            id="opp-order"
            name="convertedOrderNumber"
            type="text"
            defaultValue={initialConvertedOrderNumber ?? ""}
            placeholder="LCM-2026-..."
            className="border-brand-purple/20 text-brand-purple-dark mt-1 min-h-10 w-full rounded-lg border bg-white px-3 py-2 font-mono text-xs"
          />
        </div>

        <div>
          <label
            htmlFor="opp-internal-notes"
            className="text-brand-muted block text-[11px] font-semibold uppercase"
          >
            Acuerdos y notas comerciales internas
          </label>
          <textarea
            id="opp-internal-notes"
            name="internalNotes"
            rows={3}
            defaultValue={initialInternalNotes ?? ""}
            placeholder="Descuento acordado, condiciones de anticipo, fecha de entrega comprometida..."
            className="border-brand-purple/20 text-brand-purple-dark mt-1 w-full rounded-lg border bg-white px-3 py-2 text-xs"
          />
        </div>

        {state?.error && (
          <p role="alert" className="text-xs font-semibold text-rose-700">
            {state.error}
          </p>
        )}
        {state?.success && (
          <p role="status" className="text-xs font-semibold text-emerald-700">
            {state.success}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="bg-brand-purple inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {pending ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </form>
    </AdminCard>
  );
}
