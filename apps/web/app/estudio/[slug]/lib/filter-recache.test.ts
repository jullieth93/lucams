/*
 * Tests del planificador de re-cache de filtros (Paquete J, 2026-10-02).
 * Congela la regla central del fix de INP en el zoom: durante el gesto NO se
 * re-corren los filtros Konva (un solo re-cache debounceado al terminar);
 * cambiar de foto o de preset sí re-cachea de inmediato.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFilterRecacher, FILTER_RECACHE_DEBOUNCE_MS } from "./filter-recache";

describe("createFilterRecacher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("la primera request aplica de inmediato (no hay cache previo válido)", () => {
    const recacher = createFilterRecacher();
    const apply = vi.fn();
    recacher.request("fotoA|vivid", apply);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("misma key en ráfaga (pasos de zoom) → UN solo apply debounceado", () => {
    const recacher = createFilterRecacher();
    const apply = vi.fn();
    recacher.request("fotoA|vivid", apply); // inmediato (primera)
    expect(apply).toHaveBeenCalledTimes(1);

    // 10 pasos de wheel seguidos: ninguno aplica todavía.
    for (let i = 0; i < 10; i++) {
      recacher.request("fotoA|vivid", apply);
      vi.advanceTimersByTime(FILTER_RECACHE_DEBOUNCE_MS - 50);
    }
    expect(apply).toHaveBeenCalledTimes(1);

    // El gesto termina (pasa el debounce completo sin nuevos pasos) → 1 apply.
    vi.advanceTimersByTime(FILTER_RECACHE_DEBOUNCE_MS);
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("tras el debounce, otro gesto vuelve a debouncear (no queda pegado)", () => {
    const recacher = createFilterRecacher();
    const apply = vi.fn();
    recacher.request("fotoA|vivid", apply);
    recacher.request("fotoA|vivid", apply);
    vi.advanceTimersByTime(FILTER_RECACHE_DEBOUNCE_MS);
    expect(apply).toHaveBeenCalledTimes(2);

    recacher.request("fotoA|vivid", apply);
    expect(apply).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(FILTER_RECACHE_DEBOUNCE_MS);
    expect(apply).toHaveBeenCalledTimes(3);
  });

  it("key nueva (otra foto u otro preset) cancela el debounce y aplica YA", () => {
    const recacher = createFilterRecacher();
    const apply = vi.fn();
    recacher.request("fotoA|vivid", apply);
    recacher.request("fotoA|vivid", apply); // pendiente
    recacher.request("fotoB|vivid", apply); // cambió la foto
    expect(apply).toHaveBeenCalledTimes(2);
    // El pendiente viejo quedó cancelado: el tiempo no dispara otro apply.
    vi.advanceTimersByTime(FILTER_RECACHE_DEBOUNCE_MS * 2);
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("quitar el filtro es key nueva → clearCache inmediato", () => {
    const recacher = createFilterRecacher();
    const apply = vi.fn();
    recacher.request("fotoA|vivid", apply);
    recacher.request("fotoA|none", apply);
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("cancel() evita el apply pendiente (unmount a mitad del gesto)", () => {
    const recacher = createFilterRecacher();
    const apply = vi.fn();
    recacher.request("fotoA|vivid", apply);
    recacher.request("fotoA|vivid", apply);
    recacher.cancel();
    vi.advanceTimersByTime(FILTER_RECACHE_DEBOUNCE_MS * 2);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
