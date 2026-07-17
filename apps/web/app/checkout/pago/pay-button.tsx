"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Loader2, Lock, Wallet, CreditCard, CheckCircle2, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { payWompiAction, payCodAction } from "./actions";

type Method = "WOMPI" | "COD";

function SubmitButton({ method }: { method: Method }) {
  const { pending } = useFormStatus();
  if (method === "COD") {
    return (
      <Button
        type="submit"
        disabled={pending}
        size="lg"
        className="bg-gradient-brand w-full text-white hover:brightness-110 sm:w-auto"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirmando tu pedido…
          </>
        ) : (
          <>
            <Banknote className="mr-2 h-4 w-4" />
            Confirmar pedido (pago al recibir)
          </>
        )}
      </Button>
    );
  }
  return (
    <Button
      type="submit"
      disabled={pending}
      size="lg"
      className="bg-gradient-brand w-full text-white hover:brightness-110 sm:w-auto"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirigiendo a Wompi…
        </>
      ) : (
        <>
          <Lock className="mr-2 h-4 w-4" />
          Pagar con Wompi
        </>
      )}
    </Button>
  );
}

function MethodCard({
  selected,
  onSelect,
  icon,
  title,
  desc,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
        selected
          ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 ring-2"
          : "border-brand-purple/15 hover:border-brand-purple/40"
      }`}
    >
      <span className={selected ? "text-brand-purple" : "text-brand-muted"}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="text-brand-purple-dark block text-sm font-semibold">{title}</span>
        <span className="text-brand-muted block text-xs">{desc}</span>
      </span>
      {selected && <CheckCircle2 className="text-brand-purple h-5 w-5 flex-shrink-0" />}
    </button>
  );
}

/**
 * Selector de método de pago: Wompi (online) o contraentrega (efectivo al recibir).
 * Renderiza el botón + <form action> correcto según lo elegido. Sin JS igual funciona
 * el default (Wompi) porque es el estado inicial.
 */
export function PaymentMethodChooser({
  backHref,
  codEnabled = true,
}: {
  backHref: string;
  codEnabled?: boolean;
}) {
  // Si el negocio desactivó COD, el único método es Wompi (no mostramos selector).
  const [method, setMethod] = useState<Method>("WOMPI");
  const activeMethod: Method = codEnabled ? method : "WOMPI";

  return (
    <div>
      {codEnabled && (
        <div
          role="radiogroup"
          aria-label="Método de pago"
          className="mb-4 grid gap-3 sm:grid-cols-2"
        >
          <MethodCard
            selected={method === "WOMPI"}
            onSelect={() => setMethod("WOMPI")}
            icon={<CreditCard className="h-6 w-6" />}
            title="Pagar con Wompi"
            desc="Tarjeta · PSE · Nequi · Bancolombia"
          />
          <MethodCard
            selected={method === "COD"}
            onSelect={() => setMethod("COD")}
            icon={<Wallet className="h-6 w-6" />}
            title="Pago contra entrega"
            desc="Pagas en efectivo al recibir"
          />
        </div>
      )}

      <div className="text-brand-muted mb-4 flex items-start gap-2 text-xs">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
        {activeMethod === "WOMPI" ? (
          <span>
            Al pagar serás redirigido a Wompi (Bancolombia). Tu información bancaria nunca pasa por
            Lucams.
          </span>
        ) : (
          <span>
            Confirmamos tu pedido de una vez y el mensajero te lo entrega. Pagas el total en
            efectivo al recibir — sin tarjeta.
          </span>
        )}
      </div>

      <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-between">
        <Link
          href={backHref}
          className="text-brand-purple-dark/70 hover:text-brand-purple-dark text-sm font-medium"
        >
          ← Cambiar envío
        </Link>
        <form action={activeMethod === "WOMPI" ? payWompiAction : payCodAction}>
          {/* Anti-bot: el widget inyecta el input cf-turnstile-response dentro del form;
              el server action lo verifica. En dev sin keys es un input vacío (fail-open). */}
          <TurnstileWidget size="flexible" />
          <SubmitButton method={activeMethod} />
        </form>
      </div>
    </div>
  );
}
