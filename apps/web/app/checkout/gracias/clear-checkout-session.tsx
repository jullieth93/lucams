"use client";

import { useEffect } from "react";
import { clearCheckoutSessionAction } from "./actions";

/**
 * Dispara el borrado de la cookie de checkout al montar (no renderiza nada).
 * Reemplaza el `finishCheckoutSession()` que la página RSC llamaba en render
 * y que tiraba la página completa (cookies solo mutables en Server Action).
 */
export function ClearCheckoutSession() {
  useEffect(() => {
    void clearCheckoutSessionAction();
  }, []);
  return null;
}
