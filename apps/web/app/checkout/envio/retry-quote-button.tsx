"use client";

/*
 * #25 (auditoría v3) — CTA "Intentar de nuevo" para el fallo de cotización de envío. La página es RSC
 * y no puede llamar router.refresh() directo, así que este client component lo envuelve. router.refresh()
 * re-hace la petición de datos del route actual y re-renderiza los Server Components (re-cotiza) sin
 * recargar la página ni perder estado — a diferencia de un <Link> a la misma URL, que puede ser no-op.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RetryQuoteButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="bg-brand-purple hover:bg-brand-purple-dark gap-1.5 text-white"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} aria-hidden />
      {pending ? "Reintentando…" : "Intentar de nuevo"}
    </Button>
  );
}
