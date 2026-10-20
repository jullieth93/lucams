"use client";

/*
 * Auto-refresh para estados transitorios de /checkout/gracias (PENDING de PSE,
 * "estamos verificando", fallo transitorio de consulta a Wompi).
 *
 * Incidente LCM-2026-0001 (PRD 2026-10-19): el cliente volvió de PSE mientras la
 * transacción aún no se confirmaba y la página quedó estática en un mensaje que
 * leyó como "pago no completado", aunque el webhook confirmó el pago ~1 minuto
 * después. Con refresh automático la página converge sola al estado real.
 *
 * El intervalo (30 s) respeta el rate-limit de la página (20 req / 5 min por IP:
 * ~10 consultas reales a Wompi por ventana) y se detiene tras `maxRefreshes`
 * para no sondear indefinidamente si el cliente deja la pestaña abierta.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function AutoRefresh({
  intervalMs = 30_000,
  maxRefreshes = 20,
}: {
  intervalMs?: number;
  maxRefreshes?: number;
}) {
  const router = useRouter();
  const count = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      count.current += 1;
      if (count.current > maxRefreshes) {
        clearInterval(t);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, maxRefreshes, router]);
  return null;
}
