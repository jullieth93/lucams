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

  it("Fase 2 UX (2026-10-13) — el toggle tiene presencia de marca (lila, texto blanco)", () => {
    renderSidebar(predesignedItems(9));

    const toggle = screen.getByRole("button", { name: TOGGLE_NAME });
    expect(toggle.className).toContain("bg-brand-purple");
    expect(toggle.className).toContain("text-white");
    // Comportamiento intacto: sigue colapsado por defecto con muchos diseños.
    expect(toggle).toHaveAttribute("aria-expanded", "false");
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
 *   3. Cara elegida sin slots libres → modal de REEMPLAZO (2026-10-19): lista
 *      los lienzos ocupados de esa cara y el cliente elige cuál reemplazar
 *      (antes: solo un toast y callejón sin salida).
 *   4. Prediseño con imageUrlB → SIN pregunta de cara: llena cara A + cara B
 *      del primer par libre; sin par libre → modal de reemplazo (caras A).
 *   5. "Pregunta SIEMPRE" (owner 2026-10-19): el clic de la grilla IGNORA el
 *      slot seleccionado — assignAssetToSlot lo auto-selecciona al aplicar y
 *      eso hacía que los clics siguientes sobrescribieran sin preguntar.
 *      (Destino explícito sigue existiendo: tap en la grilla del lienzo y
 *      drag & drop, que no pasan por este handler.)
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

  it("cara B elegida SIN slots libres → modal de REEMPLAZO con los lienzos ocupados de esa cara (2026-10-19)", async () => {
    const store = renderTwoFaceSidebar(4, [1, 3]);
    clickDesign(ONE_FACE);
    fireEvent.click(screen.getByRole("button", { name: "Cara B" }));

    // La pregunta de cara se cierra y abre la de reemplazo; no se sube nada aún.
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: FACE_DIALOG_NAME })).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("dialog", { name: "¿Cuál lienzo quieres reemplazar?" }),
    ).toBeInTheDocument();
    // Solo los lienzos ocupados de la cara B (slots impares 1 y 3).
    expect(
      screen.getByRole("button", { name: "Reemplazar el diseño del lienzo 2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reemplazar el diseño del lienzo 4" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reemplazar el diseño del lienzo 1" })).toBeNull();
    expect(assignCalls).toHaveLength(0);
    expect(faceSlotsOf(store)).toEqual([null, "own-1", null, "own-3"]);
  });

  it("elegir un lienzo en el modal de reemplazo aplica el diseño EXACTAMENTE ahí", async () => {
    const store = renderTwoFaceSidebar(4, [1, 3]);
    clickDesign(ONE_FACE);
    fireEvent.click(screen.getByRole("button", { name: "Cara B" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Reemplazar el diseño del lienzo 2" }),
    );

    await waitFor(() => expect(assignCalls).toHaveLength(1));
    expect(faceSlotsOf(store)).toEqual([null, "asset-g1-a", null, "own-3"]);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "¿Cuál lienzo quieres reemplazar?" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("prediseño con imageUrlB → SIN pregunta: llena cara A y cara B del primer par libre", async () => {
    const store = renderTwoFaceSidebar();
    clickDesign(TWO_FACES);

    expect(screen.queryByRole("dialog", { name: FACE_DIALOG_NAME })).not.toBeInTheDocument();
    await waitFor(() => expect(assignCalls).toHaveLength(1));
    expect(faceSlotsOf(store)).toEqual(["asset-g2-ab-a", "asset-g2-ab-b", null, null]);
  });

  it("con slot seleccionado el clic de la grilla IGUAL pregunta la cara (2026-10-19: la auto-selección no es destino)", async () => {
    const store = renderTwoFaceSidebar();
    // act(): la suscripción useStore debe re-renderizar ANTES del clic.
    act(() => store.getState().selectSlot(2));
    clickDesign(ONE_FACE);

    // Antes: el slot seleccionado era destino explícito y NO preguntaba — tras
    // la primera aplicación eso sobrescribía el mismo lienzo en silencio.
    expect(screen.getByRole("dialog", { name: FACE_DIALOG_NAME })).toBeInTheDocument();
    expect(assignCalls).toHaveLength(0);
    expect(faceSlotsOf(store)).toEqual([null, null, null, null]);
  });

  it("tras aplicar, la selección de slot queda LIMPIA → el clic siguiente vuelve a preguntar", async () => {
    const store = renderTwoFaceSidebar();
    clickDesign(ONE_FACE);
    fireEvent.click(screen.getByRole("button", { name: "Cara A" }));
    await waitFor(() => expect(assignCalls).toHaveLength(1));
    // assignAssetToSlot auto-seleccionó el slot 0; el flujo lo limpia.
    expect(store.getState().selectedSlotIndex).toBeNull();

    // Segundo clic en el mismo diseño: vuelve a preguntar la cara (no cae
    // directo al lienzo recién llenado ni lo sobrescribe en silencio).
    clickDesign(ONE_FACE);
    expect(screen.getByRole("dialog", { name: FACE_DIALOG_NAME })).toBeInTheDocument();
    expect(assignCalls).toHaveLength(1); // no se subió nada todavía
  });

  it("diseño de 2 caras SIN par libre → modal de reemplazo solo con caras A (anclas de unidad)", async () => {
    const store = renderTwoFaceSidebar(4, [0, 1, 2, 3]);
    clickDesign(TWO_FACES);

    expect(
      await screen.findByRole("dialog", { name: "¿Cuál lienzo quieres reemplazar?" }),
    ).toBeInTheDocument();
    // Candidatas: solo las caras A ocupadas (slots 0 y 2 → «Lienzo 1»/«Lienzo 3»).
    expect(
      screen.getByRole("button", { name: "Reemplazar el diseño del lienzo 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reemplazar el diseño del lienzo 3" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reemplazar el diseño del lienzo 2" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reemplazar el diseño del lienzo 3" }));
    await waitFor(() => expect(assignCalls).toHaveLength(1));
    // La cara A de la unidad 2 se reemplaza; su cara B ocupada NO se pisa
    // (bBlocked → aviso), misma regla de nunca pisar contenido.
    expect(faceSlotsOf(store)).toEqual(["own-0", "own-1", "asset-g2-ab-a", "own-3"]);
  });

  it("producto de 1 cara SIN lienzos libres → modal de reemplazo con TODOS los lienzos ocupados", async () => {
    const store = renderTwoFaceSidebar(2, [0, 1], 1);
    clickDesign(ONE_FACE);

    expect(
      await screen.findByRole("dialog", { name: "¿Cuál lienzo quieres reemplazar?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reemplazar el diseño del lienzo 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reemplazar el diseño del lienzo 2" }),
    ).toBeInTheDocument();
    expect(assignCalls).toHaveLength(0);
    expect(faceSlotsOf(store)).toEqual(["own-0", "own-1"]);
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

// 2026-10-22 — draft LAZY: sin ?designId= el draft no existe hasta el primer
// auto-save; un prediseñado como PRIMERA acción moría en un guard silencioso
// (bug owner: "solo carga después de subir una foto"). Ahora store.ensureDesignId
// crea el draft en el momento (la registra el editor; acá se simula).
describe("StudioSidebar — prediseñado como primera acción SIN draft (draft LAZY)", () => {
  beforeEach(() => {
    assignCalls.length = 0;
  });

  function renderLazySidebar(ensurer: () => Promise<string | null>) {
    const store = createStudioStore();
    store.getState().init({
      designId: null,
      productSlug: "set-fotoimanes-polaroid-clasica",
      canvasData: minimalCanvas(),
      templates: [],
    });
    store.getState().setDesignEnsurer(ensurer);
    render(
      <TooltipProvider>
        <StudioSidebar
          store={store}
          productName="Set Fotoimanes"
          productSku="SFP-01"
          predesigned={predesignedItems(2)}
        />
      </TooltipProvider>,
    );
    return store;
  }

  it("sin designId: crea el draft en el momento y aplica con ESE id (nunca no-op silencioso)", async () => {
    let ensureCalls = 0;
    const store = renderLazySidebar(async () => {
      ensureCalls++;
      store.getState().setDesignId("d-new");
      return "d-new";
    });

    clickDesign({ id: "g0", name: "Diseño 1", imageUrl: "https://example.com/g0.png" });

    await waitFor(() => expect(assignCalls).toHaveLength(1));
    expect(ensureCalls).toBe(1);
    expect(assignCalls[0]).toMatchObject({ designId: "d-new", galleryImageId: "g0" });
    expect(store.getState().canvasData!.slots[0]!.assetId).toBe("asset-g0-a");
  });

  it("si la creación del draft FALLA (ensurer → null): no se sube nada", async () => {
    renderLazySidebar(async () => null);

    clickDesign({ id: "g0", name: "Diseño 1", imageUrl: "https://example.com/g0.png" });

    // El error lo muestra el caller (toast); el contrato es: jamás silencioso
    // y jamás una subida sin designId.
    await waitFor(() => expect(assignCalls).toHaveLength(0));
  });
});
