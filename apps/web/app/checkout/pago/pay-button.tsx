"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import nextDynamic from "next/dynamic";
import { Loader2, Lock, Wallet, CreditCard, CheckCircle2, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { WOMPI_METHODS_SHORT } from "@/lib/payment-methods";
import { WOMPI_PAYMENT_LOGOS } from "@/lib/payment-logos";
import { payWompiAction, payCodAction } from "./actions";
import type { CheckoutTexts } from "../checkout-texts";

// Paquete J (2026-10-02) — react-markdown + plugins (~100 KB gz) salen del
// chunk principal del checkout: el bloque de términos se SSR-igual (ssr:true,
// el contenido legal no depende de JS) pero su JS de hidratación es un chunk
// aparte que no compite con la interacción del botón de pago.
const PayTermsMarkdown = nextDynamic(() => import("./pay-terms-markdown"));

type Method = "WOMPI" | "COD";

function SubmitButton({ method, texts }: { method: Method; texts: CheckoutTexts["pay"] }) {
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
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {texts.codPending}
          </>
        ) : (
          <>
            <Banknote className="mr-2 h-4 w-4" />
            {texts.codButton}
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
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {texts.wompiPending}
        </>
      ) : (
        <>
          <Lock className="mr-2 h-4 w-4" />
          {texts.wompiButton}
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
  logos,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
  /** Paquete F (2026-10-02) — fila de badges de los medios incluidos (Wompi). */
  logos?: React.ReactNode;
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
        {logos}
      </span>
      {selected && <CheckCircle2 className="text-brand-purple h-5 w-5 flex-shrink-0" />}
    </button>
  );
}

/**
 * Fila de badges de los medios Wompi (Paquete F): cada logo lleva su alt con
 * la marca; el texto de apoyo (WOMPI_METHODS_SHORT) queda como `desc` de la
 * tarjeta. Wompi es hosted checkout — los métodos se eligen DENTRO de Wompi,
 * así que la fila es informativa, no un selector.
 */
function WompiMethodLogos() {
  return (
    <span className="mt-2 flex flex-wrap items-center gap-1.5">
      {WOMPI_PAYMENT_LOGOS.map((logo) => (
        <Image
          key={logo.src}
          src={logo.src}
          alt={logo.alt}
          width={logo.width}
          height={logo.height}
          unoptimized
          className="h-5 w-auto rounded-[3px]"
        />
      ))}
    </span>
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
  couponInvalidAtRender = false,
  texts,
}: {
  backHref: string;
  codEnabled?: boolean;
  /**
   * El cupón guardado ya estaba inválido al renderizar la página (el resumen mostró precio LLENO).
   * En ese caso el pago debe quitar el cupón obsoleto antes de finalizar y proceder sin rebotar (el
   * cliente ya vio el total real). Si el cupón se invalida en carrera DESPUÉS del render, este flag
   * es false y el backstop atómico lo rebota con aviso (nunca cobramos en silencio un total no visto).
   */
  couponInvalidAtRender?: boolean;
  /** Textos CMS de métodos de pago y legales (roadmap B8). */
  texts: CheckoutTexts["pay"];
}) {
  // Si el negocio desactivó COD, el único método es Wompi (no mostramos selector).
  const [method, setMethod] = useState<Method>("WOMPI");
  const activeMethod: Method = codEnabled ? method : "WOMPI";

  return (
    <div>
      {codEnabled && (
        <div
          role="radiogroup"
          aria-label={texts.methodAria}
          className="mb-4 grid gap-3 sm:grid-cols-2"
        >
          <MethodCard
            selected={method === "WOMPI"}
            onSelect={() => setMethod("WOMPI")}
            icon={<CreditCard className="h-6 w-6" />}
            title={texts.wompiTitle}
            desc={WOMPI_METHODS_SHORT}
            logos={<WompiMethodLogos />}
          />
          <MethodCard
            selected={method === "COD"}
            onSelect={() => setMethod("COD")}
            icon={<Wallet className="h-6 w-6" />}
            title={texts.codTitle}
            desc={texts.codDesc}
          />
        </div>
      )}

      <div className="text-brand-muted mb-4 flex items-start gap-2 text-xs">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
        {activeMethod === "WOMPI" ? <span>{texts.wompiNote}</span> : <span>{texts.codNote}</span>}
      </div>

      {/* Consentimiento de baja fricción (ADR-062 P0-2): al confirmar, el cliente acepta los
          términos —que incluyen la declaración de derechos de imagen— sin checkbox extra. */}
      <div className="text-brand-muted [&_a:hover]:text-brand-purple-dark mb-4 text-[11px] leading-relaxed [&_a]:underline">
        <PayTermsMarkdown terms={texts.terms} />
      </div>

      <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-between">
        <Link
          href={backHref}
          className="text-brand-purple-dark/70 hover:text-brand-purple-dark text-sm font-medium"
        >
          {texts.back}
        </Link>
        <form action={activeMethod === "WOMPI" ? payWompiAction : payCodAction}>
          {/* Anti-bot: el widget inyecta el input cf-turnstile-response dentro del form;
              el server action lo verifica. En dev sin keys es un input vacío (fail-open). */}
          <TurnstileWidget size="flexible" />
          {couponInvalidAtRender && <input type="hidden" name="couponInvalidAtRender" value="1" />}
          <SubmitButton method={activeMethod} texts={texts} />
        </form>
      </div>
    </div>
  );
}
