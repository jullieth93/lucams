"use client";

/*
 * Subsección "Invita y gana" de /admin/fidelizacion: % OFF de los cupones
 * personales (bienvenida del referido + premio del referente), días de
 * vigencia y toggle del programa.
 *
 * Recordatorio de negocio (también en el copy de la página): los cupones YA
 * EMITIDOS conservan sus términos — cada Coupon persiste su value/validTo al
 * crearse; el cambio de % aplica solo a emisiones futuras. Para la promo del
 * 25%: sube el % acá y reviértelo cuando termine la campaña (el patrón de
 * settings no tiene rangos de fecha).
 */

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveReferralSettingsAction, type LoyaltyActionState } from "./actions";
import type { ReferralSettings } from "@/features/loyalty/settings";

export function ReferralsSection({ initial }: { initial: ReferralSettings }) {
  const [state, formAction, pending] = useActionState<LoyaltyActionState | null, FormData>(
    saveReferralSettingsAction,
    null,
  );

  const [enabled, setEnabled] = useState(initial.enabled);
  const [rewardPercent, setRewardPercent] = useState(String(initial.rewardPercent));
  const [rewardDays, setRewardDays] = useState(String(initial.rewardDays));

  // Re-sincroniza tras un guardado OK (patrón "adjust state during render").
  const initialKey = JSON.stringify(initial);
  const [prevInitialKey, setPrevInitialKey] = useState(initialKey);
  if (prevInitialKey !== initialKey) {
    setPrevInitialKey(initialKey);
    setEnabled(initial.enabled);
    setRewardPercent(String(initial.rewardPercent));
    setRewardDays(String(initial.rewardDays));
  }

  const dirty =
    enabled !== initial.enabled ||
    rewardPercent !== String(initial.rewardPercent) ||
    rewardDays !== String(initial.rewardDays);

  return (
    <form action={formAction} className="space-y-4">
      {/* Checkbox apagado no viaja en el FormData → hidden espejo. */}
      <input type="hidden" name="enabled" value={enabled ? "1" : "0"} />

      <label className="text-brand-purple-dark flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-brand-purple h-4 w-4"
        />
        Programa activo (se emiten cupones de bienvenida y de premio)
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-brand-purple-dark block text-sm font-semibold">
          % OFF de la recompensa
          <input
            type="number"
            name="rewardPercent"
            min={1}
            max={100}
            step={1}
            required
            value={rewardPercent}
            onChange={(e) => setRewardPercent(e.target.value)}
            className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
          />
          <span className="text-brand-muted mt-1 block text-xs font-normal">
            Para la promoción del 25%: escribe 25 acá y vuelve a 10 cuando termine la campaña. Los
            cupones ya emitidos conservan el % con que se crearon.
          </span>
        </label>
        <label className="text-brand-purple-dark block text-sm font-semibold">
          Días de vigencia del cupón
          <input
            type="number"
            name="rewardDays"
            min={1}
            max={3650}
            step={1}
            required
            value={rewardDays}
            onChange={(e) => setRewardDays(e.target.value)}
            className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
          />
          <span className="text-brand-muted mt-1 block text-xs font-normal">
            Vigencia de los cupones emitidos desde ahora. Los ya emitidos conservan su fecha de
            vencimiento.
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
