// @vitest-environment jsdom

/*
 * Test del pager de DOS NIVELES del visor de detalle 3D del calendario (decisión owner
 * 2026-10-23): con N sets las tarjetas llegan aplanadas (set 0 = tarjetas 1..12, set 1 =
 * 13..24…) y antes se recorrían lineales — con 3 sets el cliente paginaba 36 tarjetas sin
 * saber en qué set estaba. Ahora:
 *  - nivel TARJETA: Anterior/Siguiente (+ ← →) recorre SOLO las tarjetas del set actual con
 *    wrap-around DENTRO del set (no cruza al vecino);
 *  - nivel SET: chips «Set N de M» que saltan a la tarjeta 1 del set elegido;
 *  - indicador aria-live «Enero — Set 1 de 3» (mes + set).
 * Con 1 solo set el comportamiento es el histórico (recorrido lineal, «Tarjeta N de 12»,
 * sin UI de set).
 *
 * El lienzo WebGL no se ejerce (jsdom no tiene WebGL): @react-three/fiber y @react-three/drei
 * se mockean con stubs que NO renderizan la escena — lo que se verifica es el pager DOM, no el
 * 3D (mismo criterio del test estático de motion: mockear r3f para asertar la escena
 * verificaría el mock). magnet-3d/fit-camera-polar/studio-3d-environment se mockean porque
 * importan drei/fiber y la escena nunca se monta.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

vi.mock("@react-three/fiber", () => ({
  Canvas: () => null,
  useThree: () => () => {},
}));
vi.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
  ContactShadows: () => null,
}));
vi.mock("./use-window-textures", () => ({ useWindowTextures: () => null }));
vi.mock("./fit-camera-polar", () => ({ FitCameraPolar: () => null }));
vi.mock("./studio-3d-environment", () => ({
  StudioEnvironment: () => null,
  StudioBackdrop: () => null,
}));
vi.mock("./magnet-3d", () => ({
  ExtrudedMagnetMesh: () => null,
  realWorldDepth: () => 0.02,
  CALENDAR_CARD_THICKNESS_CM: 0.04,
}));

import CalendarCardFocus from "./calendar-card-focus";
import { TooltipProvider } from "@/components/ui/tooltip";

afterEach(() => cleanup());

const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function makeCards(total: number) {
  return Array.from({ length: total }, (_, k) => ({
    dataUrl: `data:image/webp;base64,card-${k}`,
    wRatio: 3,
    hRatio: 4,
    shape: "rectangle" as const,
    wCm: 7.5,
    hCm: 10,
  }));
}

/** El índice lo controla el padre (como SceneGallery con focusIndex): harness con estado
 *  para que las flechas/chips/teclado actualicen el indicador de verdad. */
function Harness({
  total,
  perSet,
  labels,
  initialIndex = 0,
}: {
  total: number;
  perSet?: number;
  labels?: string[];
  initialIndex?: number;
}) {
  const [i, setI] = useState(initialIndex);
  return (
    <TooltipProvider delayDuration={0}>
      <CalendarCardFocus
        cards={makeCards(total)}
        index={i}
        onIndexChange={setI}
        onClose={() => {}}
        cardsPerSet={perSet}
        cardLabels={labels}
      />
    </TooltipProvider>
  );
}

const labels3Sets = Array.from({ length: 36 }, (_, k) => MONTHS_ES[k % 12]!);

describe("CalendarCardFocus — pager de dos niveles multi-set (2026-10-23)", () => {
  it("3 sets: indicador «Enero — Set 1 de 3» y Siguiente avanza el mes DENTRO del set", () => {
    render(<Harness total={36} perSet={12} labels={labels3Sets} />);

    expect(screen.getByText("Enero — Set 1 de 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tarjeta siguiente" }));
    expect(screen.getByText("Febrero — Set 1 de 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tarjeta anterior" }));
    expect(screen.getByText("Enero — Set 1 de 3")).toBeInTheDocument();
  });

  it("en «Diciembre — Set 1 de 3» Siguiente ENVUELVE a Enero del MISMO set (no cruza al set 2), también con teclado", () => {
    render(<Harness total={36} perSet={12} labels={labels3Sets} initialIndex={11} />);
    expect(screen.getByText("Diciembre — Set 1 de 3")).toBeInTheDocument();

    // Botón: wrap dentro del set → tarjeta 1 del set 1 (índice 0, no 12).
    fireEvent.click(screen.getByRole("button", { name: "Tarjeta siguiente" }));
    expect(screen.getByText("Enero — Set 1 de 3")).toBeInTheDocument();

    // Teclado → desde Enero va a Febrero del MISMO set; y ← desde Enero envuelve
    // a Diciembre del MISMO set (nunca al set vecino).
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByText("Febrero — Set 1 de 3")).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(screen.getByText("Diciembre — Set 1 de 3")).toBeInTheDocument();
  });

  it("el chip «Set 2 de 3» salta a la tarjeta 1 del set 2 («Enero — Set 2 de 3») y queda aria-pressed", () => {
    render(<Harness total={36} perSet={12} labels={labels3Sets} />);

    const chip2 = screen.getByRole("button", { name: "Set 2 de 3" });
    expect(screen.getByRole("button", { name: "Set 1 de 3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(chip2).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(chip2);

    expect(screen.getByText("Enero — Set 2 de 3")).toBeInTheDocument();
    expect(chip2).toHaveAttribute("aria-pressed", "true");
    // Y desde el set 2 el wrap de tarjetas ocurre DENTRO del set 2.
    fireEvent.click(screen.getByRole("button", { name: "Tarjeta anterior" }));
    expect(screen.getByText("Diciembre — Set 2 de 3")).toBeInTheDocument();
  });

  it("con 1 set: sin chips ni rótulo de set, indicador y recorrido lineal históricos", () => {
    render(<Harness total={12} perSet={12} labels={MONTHS_ES} initialIndex={11} />);

    expect(screen.getByText("Tarjeta 12 de 12")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Set 1 de 1/ })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Unidades de tu diseño" })).toBeNull();

    // Wrap lineal histórico: de la 12 vuelve a la 1.
    fireEvent.click(screen.getByRole("button", { name: "Tarjeta siguiente" }));
    expect(screen.getByText("Tarjeta 1 de 12")).toBeInTheDocument();
  });
});
