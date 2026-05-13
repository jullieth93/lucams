"use client";

/*
 * <Reveal> — envuelve hijos en un div que aparece con fade + slide-up
 * cuando entra al viewport. Usa IntersectionObserver una sola vez.
 *
 * Respeta `prefers-reduced-motion`: si el usuario lo activó, los
 * hijos aparecen instantáneamente sin animación.
 *
 * Uso:
 *   <Reveal delay={100}>
 *     <SomeSection />
 *   </Reveal>
 *
 * El delay es para cascading: si pones varias secciones consecutivas
 * con delay 0/100/200, aparecen en cascada cuando llegan al viewport.
 */

import { useEffect, useRef, useState } from "react";

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      queueMicrotask(() => setVisible(true));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setTimeout(() => setVisible(true), delay);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={
        className +
        " transition-all duration-700 ease-out " +
        (visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0")
      }
    >
      {children}
    </div>
  );
}
