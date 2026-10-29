/*
 * <AuthScene> — fondo animado compartido de las pantallas de autenticación
 * (login admin, MFA, login/registro/OTP/recuperar de clientes).
 *
 * Decoración pura (aria-hidden, pointer-events-none): tres blobs de marca que
 * derivan en loop lento + destellos que titilan. Toda la animación es CSS
 * (globals.css: auth-drift-*, auth-twinkle) — sin JS, y el bloque global de
 * prefers-reduced-motion la deja estática.
 *
 * variant="dark"  → sobre el gradiente morado oscuro del login admin
 *                   (blobs vivos, sparkles blancos).
 * variant="light" → sobre el gradiente cream/blanco del auth de clientes
 *                   (blobs suaves, sparkles brand).
 */

import { Sparkles } from "lucide-react";

export function AuthScene({ variant = "light" }: { variant?: "light" | "dark" }) {
  const dark = variant === "dark";
  return (
    <div aria-hidden="true" className="auth-scene">
      {/* Blobs de color en deriva lenta */}
      <div
        className={`auth-blob auth-drift-a -top-28 -right-28 h-96 w-96 ${
          dark ? "bg-brand-pink/35" : "bg-brand-pink/25"
        }`}
      />
      <div
        className={`auth-blob auth-drift-b -bottom-32 -left-32 h-[26rem] w-[26rem] ${
          dark ? "bg-brand-turquoise/30" : "bg-brand-turquoise/25"
        }`}
      />
      <div
        className={`auth-blob auth-drift-c top-1/3 left-1/2 h-72 w-72 ${
          dark ? "bg-brand-coral/25" : "bg-brand-yellow/25"
        }`}
      />
      {/* Destellos que titilan (posiciones fijas pensadas para no tapar el form) */}
      <Sparkles
        className={`auth-sparkle top-[12%] left-[10%] h-5 w-5 ${
          dark ? "text-white" : "text-brand-purple"
        }`}
      />
      <Sparkles
        className={`auth-sparkle top-[22%] right-[14%] h-4 w-4 ${
          dark ? "text-brand-yellow" : "text-brand-pink"
        }`}
        style={{ animationDelay: "0.9s" }}
      />
      <Sparkles
        className={`auth-sparkle bottom-[18%] left-[18%] h-4 w-4 ${
          dark ? "text-brand-turquoise" : "text-brand-coral"
        }`}
        style={{ animationDelay: "1.7s" }}
      />
      <Sparkles
        className={`auth-sparkle right-[8%] bottom-[26%] h-6 w-6 ${
          dark ? "text-white" : "text-brand-turquoise"
        }`}
        style={{ animationDelay: "2.4s" }}
      />
    </div>
  );
}
