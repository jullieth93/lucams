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
});
