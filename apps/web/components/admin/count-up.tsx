/*
 * <CountUp> — número que cuenta de 0 a `value` al entrar en viewport
 * (framer-motion spring; formato es-CO con separador de miles).
 *
 * Wow del panel admin (2026-10): los KPIs y OpsCards del dashboard eran
 * estáticos. Con `useInView(once)` la animación corre una sola vez por
 * montaje; con prefers-reduced-motion el valor se imprime directo, sin
 * animar. Solo para valores numéricos — los strings ("—", "12 h") pasan
 * por el caller sin envolver.
 */

"use client";

import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-24px" });
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { duration: 900, bounce: 0 });

  useEffect(() => {
    if (inView) motionValue.set(value);
  }, [inView, value, motionValue]);

  useEffect(() => {
    const render = (latest: number) => {
      if (ref.current) ref.current.textContent = Math.round(latest).toLocaleString("es-CO");
    };
    if (reduceMotion) {
      render(value);
      return;
    }
    render(spring.get());
    return spring.on("change", render);
  }, [spring, value, reduceMotion]);

  return (
    <span ref={ref} className={className}>
      {value.toLocaleString("es-CO")}
    </span>
  );
}
