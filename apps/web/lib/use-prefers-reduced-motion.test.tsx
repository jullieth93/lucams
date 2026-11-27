/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

describe("usePrefersReducedMotion", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: originalMatchMedia,
    });
  });

  it("refleja el valor inicial de matchMedia y reacciona a cambios en vivo", () => {
    let listener: (() => void) | null = null;
    const mql = {
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn((_event: string, cb: () => void) => {
        listener = cb;
      }),
      removeEventListener: vi.fn(),
    };

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn(() => mql),
    });

    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);

    act(() => {
      mql.matches = false;
      listener?.();
    });
    expect(result.current).toBe(false);

    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("devuelve false de forma segura si matchMedia no existe", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: undefined,
    });

    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });
});
