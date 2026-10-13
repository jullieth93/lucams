"use client";

/*
 * Formulario de la config del módulo de carritos abandonados (Fase 4,
 * 2026-10-13): toggle, modo manual/automático y ritmos del cron. Campos
 * CONTROLADOS + indicador "Cambios sin guardar" (mismo patrón que
 * loyalty-section.tsx de /admin/fidelizacion).
 */

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveCartRecoverySettingsAction, type CartRecoveryActionState } from "../actions";
import type { CartRecoverySettings } from "@/features/cart/recovery-settings";

export function ConfigSection({ initial }: { initial: CartRecoverySettings }) {
  const [state, formAction, pending] = useActionState<CartRecoveryActionState | null, FormData>(
    saveCartRecoverySettingsAction,
    null,
  );

  const [enabled, setEnabled] = useState(initial.enabled);
  const [mode, setMode] = useState(initial.mode);
  const [idleHours, setIdleHours] = useState(String(initial.idleHours));
  const [maxReminders, setMaxReminders] = useState(String(initial.maxReminders));
  const [intervalHours, setIntervalHours] = useState(String(initial.intervalHours));

  // Re-sincroniza cuando el server re-renderiza con las settings ya guardadas
  // (patrón oficial "adjust state during render"; si el guardado FALLA, initial
  // no cambia y se conservan las ediciones del admin).
  const initialKey = JSON.stringify(initial);
  const [prevInitialKey, setPrevInitialKey] = useState(initialKey);
  if (prevInitialKey !== initialKey) {
    setPrevInitialKey(initialKey);
    setEnabled(initial.enabled);
    setMode(initial.mode);
    setIdleHours(String(initial.idleHours));
    setMaxReminders(String(initial.maxReminders));
    setIntervalHours(String(initial.intervalHours));
  }

  const dirty =
    enabled !== initial.enabled ||
    mode !== initial.mode ||
    idleHours !== String(initial.idleHours) ||
    maxReminders !== String(initial.maxReminders) ||
    intervalHours !== String(initial.intervalHours);

  return (
    <form action={formAction} className="space-y-4">
      {/* Los checkboxes no envían nada cuando están apagados → hidden espejo. */}
      <input type="hidden" name="enabled" value={enabled ? "1" : "0"} />

      <label className="text-brand-purple-dark flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-brand-purple h-4 w-4"
        />
        Módulo activo (apagarlo frena TODO: ni cron ni envíos manuales)
      </label>

      <fieldset className="border-brand-purple/10 rounded-xl border p-4">
        <legend className="text-brand-purple-dark px-1 text-sm font-semibold">
          ¿Quién envía los recordatorios?
        </legend>
        <div className="space-y-2">
          <label className="text-brand-purple-dark flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              value="automatic"
              checked={mode === "automatic"}
              onChange={() => setMode("automatic")}
              className="accent-brand-purple mt-0.5 h-4 w-4"
            />
            <span>
              <strong>Automático</strong> — el cron envía solo, con los ritmos de abajo.{" "}
              <span className="text-brand-muted">
                Igual puedes enviar a voluntad desde la bandeja.
              </span>
            </span>
          </label>
          <label className="text-brand-purple-dark flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              value="manual"
              checked={mode === "manual"}
              onChange={() => setMode("manual")}
              className="accent-brand-purple mt-0.5 h-4 w-4"
            />
            <span>
              <strong>Manual</strong> — el cron no envía nada: cada recordatorio sale solo cuando lo
              lanzas desde la bandeja (por fila o por selección).
            </span>
          </label>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-brand-purple-dark block text-sm font-semibold">
          Horas de inactividad
          <input
            type="number"
            name="idleHours"
            min={1}
            max={168}
            step={1}
            required
            value={idleHours}
            onChange={(e) => setIdleHours(e.target.value)}
            className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
          />
          <span className="text-brand-muted mt-1 block text-xs font-normal">
            Tiempo sin actividad antes de considerar el carrito abandonado (modo automático).
          </span>
        </label>
        <label className="text-brand-purple-dark block text-sm font-semibold">
          Recordatorios máximos
          <input
            type="number"
            name="maxReminders"
            min={1}
            max={5}
            step={1}
            required
            value={maxReminders}
            onChange={(e) => setMaxReminders(e.target.value)}
            className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
          />
          <span className="text-brand-muted mt-1 block text-xs font-normal">
            Por carrito (modo automático). 1 = un solo recordatorio.
          </span>
        </label>
        <label className="text-brand-purple-dark block text-sm font-semibold">
          Horas entre recordatorios
          <input
            type="number"
            name="intervalHours"
            min={1}
            max={168}
            step={1}
            required
            value={intervalHours}
            onChange={(e) => setIntervalHours(e.target.value)}
            className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
          />
          <span className="text-brand-muted mt-1 block text-xs font-normal">
            Mínimo entre envíos al mismo carrito. También es la anti-duplicación del envío manual.
          </span>
        </label>
      </div>

      {dirty && !pending && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          ⚠️ Tienes cambios sin guardar — NO aplican hasta que pulses «Guardar configuración».
        </p>
      )}
      {state?.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state?.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          ✓ {state.ok}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending || !dirty}
        className="bg-brand-purple-dark text-white hover:brightness-110"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando…
          </>
        ) : dirty ? (
          "Guardar configuración"
        ) : (
          "Sin cambios por guardar"
        )}
      </Button>
    </form>
  );
}
