/*
 * <LucamsLogo /> — wrapper que muestra el logo oficial Lucams si está
 * disponible en /public/brand/, o cae al SVG kawaii placeholder.
 *
 * Convención de archivos (ver apps/web/public/brand/README.md):
 *   /public/brand/lucams-logo.png    → logo completo (insignia + texto)
 *   /public/brand/lucams-mascot.png  → solo mapache recortado
 *
 * Variante:
 *   - "full":   logo completo. Usar en hero, 404, emails, redes sociales.
 *   - "mascot": solo el mapache. Usar en headers chicos junto al wordmark.
 *
 * Fallback:
 *   Si el archivo aún no fue subido, mostramos el RaccoonFace SVG
 *   kawaii custom como placeholder. Cuando llega el asset oficial,
 *   este componente lo detecta automáticamente.
 *
 * Implementación: usamos next/image con `unoptimized` para SVG (el
 * optimizer de Next no maneja SVG por default) y dejamos que Next
 * sirva el path. Si el archivo no existe en /public/brand/, Next
 * tira 404 al request — capturamos eso con un onError handler.
 */

"use client";

import Image from "next/image";
import { useState } from "react";
import { RaccoonFace } from "@/components/brand-mark";

type Variant = "full" | "mascot";

const SOURCES: Record<Variant, { png: string; svg: string; alt: string }> = {
  full: {
    svg: "/brand/lucams-logo.svg",
    png: "/brand/lucams-logo.png",
    alt: "Logo Lucams_shop",
  },
  mascot: {
    svg: "/brand/lucams-mascot.svg",
    png: "/brand/lucams-mascot.png",
    alt: "Mascota Lucams_shop",
  },
};

export function LucamsLogo({
  variant = "full",
  size = 96,
  className,
  priority = false,
}: {
  variant?: Variant;
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  // Estado: tracker de qué source intentar. svg → png → fallback SVG inline.
  const [step, setStep] = useState<"svg" | "png" | "fallback">("svg");

  if (step === "fallback") {
    // Fallback: el SVG kawaii dentro del badge purple+ring (look anterior).
    return (
      <span
        aria-hidden="true"
        className={[
          "bg-brand-purple ring-brand-yellow inline-flex items-center justify-center rounded-full shadow-lg ring-4",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ width: size, height: size }}
      >
        <span style={{ width: "78%", height: "78%" }}>
          <RaccoonFace />
        </span>
      </span>
    );
  }

  const src = step === "svg" ? SOURCES[variant].svg : SOURCES[variant].png;

  return (
    <Image
      src={src}
      alt={SOURCES[variant].alt}
      width={size}
      height={size}
      priority={priority}
      className={className}
      unoptimized={step === "svg"}
      onError={() => setStep(step === "svg" ? "png" : "fallback")}
    />
  );
}
