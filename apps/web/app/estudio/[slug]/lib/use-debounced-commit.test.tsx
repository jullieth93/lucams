// @vitest-environment jsdom

/*
 * Test de useDebouncedCommit (owner 2026-10-12) — el patrón que elimina la
 * lentitud de la plantilla Polaroid Instagram: estado local inmediato en el
 * input + commit al store tras ~350ms sin teclear, al blur o al desmontar
 * (nunca por tecla), y sync externo (undo / «aplicar a todas») sin pisar lo
 * que el cliente está tecleando.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { IG_FIELD_COMMIT_DEBOUNCE_MS, useDebouncedCommit } from "./use-debounced-commit";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(initial = "", debounceMs = IG_FIELD_COMMIT_DEBOUNCE_MS) {
  vi.useFakeTimers();
  const commits: string[] = [];
  const hook = renderHook(
    ({ value }) => useDebouncedCommit(value, (v) => commits.push(v), debounceMs),
    { initialProps: { value: initial } },
  );
  return { commits, ...hook };
}

describe("useDebouncedCommit — commit debounced de los campos IG", () => {
  it("el draft responde de INMEDIATO pero el commit espera el debounce", () => {
    const { result, commits } = setup();

    act(() => result.current.change("B"));
    expect(result.current.draft).toBe("B");
    expect(commits).toEqual([]); // aún no compromete al store

    act(() => result.current.change("Bo"));
    act(() => vi.advanceTimersByTime(IG_FIELD_COMMIT_DEBOUNCE_MS - 50));
    expect(commits).toEqual([]); // la ráfaga reinicia el timer

    act(() => vi.advanceTimersByTime(50));
    expect(commits).toEqual(["Bo"]); // UN solo commit al terminar la ráfaga
  });

  it("flush (blur) compromete de inmediato lo pendiente y cancela el timer", () => {
    const { result, commits } = setup();

    act(() => result.current.change("bogotá colombia"));
    act(() => result.current.flush());
    expect(commits).toEqual(["bogotá colombia"]);

    // El timer quedó cancelado: no hay un segundo commit tardío.
    act(() => vi.advanceTimersByTime(IG_FIELD_COMMIT_DEBOUNCE_MS * 2));
    expect(commits).toEqual(["bogotá colombia"]);

    // Flush sin pendiente → no-op (no commit duplicado del mismo valor).
    act(() => result.current.flush());
    expect(commits).toEqual(["bogotá colombia"]);
  });

  it("sync externo: un valor que NO vino del propio commit pisa el draft", () => {
    const { result, rerender } = setup("Hola");
    expect(result.current.draft).toBe("Hola");

    // Undo / «aplicar a todas»: el store cambia por fuera.
    rerender({ value: "Chao" });
    expect(result.current.draft).toBe("Chao");
  });

  it("el eco del PROPIO commit no reinicia el draft (no pisa el tecleo)", () => {
    const { result, commits, rerender } = setup();

    act(() => result.current.change("abc"));
    act(() => vi.advanceTimersByTime(IG_FIELD_COMMIT_DEBOUNCE_MS));
    expect(commits).toEqual(["abc"]);

    // El store refleja el commit (mismo valor) → el draft no se toca.
    rerender({ value: "abc" });
    expect(result.current.draft).toBe("abc");
  });

  it("al desmontar compromete lo tecleado pendiente (no se pierde al cerrar el modal)", () => {
    const { result, commits, unmount } = setup();

    act(() => result.current.change("pendiente"));
    unmount();
    expect(commits).toEqual(["pendiente"]);
  });

  // 2026-10-26 — bug "la ubicación no deja poner espacios": el commit
  // TRANSFORMA el texto ("bogotá " → "Bogotá") y el sync externo comparaba el
  // valor transformado del store contra el draft CRUDO del último commit →
  // nunca igualaban → el draft se reseteaba ~350 ms tras cada pausa y se comía
  // el espacio/la palabra que el cliente seguía tecleando.
  describe("commitEcho (campos cuyo commit TRANSFORMA el texto)", () => {
    const echo = (v: string) => v.trim().replace(/^./, (c) => c.toUpperCase());

    function setupEcho(initial = "") {
      vi.useFakeTimers();
      const commits: string[] = [];
      const hook = renderHook(
        ({ value }) =>
          useDebouncedCommit(value, (v) => commits.push(v), IG_FIELD_COMMIT_DEBOUNCE_MS, echo),
        { initialProps: { value: initial } },
      );
      return { commits, ...hook };
    }

    it("el eco TRANSFORMADO del propio commit no resetea el draft (la pausa a mitad de escritura sobrevive)", () => {
      const { result, commits, rerender } = setupEcho();

      // Escribe "bogotá", pausa → commit. El store devuelve el valor
      // TRANSFORMADO ("Bogotá"), no el draft crudo.
      act(() => result.current.change("bogotá"));
      act(() => vi.advanceTimersByTime(IG_FIELD_COMMIT_DEBOUNCE_MS));
      expect(commits).toEqual(["bogotá"]);
      rerender({ value: "Bogotá" });

      // Sigue escribiendo: el draft NO se reseteó a "Bogotá".
      act(() => result.current.change("bogotá, colombia"));
      expect(result.current.draft).toBe("bogotá, colombia");
    });

    it("un cambio EXTERNO real sigue pisando el draft (undo / «aplicar a todas»)", () => {
      const { result, commits, rerender } = setupEcho();

      act(() => result.current.change("bogotá"));
      act(() => vi.advanceTimersByTime(IG_FIELD_COMMIT_DEBOUNCE_MS));
      expect(commits).toEqual(["bogotá"]);
      rerender({ value: "Bogotá" }); // eco del propio commit → no-op

      // Undo: el store vuelve a vacío (distinto del eco del commit) → resetea.
      rerender({ value: "" });
      expect(result.current.draft).toBe("");
    });

    it("flush tras un commit transformado NO re-commitea lo mismo (comparación en formato eco)", () => {
      const { result, commits, rerender } = setupEcho();

      act(() => result.current.change("bogotá"));
      act(() => result.current.flush());
      expect(commits).toEqual(["bogotá"]);
      rerender({ value: "Bogotá" }); // el store refleja el eco

      // Blur posterior sin cambios: no debe haber un segundo commit.
      act(() => result.current.flush());
      act(() => vi.advanceTimersByTime(IG_FIELD_COMMIT_DEBOUNCE_MS * 2));
      expect(commits).toEqual(["bogotá"]);
    });

    it("2026-10-30 (bug owner): el blur SIEMPRE normaliza el draft visible, también con el commit ya hecho por debounce", () => {
      const { result, commits } = setupEcho();

      // Escribe y pausa: el debounce commitea (crudo) ANTES del blur.
      act(() => result.current.change("bogotá,colombia"));
      act(() => vi.advanceTimersByTime(IG_FIELD_COMMIT_DEBOUNCE_MS));
      expect(commits).toEqual(["bogotá,colombia"]);
      expect(result.current.draft).toBe("bogotá,colombia"); // crudo mientras edita

      // Blur: sin commit pendiente (el timer ya corrió) — el draft visible
      // IGUAL se normaliza al formato impreso.
      act(() => result.current.flush());
      expect(result.current.draft).toBe("Bogotá,colombia");
      expect(commits).toEqual(["bogotá,colombia"]); // sin commit extra
    });
  });
});
