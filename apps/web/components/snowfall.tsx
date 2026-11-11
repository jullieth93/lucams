"use client";

/*
 * <Snowfall> — caída de nieve a pantalla completa (tema Navidad), activable
 * desde /admin/contenido/paginas/inicio → «Efectos de temporada» (setting
 * CMS `home.seasonal.snowfall`, owner 2026-11-11).
 *
 * Implementación ligera: UN <canvas> fixed con ~90 copos en Canvas2D
 * (pointer-events: none, sin librerías). Se pausa con la pestaña oculta,
 * se redibuja al redimensionar y NO se monta con prefers-reduced-motion
 * (accesibilidad) ni en /admin (estorba el panel) ni en /estudio (el lienzo
 * de diseño necesita precisión visual sin distracciones).
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type Flake = { x: number; y: number; r: number; speed: number; drift: number; phase: number };

const FLAKE_COUNT = 90;

export function Snowfall() {
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const excluded = pathname?.startsWith("/admin") || pathname?.startsWith("/estudio");

  useEffect(() => {
    if (reduced || excluded) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const flakes: Flake[] = [];

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < FLAKE_COUNT; i++) {
      flakes.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: 1.4 + Math.random() * 2.8,
        speed: 0.35 + Math.random() * 0.9,
        drift: 0.25 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const tick = (time: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      for (const f of flakes) {
        f.y += f.speed;
        f.x += Math.sin(time / 1400 + f.phase) * f.drift * 0.4;
        if (f.y > h + f.r) {
          f.y = -f.r;
          f.x = Math.random() * w;
        }
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Pausa con la pestaña oculta (ahorro de batería/GPU).
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced, excluded]);

  if (reduced || excluded) return null;

  return (
    <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-30" />
  );
}
