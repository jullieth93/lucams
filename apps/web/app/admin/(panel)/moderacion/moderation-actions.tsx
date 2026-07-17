"use client";

/*
 * Acciones de moderación por diseño: aprobar (un click) o rechazar (con motivo obligatorio que
 * el cliente verá en el email). El rechazo se despliega inline para pedir el motivo.
 */

import { useState } from "react";
import { SubmitButton } from "@/components/admin/submit-button";
import { approveDesignAction, rejectDesignAction } from "./actions";

export function ModerationActions({ designId }: { designId: string }) {
  const [rejecting, setRejecting] = useState(false);

  if (rejecting) {
    return (
      <form action={rejectDesignAction} className="flex flex-col gap-2">
        <input type="hidden" name="designId" value={designId} />
        <textarea
          name="reason"
          required
          minLength={5}
          maxLength={300}
          rows={2}
          placeholder="Motivo del rechazo (lo verá el cliente en el correo)"
          className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <SubmitButton label="Confirmar rechazo" variant="danger" size="sm" />
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="text-brand-muted text-xs hover:underline"
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
        <SubmitButton
          label="Aprobar para imprimir"
          variant="primary"
          size="sm"
          className="w-full"
        />
      </form>
      <button
        type="button"
        onClick={() => setRejecting(true)}
        className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
      >
        Rechazar…
      </button>
    </div>
  );
}
