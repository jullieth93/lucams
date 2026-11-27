"use client";

/*
 * SceneTextureLoadingOverlay — overlay ligero de carga de texturas 3D.
 *
 * Aislado en su propio módulo para cargarse con `next/dynamic` únicamente al abrir
 * una escena WebGL, evitando arrastrar `@react-three/drei` (y `three`) al chunk
 * inicial del Estudio 2D (Fase 5 · #19).
 */

import { Loader2 } from "lucide-react";
import { useProgress } from "@react-three/drei";
import { useStudioTexts } from "./studio-texts-provider";

export function SceneTextureLoadingOverlay() {
  const active = useProgress((s) => s.active);
  const texts = useStudioTexts();
  if (!active) return null;
  return (
    <div
      role="status"
      className="text-brand-purple-dark pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 text-sm font-semibold"
    >
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span>{texts.escenas.armando}</span>
    </div>
  );
}
