"use client";

/*
 * Acciones de moderación por diseño: aprobar (un clic) o rechazar (con motivo obligatorio que
 * el cliente verá en el correo). El rechazo se despliega inline para pedir el motivo.
 */

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { SubmitButton } from "@/components/admin/submit-button";
import { approveDesignAction, rejectDesignAction } from "./actions";

export function ModerationActions({
  designId,
  qFilter = "",
  origenFilter = "",
  calidadFilter = "",
}: {
  designId: string;
  /** Filtros activos en la cola: se envían ocultos para conservar el contexto tras aprobar/rechazar. */
  qFilter?: string;
  origenFilter?: string;
  calidadFilter?: string;
}) {
  const [rejecting, setRejecting] = useState(false);

  const hiddenFilters = (
    <>
      {qFilter && <input type="hidden" name="q" value={qFilter} />}
      {origenFilter && <input type="hidden" name="origen" value={origenFilter} />}
      {calidadFilter && <input type="hidden" name="calidad" value={calidadFilter} />}
    </>
  );

  if (rejecting) {
    return (
      <form
        action={rejectDesignAction}
        className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50/40 p-2.5"
      >
        <input type="hidden" name="designId" value={designId} />
        {hiddenFilters}
        <label className="text-[11px] font-semibold text-rose-800">
          Motivo visible para el cliente
        </label>
        <textarea
          name="reason"
          required
          minLength={5}
          maxLength={300}
          rows={3}
          placeholder="Ej. La imagen tiene derechos de autor restringidos o está demasiado oscura para imprimir."
          className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2.5 py-1.5 text-xs focus:ring-2 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          <SubmitButton
            label="Confirmar rechazo"
            pendingLabel="Rechazando…"
            variant="danger"
            size="sm"
          />
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="text-brand-muted hover:text-brand-purple-dark text-xs font-medium hover:underline"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <form action={approveDesignAction}>
        <input type="hidden" name="designId" value={designId} />
        {hiddenFilters}
        <SubmitButton
          label="Aprobar para imprimir"
          pendingLabel="Aprobando…"
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          variant="primary"
          size="sm"
          className="w-full"
        />
      </form>
      <button
        type="button"
        onClick={() => setRejecting(true)}
        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
      >
        <XCircle className="h-3.5 w-3.5" aria-hidden />
        Rechazar diseño…
      </button>
    </div>
  );
}
