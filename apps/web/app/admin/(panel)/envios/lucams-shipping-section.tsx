"use client";

/*
 * Subsección "Envío propio Lucam's" de /admin/envios: configura la mensajería
 * interna (precio, hora límite de entrega mismo día y zonas de entrega
 * AGRUPADAS POR CIUDAD — catálogo lib/lucams-zones.ts). El on/off NO se edita
 * acá: vive en la lista unificada de transportadoras.
 */

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LUCAMS_ZONE_CITIES } from "@/lib/lucams-zones";
import { saveLucamsShippingAction, type LucamsShippingActionState } from "./actions";

export function LucamsShippingSection({
  initial,
}: {
  initial: {
    pricePesos: number;
    cutoffHour: number;
    /** Zonas habilitadas por ciudad ({ cityCode: [zoneId] }). */
    zones: Record<string, string[]>;
  };
}) {
  const [state, formAction, pending] = useActionState<LucamsShippingActionState | null, FormData>(
    saveLucamsShippingAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-brand-purple-dark block text-sm font-semibold">
          Precio (pesos COP)
          <input
            type="number"
            name="pricePesos"
            min={0}
            max={100000}
            step={500}
            required
            defaultValue={initial.pricePesos}
            className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
          />
          <span className="text-brand-muted mt-1 block text-xs font-normal">
            Precio fijo para el cliente, sin importar la zona.
          </span>
        </label>
        <label className="text-brand-purple-dark block text-sm font-semibold">
          Hora límite «entrega hoy»
          <select
            name="cutoffHour"
            defaultValue={String(initial.cutoffHour)}
            className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
          <span className="text-brand-muted mt-1 block text-xs font-normal">
            Pedidos antes de esta hora (Colombia) entran a producción el mismo día; a esta hora o
            después, el siguiente día hábil. La entrega es el día que termina la fabricación:
            «Entrega hoy» solo aplica a productos listos (sin fabricación pendiente) pedidos antes
            de la hora límite.
          </span>
        </label>
      </div>

      <fieldset>
        <legend className="text-brand-purple-dark text-sm font-semibold">
          Zonas de entrega habilitadas
        </legend>
        <p className="text-brand-muted mb-2 text-xs">
          Estas zonas solo controlan si la oferta «Envío Lucam&rsquo;s» aparece en el paso de envío
          del checkout. La localidad se pide siempre como dato de dirección en el paso de datos,
          haya o no zonas habilitadas. El on/off del servicio se maneja en la lista de
          transportadoras de arriba.
        </p>
        <div className="space-y-3">
          {LUCAMS_ZONE_CITIES.map((city) => (
            <div key={city.cityCode}>
              <p className="text-brand-purple-dark text-xs font-bold">
                {city.cityName} · {city.zoneLabel}s
              </p>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                {city.zones.map((z) => (
                  <label
                    key={z.id}
                    className="text-brand-purple-dark flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="zone"
                      value={`${city.cityCode}:${z.id}`}
                      defaultChecked={(initial.zones[city.cityCode] ?? []).includes(z.id)}
                      className="accent-brand-purple h-3.5 w-3.5"
                    />
                    {z.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      {state?.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}

      <Button
        type="submit"
        disabled={pending}
        className="bg-brand-purple-dark text-white hover:brightness-110"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando…
          </>
        ) : (
          "Guardar configuración"
        )}
      </Button>
    </form>
  );
}
