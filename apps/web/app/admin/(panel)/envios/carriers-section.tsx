"use client";

/*
 * Sección "Transportadoras" de /admin/envios: lista UNIFICADA de lo que el
 * checkout puede ofrecer — las transportadoras de la cuenta Aveonline
 * (toggle → SHIPPING_DISABLED_CARRIERS) + el envío propio "Envío Lucam's"
 * como una transportadora más (badge «Propio», toggle →
 * LUCAMS_SHIPPING_ENABLED; su precio/cutoff/zonas se configuran abajo).
 */

import { useActionState, useState, useTransition } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { carrierLogo } from "@/lib/carrier-logos";
import {
  setCarrierDisabledAction,
  setLucamsShippingEnabledAction,
  type LucamsShippingActionState,
} from "./actions";

export type CarrierRow = {
  id: number;
  text: string;
  disabled: boolean;
};

export function CarriersSection({
  carriers,
  lucamsEnabled,
}: {
  carriers: CarrierRow[];
  /** Estado actual del envío propio (LUCAMS_SHIPPING_ENABLED). */
  lucamsEnabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [lucamsState, lucamsAction, lucamsPending] = useActionState<
    LucamsShippingActionState | null,
    FormData
  >(setLucamsShippingEnabledAction, null);
  const [aveonlineError, setAveonlineError] = useState<string | null>(null);

  function toggle(carrierName: string, disable: boolean) {
    setAveonlineError(null);
    const fd = new FormData();
    fd.set("carrierName", carrierName);
    fd.set("disable", disable ? "1" : "0");
    startTransition(async () => {
      try {
        await setCarrierDisabledAction(fd);
      } catch {
        setAveonlineError(
          "No se pudo cambiar la transportadora. Recarga la página e intenta de nuevo.",
        );
      }
    });
  }

  return (
    <div>
      <ul className="divide-brand-purple/10 divide-y">
        {/* Envío propio — una transportadora más de la lista (badge «Propio»). */}
        <li className="flex items-center justify-between gap-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <CarrierLogoMark carrier="lucams" />
            <div className="min-w-0">
              <p className="text-brand-purple-dark text-sm font-semibold">
                Envío Lucam&apos;s{" "}
                <span className="bg-brand-turquoise/40 ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-teal-900">
                  Propio
                </span>
              </p>
              <p className="text-brand-muted text-xs">
                {lucamsEnabled
                  ? "Se ofrece en el checkout para las zonas habilitadas (config abajo)."
                  : "Mensajería interna por zonas — desactivado."}
              </p>
            </div>
          </div>
          <form action={lucamsAction} className="flex-shrink-0">
            <input type="hidden" name="enable" value={lucamsEnabled ? "0" : "1"} />
            <button
              type="submit"
              role="switch"
              aria-checked={lucamsEnabled}
              disabled={lucamsPending}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 " +
                (lucamsEnabled
                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                  : "bg-slate-200 text-slate-700 hover:bg-slate-300")
              }
            >
              {lucamsPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {lucamsEnabled ? "Habilitada" : "Deshabilitada"}
            </button>
          </form>
        </li>

        {carriers.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <CarrierLogoMark carrier={c.text} />
              <div className="min-w-0">
                <p className="text-brand-purple-dark text-sm font-semibold">{c.text}</p>
                <p className="text-brand-muted text-xs">
                  {c.disabled
                    ? "No se ofrece al cliente en el checkout."
                    : "Se ofrece al cliente cuando cotiza la ruta."}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!c.disabled}
              disabled={pending}
              onClick={() => toggle(c.text, !c.disabled)}
              className={
                "inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 " +
                (c.disabled
                  ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200")
              }
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {c.disabled ? "Deshabilitada" : "Habilitada"}
            </button>
          </li>
        ))}
      </ul>
      {lucamsState?.error && <p className="mt-2 text-xs text-rose-600">{lucamsState.error}</p>}
      {lucamsState?.ok && <p className="mt-2 text-xs text-emerald-700">{lucamsState.ok}</p>}
      {aveonlineError && <p className="mt-2 text-xs text-rose-600">{aveonlineError}</p>}
    </div>
  );
}

/** Logo de la transportadora junto al nombre (mismo mapa que el checkout).
 *  Null (sin logo en el mapa) → no se renderiza nada. */
function CarrierLogoMark({ carrier }: { carrier: string }) {
  const logo = carrierLogo(carrier);
  if (!logo) return null;
  return (
    <span className="border-brand-purple/10 flex h-8 flex-shrink-0 items-center justify-center rounded-md border bg-white px-1.5">
      <Image
        src={logo.src}
        alt={logo.alt}
        width={logo.width}
        height={logo.height}
        unoptimized={logo.src.endsWith(".svg")}
        className="h-5 w-auto max-w-20 object-contain"
      />
    </span>
  );
}
