"use client";

/*
 * Editor inline de UN texto clave de la plantilla (asunto / preheader /
 * titular). Un campo por form: vacío = sin personalización (se muestra el
 * texto base de código como placeholder); guardar escribe el override
 * (EmailTemplateOverride) y «Restaurar original» lo borra. Tokens {campo}
 * disponibles según el data de la plantilla (ej. {orderNumber}).
 */

import { useActionState } from "react";
import { saveEmailOverrideAction, type EmailTemplateActionState } from "../actions";

export function OverrideFieldForm({
  templateId,
  fieldKey,
  label,
  baseValue,
  overrideValue,
}: {
  templateId: string;
  fieldKey: string;
  label: string;
  /** Texto base del código (render sin overrides) — fallback y placeholder. */
  baseValue: string;
  /** Override guardado en DB, o null si el campo usa el texto base. */
  overrideValue: string | null;
}) {
  const [state, formAction, isPending] = useActionState<EmailTemplateActionState | null, FormData>(
    saveEmailOverrideAction,
    null,
  );

  return (
    <div className="border-brand-purple/10 rounded-xl border bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label
          htmlFor={`ov-${fieldKey}`}
          className="text-brand-purple-dark text-xs font-bold tracking-wide uppercase"
        >
          {label}
        </label>
        {overrideValue !== null ? (
          <span className="bg-brand-pink/10 text-brand-pink rounded-full px-2 py-0.5 text-[11px] font-semibold">
            Personalizado
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            Texto original
          </span>
        )}
      </div>

      <form action={formAction} className="space-y-2">
        <input type="hidden" name="templateId" value={templateId} />
        <input type="hidden" name="key" value={fieldKey} />
        <input
          id={`ov-${fieldKey}`}
          name="value"
          type="text"
          defaultValue={overrideValue ?? ""}
          placeholder={baseValue}
          maxLength={500}
          className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
        <p className="text-brand-muted text-xs">
          Original: <span className="italic">{baseValue}</span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="bg-brand-purple hover:bg-brand-purple-dark rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50"
          >
            {isPending ? "Guardando…" : "Guardar"}
          </button>
        </div>
        {state?.error && <p className="text-xs text-rose-600">{state.error}</p>}
        {state?.ok && <p className="text-xs text-emerald-700">{state.message}</p>}
      </form>

      {/* Form aparte para restaurar: si el botón viviera en el form de arriba
          con name="value", FormData tomaría primero el input de texto y el
          borrado (value="") nunca llegaría. */}
      {overrideValue !== null && (
        <form action={formAction} className="mt-2">
          <input type="hidden" name="templateId" value={templateId} />
          <input type="hidden" name="key" value={fieldKey} />
          <input type="hidden" name="value" value="" />
          <button
            type="submit"
            disabled={isPending}
            className="border-brand-purple/25 text-brand-purple-dark hover:border-brand-purple/50 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            Restaurar original
          </button>
        </form>
      )}
    </div>
  );
}
