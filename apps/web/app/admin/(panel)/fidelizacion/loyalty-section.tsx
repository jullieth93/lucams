"use client";

/*
 * Subsección "Puntos Lucams" de /admin/fidelizacion: tasas de acumulación y
 * redención, mínimo, tope %, toggle del programa y expiración (preparada, sin
 * efecto). Campos CONTROLADOS + indicador "Cambios sin guardar" (mismo patrón
 * que lucams-shipping-section.tsx, Paquete G).
 */

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveLoyaltySettingsAction, type LoyaltyActionState } from "./actions";
import type { LoyaltySettings } from "@/features/loyalty/settings";

export function LoyaltySection({ initial }: { initial: LoyaltySettings }) {
  const [state, formAction, pending] = useActionState<LoyaltyActionState | null, FormData>(
    saveLoyaltySettingsAction,
    null,
  );

  const [enabled, setEnabled] = useState(initial.enabled);
  const [earnCopPerPoint, setEarnCopPerPoint] = useState(String(initial.earnCopPerPoint));
  const [redeemPointsPer1000, setRedeemPointsPer1000] = useState(
    String(initial.redeemPointsPer1000),
  );
  const [redeemMinPoints, setRedeemMinPoints] = useState(String(initial.redeemMinPoints));
  const [redeemMaxPercent, setRedeemMaxPercent] = useState(String(initial.redeemMaxPercent));
  const [expirationEnabled, setExpirationEnabled] = useState(initial.expirationEnabled);
  const [expirationDays, setExpirationDays] = useState(String(initial.expirationDays));

  // Re-sincroniza cuando el server re-renderiza con las settings ya guardadas
  // (patrón oficial "adjust state during render"; si el guardado FALLA, initial
  // no cambia y se conservan las ediciones del admin).
  const initialKey = JSON.stringify(initial);
  const [prevInitialKey, setPrevInitialKey] = useState(initialKey);
  if (prevInitialKey !== initialKey) {
    setPrevInitialKey(initialKey);
    setEnabled(initial.enabled);
    setEarnCopPerPoint(String(initial.earnCopPerPoint));
    setRedeemPointsPer1000(String(initial.redeemPointsPer1000));
    setRedeemMinPoints(String(initial.redeemMinPoints));
    setRedeemMaxPercent(String(initial.redeemMaxPercent));
    setExpirationEnabled(initial.expirationEnabled);
    setExpirationDays(String(initial.expirationDays));
  }

  const dirty =
    enabled !== initial.enabled ||
    earnCopPerPoint !== String(initial.earnCopPerPoint) ||
    redeemPointsPer1000 !== String(initial.redeemPointsPer1000) ||
    redeemMinPoints !== String(initial.redeemMinPoints) ||
    redeemMaxPercent !== String(initial.redeemMaxPercent) ||
    expirationEnabled !== initial.expirationEnabled ||
    expirationDays !== String(initial.expirationDays);

  return (
    <form action={formAction} className="space-y-4">
      {/* Los checkboxes no envían nada cuando están apagados → hidden espejo. */}
      <input type="hidden" name="enabled" value={enabled ? "1" : "0"} />
      <input type="hidden" name="expirationEnabled" value={expirationEnabled ? "1" : "0"} />

      <label className="text-brand-purple-dark flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-brand-purple h-4 w-4"
        />
        Programa activo (los clientes acumulan puntos al pagar y pueden redimirlos en el checkout)
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-brand-purple-dark block text-sm font-semibold">
          Pesos pagados por punto
          <input
            type="number"
            name="earnCopPerPoint"
            min={100}
            max={1000000}
            step={100}
            required
            value={earnCopPerPoint}
            onChange={(e) => setEarnCopPerPoint(e.target.value)}
            className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
          />
          <span className="text-brand-muted mt-1 block text-xs font-normal">
            1.000 = 1 punto por cada $1.000 del total pagado (se redondea hacia abajo).
          </span>
        </label>
        <label className="text-brand-purple-dark block text-sm font-semibold">
          Puntos por $1.000 de descuento
          <input
            type="number"
            name="redeemPointsPer1000"
            min={1}
            max={100000}
            step={1}
            required
            value={redeemPointsPer1000}
            onChange={(e) => setRedeemPointsPer1000(e.target.value)}
            className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
          />
          <span className="text-brand-muted mt-1 block text-xs font-normal">
            100 = cada 100 puntos valen $1.000 COP de descuento al redimir.
          </span>
        </label>
        <label className="text-brand-purple-dark block text-sm font-semibold">
          Mínimo de puntos por redención
          <input
            type="number"
            name="redeemMinPoints"
            min={1}
            max={1000000}
            step={1}
            required
            value={redeemMinPoints}
            onChange={(e) => setRedeemMinPoints(e.target.value)}
            className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
          />
        </label>
        <label className="text-brand-purple-dark block text-sm font-semibold">
          Tope de redención (% del subtotal)
          <input
            type="number"
            name="redeemMaxPercent"
            min={0}
            max={100}
            step={5}
            required
            value={redeemMaxPercent}
            onChange={(e) => setRedeemMaxPercent(e.target.value)}
            className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
          />
          <span className="text-brand-muted mt-1 block text-xs font-normal">
            % máximo del subtotal de productos (después del cupón) pagadero con puntos. El envío
            nunca se cubre con puntos.
          </span>
        </label>
      </div>

      <fieldset className="border-brand-purple/10 rounded-xl border p-4">
        <legend className="text-brand-purple-dark px-1 text-sm font-semibold">
          Expiración de puntos (preparada — sin efecto todavía)
        </legend>
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-brand-purple-dark flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={expirationEnabled}
              onChange={(e) => setExpirationEnabled(e.target.checked)}
              className="accent-brand-purple h-4 w-4"
            />
            Expiración activa
          </label>
          <label className="text-brand-purple-dark flex items-center gap-2 text-sm">
            Días de vigencia
            <input
              type="number"
              name="expirationDays"
              min={1}
              max={3650}
              step={1}
              required
              value={expirationDays}
              onChange={(e) => setExpirationDays(e.target.value)}
              className="border-brand-purple/25 w-24 rounded-xl border-2 px-3 py-1.5 text-sm outline-none"
            />
          </label>
        </div>
        <p className="text-brand-muted mt-2 text-xs">
          No hay proceso que venza puntos todavía: activarla hoy no cambia nada. Cuando se
          implemente, estos valores quedan operativos sin más cambios.
        </p>
      </fieldset>

      {dirty && !pending && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          ⚠️ Tienes cambios sin guardar — NO aplican en la tienda hasta que pulses «Guardar
          configuración».
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
