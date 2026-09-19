/*
 * Gate de autoplay por visibilidad (INP) — frena el autoplay de Embla cuando el
 * carrusel sale del viewport y lo reanuda al volver SOLO si estaba sonando.
 *
 * Por qué: con autoplay permanente, cada tick hace scroll + setState (dots) cada
 * N segundos aunque el carrusel esté fuera de pantalla; si el tick cae junto a
 * una interacción del usuario, el handler espera y el INP se dispara (Vercel
 * Speed Insights lo atribuyó al <main> de la home). El caso "pestaña oculta" ya
 * lo cubre el plugin (visibilitychange); esto cubre "pestaña visible, carrusel
 * fuera de pantalla". WCAG 2.2.2 intacto: el botón pausa/play y la pausa por
 * hover (stopOnMouseEnter) siguen funcionando igual.
 */

import { useEffect, useRef } from "react";
import type useEmblaCarousel from "embla-carousel-react";

// `embla-carousel` no es dependencia directa: el tipo se deriva del wrapper React.
type EmblaApi = ReturnType<typeof useEmblaCarousel>[1];

export function useAutoplayWhenVisible(
  emblaApi: EmblaApi,
  rootRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  // ¿Estaba sonando antes de salir del viewport? Si el usuario pausó a mano
  // (botón) NO se reanuda solo al volver a entrar.
  const wasPlayingRef = useRef(false);
  const inViewportRef = useRef(true);

  useEffect(() => {
    if (!emblaApi || !enabled) return;
    const autoplay = emblaApi.plugins().autoplay;
    const root = rootRef.current;
    if (!autoplay || !root || typeof IntersectionObserver === "undefined") return;

    // Carrera hover+scroll: stopOnMouseEnter reanuda en mouseleave aunque el
    // carrusel ya haya salido de pantalla; si suena estando fuera, lo frenamos
    // de nuevo (microtask: el plugin arma su timer DESPUÉS de emitir el evento).
    const onPlay = () => {
      queueMicrotask(() => {
        if (!inViewportRef.current && autoplay.isPlaying()) autoplay.stop();
      });
    };
    emblaApi.on("autoplay:play", onPlay);

    const obs = new IntersectionObserver(([entry]) => {
      inViewportRef.current = entry.isIntersecting;
      if (!entry.isIntersecting) {
        wasPlayingRef.current = autoplay.isPlaying();
        autoplay.stop();
      } else if (wasPlayingRef.current) {
        wasPlayingRef.current = false;
        autoplay.play();
      }
    });
    obs.observe(root);

    return () => {
      obs.disconnect();
      emblaApi.off("autoplay:play", onPlay);
    };
  }, [emblaApi, rootRef, enabled]);
}
