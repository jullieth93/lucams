// @vitest-environment jsdom
/*
 * Fase 2 · item 2.8 — StudioOnboarding por producto: el tour muestra los pasos
 * genéricos + las features de la superficie, persiste el «ya lo vi» POR
 * SUPERFICIE y reporta su open al editor (coordinación con el banner de gestos).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { StudioOnboarding } from "./studio-onboarding";
import { tourStorageKey } from "./lib/studio-tour";

// Hint exige TooltipProvider (Radix); el tooltip no es lo que se testea acá.
vi.mock("@/components/ui/tooltip", () => ({
  Hint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

function openTour() {
  // El tour abre con un delay de 800ms tras el mount.
  act(() => {
    vi.advanceTimersByTime(900);
  });
}

describe("StudioOnboarding — tour por producto (item 2.8)", () => {
  it("superficie default: los 3 pasos genéricos de siempre (sin features)", () => {
    render(<StudioOnboarding slotNoun="imán" surface="default" />);
    openTour();
    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();
    expect(screen.getByText("Sube tu foto")).toBeInTheDocument();
  });

  it("calendario: 3 genéricos + 2 features del lienzo (año/letra y sets)", () => {
    render(<StudioOnboarding slotNoun="tarjeta" surface="calendar" />);
    openTour();
    expect(screen.getByText("Paso 1 de 5")).toBeInTheDocument();
    // Avanza al primer paso de feature.
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByText("Un set por calendario")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByText("Año y tipo de letra")).toBeInTheDocument();
  });

  it("Polaroid IG: incluye la pista de la foto de perfil en el avatar", () => {
    render(<StudioOnboarding slotNoun="imán" surface="polaroid-ig" />);
    openTour();
    expect(screen.getByText("Paso 1 de 6")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByText("Tu foto de perfil")).toBeInTheDocument();
  });

  it("persiste el «ya lo vi» POR SUPERFICIE al terminar (y al saltar)", () => {
    const { unmount } = render(<StudioOnboarding slotNoun="imán" surface="bookmarks" />);
    openTour();
    // Salta el tutorial → marca la clave de la superficie.
    fireEvent.click(screen.getByRole("button", { name: "Saltar tutorial" }));
    expect(window.localStorage.getItem(tourStorageKey("bookmarks"))).toBe("v1");
    // Las otras superficies NO quedan marcadas: su tour se mostrará.
    expect(window.localStorage.getItem(tourStorageKey("calendar"))).toBeNull();
    unmount();

    // Segundo mount de la MISMA superficie: no vuelve a mostrarse.
    render(<StudioOnboarding slotNoun="separador" surface="bookmarks" />);
    openTour();
    expect(screen.queryByText(/Paso 1 de/)).not.toBeInTheDocument();
  });

  it("reporta el open al editor (suprime el auto-trigger del banner de gestos)", () => {
    const onOpenChange = vi.fn();
    render(<StudioOnboarding slotNoun="imán" surface="strips" onOpenChange={onOpenChange} />);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    openTour();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Saltar tutorial" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
