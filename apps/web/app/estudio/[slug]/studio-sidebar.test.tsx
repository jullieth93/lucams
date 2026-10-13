// @vitest-environment jsdom

/*
 * StudioSidebar — sección «Diseños prediseñados» COLAPSABLE (Fase 2 · 2.5,
 * 2026-10-07). Con muchos diseños la sección sepultaba el resto de la sidebar
 * («Mis fotos» quedaba lejos del scroll). Ahora:
 *   1. > 6 prediseñados → arranca CERRADA (contador visible en el header).
 *   2. <= 6 → arranca abierta (pocos diseños no estorban).
 *   3. El toggle (aria-expanded + aria-controls) pliega/despliega el panel.
 * El filtrado server-side (listGalleryImages) no cambia: la sección solo se
 * monta cuando hay prediseñados, como antes.
 *
 * Al final: regla de caras al aplicar GLOBALMENTE (2026-10-12) — la pregunta
 * "¿En qué cara quieres aplicarlo?" para diseños de 1 cara en productos de 2
 * caras con destino ambiguo (sin slot seleccionado).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createStudioStore } from "./lib/store";
import type { CanvasDataV2 } from "./types";
import type { PredesignedItem } from "./studio-asset-picker-modal";

const { assignCalls } = vi.hoisted(() => ({
  assignCalls: [] as Array<{ designId: string; galleryImageId: string }>,
}));

vi.mock("@/features/personalization/actions", () => ({
  uploadDesignAssetAction: vi.fn(),
  // La aplicación de prediseñados pasa por acá (dedupe por galleryImageId);
  // ids terminados en "-ab" simulan un diseño con cara B (imageUrlB).
  assignPredesignedToDesignAction: async (input: { designId: string; galleryImageId: string }) => {
    assignCalls.push(input);
    const withB = input.galleryImageId.endsWith("-ab");
    return {
      ok: true as const,
      assetId: `asset-${input.galleryImageId}-a`,
      signedUrl: `https://signed.example/${input.galleryImageId}-a.png`,
      width: 100,
      height: 200,
      ...(withB
        ? {
            assetB: {
              assetId: `asset-${input.galleryImageId}-b`,
              signedUrl: `https://signed.example/${input.galleryImageId}-b.png`,
              width: 100,
              height: 200,
            },
          }
        : {}),
    };
  },
}));

import { StudioSidebar } from "./studio-sidebar";

afterEach(cleanup);

function minimalCanvas(): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 450, height: 600, dpiPreview: 90, dpiProduction: 300 },
      layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
    },
    slotCount: 2,
    slots: [
      { slotIndex: 0, assetId: null, assetUrl: null },
      { slotIndex: 1, assetId: null, assetUrl: null },
    ],
    gridLayout: { cols: 2, rows: 1, gap: 24 },
    borderColor: null,
  } as unknown as CanvasDataV2;
}

function predesignedItems(n: number): PredesignedItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `g${i}`,
    name: `Diseño ${i + 1}`,
    imageUrl: `https://example.com/g${i}.png`,
  }));
}

function renderSidebar(predesigned: PredesignedItem[]) {
  const store = createStudioStore();
  store.getState().init({
    designId: "d1",
    productSlug: "set-fotoimanes-polaroid-clasica",
    canvasData: minimalCanvas(),
    templates: [],
  });
  render(
    <TooltipProvider>
      <StudioSidebar
        store={store}
        productName="Set Fotoimanes"
        productSku="SFP-01"
        predesigned={predesigned}
      />
    </TooltipProvider>,
  );
}

const TOGGLE_NAME = "Mostrar u ocultar los diseños prediseñados";

describe("StudioSidebar — prediseñados colapsables (Fase 2 · 2.5)", () => {
  it("con MUCHOS (>6) arranca cerrada: contador visible, grid oculto, «Mis fotos» no queda sepultada", () => {
    renderSidebar(predesignedItems(9));

    const toggle = screen.getByRole("button", { name: TOGGLE_NAME });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // El header conserva el contador aunque esté cerrada.
    expect(screen.getByText("(9)")).toBeInTheDocument();
    // Grid oculto: ningún botón «Aplicar el diseño…» montado.
    expect(screen.queryByRole("button", { name: /Aplicar el diseño/ })).toBeNull();
    // «Mis fotos» sigue visible arriba (no hay que scrollear los prediseñados).
    expect(screen.getByText("Mis fotos")).toBeInTheDocument();
  });

  it("el toggle despliega el panel con el grid y lo vuelve a plegar", () => {
    renderSidebar(predesignedItems(8));

    const toggle = screen.getByRole("button", { name: TOGGLE_NAME });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "Aplicar el diseño Diseño 1 al slot" }),
    ).toBeInTheDocument();
    // aria-controls apunta al panel desplegado.
    const panelId = toggle.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /Aplicar el diseño/ })).toBeNull();
  });

  it("con POCOS (<=6) arranca abierta", () => {
    renderSidebar(predesignedItems(3));

    expect(screen.getByRole("button", { name: TOGGLE_NAME })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Aplicar el diseño Diseño 3 al slot" }),
    ).toBeInTheDocument();
  });

  it("sin prediseñados: la sección no se monta (igual que antes)", () => {
    renderSidebar([]);

    expect(screen.queryByRole("button", { name: TOGGLE_NAME })).toBeNull();
    expect(screen.queryByText(/Diseños prediseñados/)).toBeNull();
  });
});

describe("StudioSidebar — miniatura watermark de prediseñados (3.10, 2026-10-07)", () => {
  it("exhibe thumbUrl cuando existe; fallback al original si no; contextmenu bloqueado", () => {
    renderSidebar([
      {
        id: "g1",
        name: "Con thumb",
        imageUrl: "https://example.com/g1.png",
        thumbUrl: "https://example.com/thumbs/g1.webp",
      },
      { id: "g2", name: "Sin thumb", imageUrl: "https://example.com/g2.png" },
    ]);

    const conThumb = screen.getByAltText("Con thumb");
    expect(conThumb).toHaveAttribute("src", "https://example.com/thumbs/g1.webp");
    expect(conThumb).toHaveAttribute("draggable", "false");
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    conThumb.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);

    // Sin thumbUrl (fila pre-backfill): fallback transitorio al original.
    expect(screen.getByAltText("Sin thumb")).toHaveAttribute("src", "https://example.com/g2.png");
  });
});

/*
 * Regla de caras al aplicar GLOBALMENTE (2026-10-12) — clic en la tarjeta del
 * sidebar SIN slot específico seleccionado:
 *   1. Producto de 2 caras + diseño de 1 cara → primero pregunta "¿En qué cara
 *      quieres aplicarlo?" (StudioFaceChoiceModal); no se aplica ni se sube
 *      nada hasta elegir.
 *   2. Cara A → primer slot PAR libre; cara B → primer slot IMPAR libre
 *      (destino EXACTO vía forceTargetSlot, sin re-anclaje a cara A).
 *   3. Cara elegida sin slots libres → NO se pisa contenido ni se sube nada
 *      (consistente con el bloqueo de cara B del Paquete A: solo aviso toast).
 *   4. Prediseño con imageUrlB → SIN pregunta: llena cara A + cara B del par.
 *   5. Con slot seleccionado o producto de 1 cara → SIN pregunta.
 */

const ONE_FACE: PredesignedItem = {
  id: "g1",
  name: "Diseño g1",
  imageUrl: "https://cdn.example/g1.png",
  imageUrlB: null,
};
const TWO_FACES: PredesignedItem = {
  id: "g2-ab",
  name: "Diseño g2-ab",
  imageUrl: "https://cdn.example/g2-ab.png",
  imageUrlB: "https://cdn.example/g2-ab-b.png",
};

function twoFaceCanvas(slotCount: number, occupied: number[] = []): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: { version: 1, stage: { width: 200, height: 400 }, layers: [] },
    slotCount,
    slots: Array.from({ length: slotCount }, (_, i) =>
      occupied.includes(i)
        ? { slotIndex: i, assetId: `own-${i}`, assetUrl: `https://x/own-${i}.png` }
        : { slotIndex: i, assetId: null, assetUrl: null },
    ),
    gridLayout: { cols: 2, rows: Math.ceil(slotCount / 2), gap: 8 },
  } as unknown as CanvasDataV2;
}

function renderTwoFaceSidebar(slotCount = 4, occupied: number[] = [], facesPerUnit = 2) {
  const store = createStudioStore();
  store.getState().init({
    designId: "d1",
    productSlug: "separadores",
    canvasData: twoFaceCanvas(slotCount, occupied),
    templates: [],
  });
  render(
    <TooltipProvider>
      <StudioSidebar
        store={store}
        productName="Separadores"
        productSku="SEP-1"
        predesigned={[ONE_FACE, TWO_FACES]}
        facesPerUnit={facesPerUnit}
      />
    </TooltipProvider>,
  );
  return store;
}

const clickDesign = (item: PredesignedItem) =>
  fireEvent.click(screen.getByRole("button", { name: `Aplicar el diseño ${item.name} al slot` }));

const faceSlotsOf = (store: ReturnType<typeof renderTwoFaceSidebar>) =>
  store.getState().canvasData!.slots.map((s) => s.assetId ?? null);

const FACE_DIALOG_NAME = "¿En qué cara quieres aplicarlo?";

describe("StudioSidebar — regla de caras en la aplicación global (2026-10-12)", () => {
  beforeEach(() => {
    assignCalls.length = 0;
  });

  it("diseño de 1 cara sin slot seleccionado → PREGUNTA la cara antes de aplicar (no sube nada)", () => {
    const store = renderTwoFaceSidebar();
    clickDesign(ONE_FACE);

    expect(screen.getByRole("dialog", { name: FACE_DIALOG_NAME })).toBeInTheDocument();
    expect(assignCalls).toHaveLength(0);
    expect(faceSlotsOf(store)).toEqual([null, null, null, null]);
  });

  it("cara A elegida → primer slot PAR libre (sin tocar la cara B)", async () => {
    const store = renderTwoFaceSidebar(4, [0]);
    clickDesign(ONE_FACE);
    fireEvent.click(screen.getByRole("button", { name: "Cara A" }));

    await waitFor(() => expect(assignCalls).toHaveLength(1));
    expect(faceSlotsOf(store)).toEqual(["own-0", null, "asset-g1-a", null]);
    // La modal se cerró tras elegir.
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: FACE_DIALOG_NAME })).not.toBeInTheDocument(),
    );
  });

  it("cara B elegida → primer slot IMPAR libre, destino EXACTO (sin re-anclaje a cara A)", async () => {
    const store = renderTwoFaceSidebar(4, [1]);
    clickDesign(ONE_FACE);
    fireEvent.click(screen.getByRole("button", { name: "Cara B" }));

    await waitFor(() => expect(assignCalls).toHaveLength(1));
    expect(faceSlotsOf(store)).toEqual([null, "own-1", null, "asset-g1-a"]);
  });

  it("cara B elegida SIN slots libres → no se aplica ni se pisa contenido (patrón cara B ocupada)", async () => {
    const store = renderTwoFaceSidebar(4, [1, 3]);
    clickDesign(ONE_FACE);
    fireEvent.click(screen.getByRole("button", { name: "Cara B" }));

    // Ni siquiera se sube el asset al servidor: no había dónde ponerlo.
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: FACE_DIALOG_NAME })).not.toBeInTheDocument(),
    );
    expect(assignCalls).toHaveLength(0);
    expect(faceSlotsOf(store)).toEqual([null, "own-1", null, "own-3"]);
  });

  it("prediseño con imageUrlB → SIN pregunta: llena cara A y cara B del primer par libre", async () => {
    const store = renderTwoFaceSidebar();
    clickDesign(TWO_FACES);

    expect(screen.queryByRole("dialog", { name: FACE_DIALOG_NAME })).not.toBeInTheDocument();
    await waitFor(() => expect(assignCalls).toHaveLength(1));
    expect(faceSlotsOf(store)).toEqual(["asset-g2-ab-a", "asset-g2-ab-b", null, null]);
  });

  it("con slot seleccionado (destino explícito) → SIN pregunta", async () => {
    const store = renderTwoFaceSidebar();
    // act(): la suscripción useStore debe re-renderizar ANTES del clic.
    act(() => store.getState().selectSlot(2));
    clickDesign(ONE_FACE);

    expect(screen.queryByRole("dialog", { name: FACE_DIALOG_NAME })).not.toBeInTheDocument();
    await waitFor(() => expect(assignCalls).toHaveLength(1));
    expect(faceSlotsOf(store)).toEqual([null, null, "asset-g1-a", null]);
  });

  it("producto de 1 cara → SIN pregunta aunque el destino sea global", async () => {
    const store = renderTwoFaceSidebar(2, [], 1);
    clickDesign(ONE_FACE);

    expect(screen.queryByRole("dialog", { name: FACE_DIALOG_NAME })).not.toBeInTheDocument();
    await waitFor(() => expect(assignCalls).toHaveLength(1));
    expect(faceSlotsOf(store)).toEqual(["asset-g1-a", null]);
  });

  it("«Cancelar» cierra la pregunta sin aplicar nada", async () => {
    const store = renderTwoFaceSidebar();
    clickDesign(ONE_FACE);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: FACE_DIALOG_NAME })).not.toBeInTheDocument(),
    );
    expect(assignCalls).toHaveLength(0);
    expect(faceSlotsOf(store)).toEqual([null, null, null, null]);
  });
});
