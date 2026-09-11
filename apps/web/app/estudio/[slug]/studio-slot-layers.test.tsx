// @vitest-environment jsdom

/*
 * Tests unitarios de las capas Konva del slot — studio-slot.tsx.
 *
 * renderLayer (exportado) despacha cada tipo de capa del unitTemplate con ramas
 * de estilo (Instagram oscuro, full-bleed, tarjeta simple, tira, shape
 * heart/circle, texto editable con/sin override). ProfilePhotoLayerRenderer
 * (Ola 17) cubre foto de perfil: sin URL → null, con URL → clip circular cover.
 * makeShapeClipFunc/getShapeBoundingBox (exportados) son puros sobre un ctx
 * grabador. Los handlers de drag/mouse del image-placeholder se invocan con
 * eventos Konva falsos.
 *
 * Konva no corre en jsdom → react-konva se mockea: cada componente registra
 * sus props en un array (handlers incluidos) y renderea un div. use-image se
 * mockea con una imagen controlable. Corre en CI sin Supabase.
 */

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";

// ── Mocks de frontera ────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  image: null as null | {
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
  },
  status: "loading",
  /** Props con que se invocó cada componente Konva mockeado, en orden de render. */
  konvaProps: [] as Array<{ name: string; props: Record<string, unknown> }>,
}));

vi.mock("react-konva", async () => {
  const { forwardRef, useEffect } = await import("react");
  const nodeStub = {
    getLayer: () => ({ batchDraw: () => {} }),
    cache: () => {},
    clearCache: () => {},
    position: () => {},
    x: () => 0,
    y: () => 0,
    getStage: () => null,
  };
  const make = (name: string) =>
    forwardRef(function MockKonva(
      { children, ...props }: { children?: ReactNode } & Record<string, unknown>,
      ref: unknown,
    ) {
      useEffect(() => {
        if (typeof ref === "function") (ref as (n: unknown) => void)(nodeStub);
      });
      mocks.konvaProps.push({ name, props });
      return <div data-konva={name}>{children as ReactNode}</div>;
    });
  return {
    Stage: make("Stage"),
    Layer: make("Layer"),
    Rect: make("Rect"),
    Image: make("Image"),
    Group: make("Group"),
    Text: make("Text"),
    Circle: make("Circle"),
    Path: make("Path"),
    Line: make("Line"),
  };
});

vi.mock("use-image", () => ({ default: () => [mocks.image, mocks.status] }));

import { getShapeBoundingBox, makeShapeClipFunc, nextWheelScale, renderLayer } from "./studio-slot";
import type { CanvasLayer, ImagePlaceholderLayer, SlotState } from "./types";

afterEach(() => cleanup());
beforeEach(() => {
  mocks.konvaProps.length = 0;
  mocks.image = null;
  mocks.status = "loading";
});

const STAGE = { width: 450, height: 600 };

function slot(overrides: Partial<SlotState> = {}): SlotState {
  return { slotIndex: 0, assetId: null, assetUrl: null, ...overrides } as SlotState;
}

/** Última aparición de un componente Konva mockeado por nombre. */
function lastKonva(name: string) {
  const found = mocks.konvaProps.filter((k) => k.name === name);
  return found[found.length - 1]?.props;
}

/** Ctx 2D grabador: registra llamadas y tolera sets de propiedades. */
function makeCtx() {
  const calls: Array<[string, unknown[]]> = [];
  return {
    calls,
    ctx: new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "calls") return calls;
          return (...args: unknown[]) => {
            calls.push([String(prop), args]);
          };
        },
        set: () => true,
      },
    ) as unknown as import("konva/lib/Context").Context,
  };
}

// ── makeShapeClipFunc / getShapeBoundingBox (puros) ──────────────────

describe("makeShapeClipFunc — clip de la silueta heart/circle", () => {
  it("heart: traza el path con bezierCurveTo dentro del cuadrado centrado", () => {
    const { ctx, calls } = makeCtx();
    makeShapeClipFunc("heart", 450, 600)(ctx);
    const beziers = calls.filter(([m]) => m === "bezierCurveTo");
    expect(calls[0]).toEqual(["beginPath", []]);
    expect(beziers.length).toBeGreaterThanOrEqual(5); // corazón = 5 curvas
    expect(calls[calls.length - 1]).toEqual(["closePath", []]);
  });

  it("circle: arco completo (0 → 2π) con radio = size/2", () => {
    const { ctx, calls } = makeCtx();
    makeShapeClipFunc("circle", 400, 400)(ctx);
    const arc = calls.find(([m]) => m === "arc");
    expect(arc).toBeDefined();
    const size = 400 * 0.92;
    expect(arc![1]).toEqual([
      400 * 0.04 + size / 2,
      400 * 0.04 + size / 2,
      size / 2,
      0,
      Math.PI * 2,
    ]);
  });
});

describe("getShapeBoundingBox", () => {
  it("cuadrado centrado horizontalmente, pegado arriba con padding 4%", () => {
    const bb = getShapeBoundingBox(450, 600);
    const size = Math.min(450, 600) * 0.92;
    expect(bb).toEqual({
      x: (450 - size) / 2,
      y: 600 * 0.04,
      width: size,
      height: size,
    });
  });
});

// ── renderLayer: background / frame-card / shape / asset ─────────────

describe("renderLayer — background", () => {
  const bg = { id: "bg", type: "background", color: "#ABCDEF" } as unknown as CanvasLayer;

  it("default: pinta el color base de la capa", () => {
    const el = renderLayer(bg, slot(), STAGE, undefined) as React.ReactElement<{
      fill: string;
    }>;
    expect(el.props.fill).toBe("#ABCDEF");
  });

  it("Instagram con cardBgHex resuelto → fondo binario (rama isIg && cardBgHex)", () => {
    const el = renderLayer(
      bg,
      slot(),
      STAGE,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        isIg: true,
        cardBgHex: "#000000",
      },
    ) as React.ReactElement<{ fill: string }>;
    expect(el.props.fill).toBe("#000000");
  });

  it("Instagram SIN cardBgHex → cae al color base", () => {
    const el = renderLayer(
      bg,
      slot(),
      STAGE,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        isIg: true,
      },
    ) as React.ReactElement<{ fill: string }>;
    expect(el.props.fill).toBe("#ABCDEF");
  });

  it("full-bleed con borderColor → la tarjeta entera toma el color del marco", () => {
    const el = renderLayer(
      bg,
      slot(),
      STAGE,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        fullBleed: true,
        borderColor: "#FF0000",
      },
    ) as React.ReactElement<{ fill: string }>;
    expect(el.props.fill).toBe("#FF0000");
  });

  it("full-bleed sin borderColor → cae al color base", () => {
    const el = renderLayer(
      bg,
      slot(),
      STAGE,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        fullBleed: true,
      },
    ) as React.ReactElement<{ fill: string }>;
    expect(el.props.fill).toBe("#ABCDEF");
  });
});

describe("renderLayer — frame-card", () => {
  const frameCard = {
    id: "card",
    type: "frame-card",
    fill: "#EEEEEE",
    cornerRadius: 12,
  } as unknown as CanvasLayer;

  it("borderColor elegido manda sobre el fill de la plantilla", () => {
    const el = renderLayer(
      frameCard,
      slot(),
      STAGE,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        borderColor: "#123456",
      },
    ) as React.ReactElement<{ fill: string; cornerRadius: number }>;
    expect(el.props.fill).toBe("#123456");
    expect(el.props.cornerRadius).toBe(12);
  });

  it("sin borderColor → fill de la capa; sin fill → blanco por defecto", () => {
    const el = renderLayer(
      frameCard,
      slot(),
      STAGE,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        borderColor: null,
      },
    ) as React.ReactElement<{ fill: string }>;
    expect(el.props.fill).toBe("#EEEEEE");

    const noFill = { id: "c2", type: "frame-card" } as unknown as CanvasLayer;
    const el2 = renderLayer(noFill, slot(), STAGE, undefined) as React.ReactElement<{
      fill: string;
    }>;
    expect(el2.props.fill).toBe("#FFFFFF");
  });
});

describe("renderLayer — shape", () => {
  it("circle usa el menor lado/2 como radio", () => {
    const layer = {
      id: "s",
      type: "shape",
      kind: "circle",
      x: 100,
      y: 100,
      width: 80,
      height: 60,
      fill: "#F00",
    } as unknown as CanvasLayer;
    const el = renderLayer(layer, slot(), STAGE, undefined) as React.ReactElement<{
      radius: number;
    }>;
    expect(el.props.radius).toBe(30);
  });

  it("heart escala el path 100×100 al bounding box del layer", () => {
    const layer = {
      id: "s",
      type: "shape",
      kind: "heart",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      fill: "#F00",
      strokeWidth: 2,
    } as unknown as CanvasLayer;
    const el = renderLayer(layer, slot(), STAGE, undefined) as React.ReactElement<{
      scaleX: number;
      scaleY: number;
      x: number;
      y: number;
      strokeWidth: number;
    }>;
    expect(el.props.scaleX).toBe(1);
    expect(el.props.x).toBe(50); // x - width/2 (convención center)
    expect(el.props.strokeWidth).toBe(2);
  });

  it("rect por default: x/y como top-left (center − size/2) con cornerRadius", () => {
    const layer = {
      id: "s",
      type: "shape",
      kind: "rect",
      x: 100,
      y: 100,
      width: 80,
      height: 40,
      fill: "#F00",
      cornerRadius: 6,
    } as unknown as CanvasLayer;
    const el = renderLayer(layer, slot(), STAGE, undefined) as React.ReactElement<{
      x: number;
      y: number;
      cornerRadius: number;
    }>;
    expect(el.props.x).toBe(60);
    expect(el.props.y).toBe(80);
    expect(el.props.cornerRadius).toBe(6);
  });
});

describe("renderLayer — asset (chrome SVG)", () => {
  const assetLayer = {
    id: "chrome",
    type: "asset",
    src: "/templates/ig_post_3x4.svg",
    x: 0,
    y: 0,
    width: 450,
    height: 600,
  } as unknown as CanvasLayer;

  it("mientras carga (sin imagen) no renderiza nada", () => {
    mocks.image = null;
    const { container } = render(
      renderLayer(assetLayer, slot(), STAGE, undefined) as React.ReactElement,
    );
    expect(container.querySelector("[data-konva]")).toBeNull();
  });

  it("con imagen: renderiza el chrome (fondo oscuro IG pide la variante _dark)", () => {
    mocks.image = { width: 450, height: 600, naturalWidth: 450, naturalHeight: 600 };
    mocks.status = "loaded";
    render(
      renderLayer(
        assetLayer,
        slot(),
        STAGE,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { isIg: true, darkCardBg: true },
      ) as React.ReactElement,
    );
    const img = lastKonva("Image");
    expect(img).toBeDefined();
    expect(img!.image).toBe(mocks.image);
    expect(img!.opacity).toBe(1);
    expect(img!.listening).toBe(false);
  });
});

// ── renderLayer — image-placeholder (montado: handlers + ramas de foto) ──

describe("renderLayer — image-placeholder", () => {
  const phLayer = {
    id: "ph",
    type: "image-placeholder",
    x: 29,
    y: 58,
    width: 392,
    height: 392,
    cornerRadius: 8,
  } as unknown as ImagePlaceholderLayer;

  it("slot vacío (o imagen cargando) → rect placeholder punteado", () => {
    mocks.image = null;
    render(
      renderLayer(
        phLayer,
        slot({ assetUrl: "https://x/f.png" }),
        STAGE,
        undefined,
      ) as React.ReactElement,
    );
    const rect = lastKonva("Rect");
    expect(rect).toBeDefined();
    expect(rect!.dash).toEqual([12, 8]);
    expect(rect!.listening).toBe(false);
  });

  it("con foto: cover exacto por default, draggable con transform habilitado", () => {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    const onTransform = vi.fn();
    render(
      renderLayer(
        phLayer,
        slot({ assetUrl: "https://x/f.png" }),
        STAGE,
        undefined,
        undefined,
        onTransform,
      ) as React.ReactElement,
    );
    const img = lastKonva("Image");
    expect(img).toBeDefined();
    // cover: max(392/800, 392/600) = 0.6533… → ancho rendereado 800×0.6533
    const coverScale = Math.max(392 / 800, 392 / 600);
    expect(img!.width).toBeCloseTo(800 * coverScale, 5);
    expect(img!.height).toBeCloseTo(600 * coverScale, 5);
    expect(img!.draggable).toBe(true);
    expect(img!.preventDefault).toBe(true);
  });

  it("rotación 90/270 intercambia las dimensiones de cover (Ola 3c)", () => {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    render(
      renderLayer(
        phLayer,
        slot({
          assetUrl: "https://x/f.png",
          photoTransform: { offsetX: 0, offsetY: 0, scale: 1, rotation: 90 },
        }),
        STAGE,
        undefined,
      ) as React.ReactElement,
    );
    const img = lastKonva("Image");
    expect(img!.rotation).toBe(90);
    // cover con dims intercambiadas: max(392/600, 392/800)
    const coverScale = Math.max(392 / 600, 392 / 800);
    expect(img!.width).toBeCloseTo(800 * coverScale, 5);
    expect(img!.height).toBeCloseTo(600 * coverScale, 5);
  });

  it("userScale se clampa al rango 0.5–3", () => {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    render(
      renderLayer(
        phLayer,
        slot({
          assetUrl: "https://x/f.png",
          photoTransform: { offsetX: 0, offsetY: 0, scale: 99 },
        }),
        STAGE,
        undefined,
      ) as React.ReactElement,
    );
    const img = lastKonva("Image");
    const coverScale = Math.max(392 / 800, 392 / 600);
    expect(img!.width).toBeCloseTo(800 * coverScale * 3, 5); // 99 → clamp 3
  });

  it("offset persistido se aplica a la posición de la foto", () => {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    render(
      renderLayer(
        phLayer,
        slot({
          assetUrl: "https://x/f.png",
          photoTransform: { offsetX: 12, offsetY: -7, scale: 1 },
        }),
        STAGE,
        undefined,
      ) as React.ReactElement,
    );
    const img = lastKonva("Image");
    expect(img!.x).toBe(392 / 2 + 12);
    expect(img!.y).toBe(392 / 2 - 7);
  });

  it("cornerRadius > 0 → Group con clipFunc redondeado (se invoca sin romper)", () => {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    render(
      renderLayer(
        phLayer,
        slot({ assetUrl: "https://x/f.png" }),
        STAGE,
        undefined,
      ) as React.ReactElement,
    );
    const group = lastKonva("Group");
    expect(typeof group!.clipFunc).toBe("function");
    const { ctx } = makeCtx();
    (group!.clipFunc as (c: unknown) => void)(ctx);
  });

  it("sin cornerRadius → Group con clip rectangular plano", () => {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    const flat = { ...phLayer, cornerRadius: 0 } as unknown as ImagePlaceholderLayer;
    render(
      renderLayer(
        flat,
        slot({ assetUrl: "https://x/f.png" }),
        STAGE,
        undefined,
      ) as React.ReactElement,
    );
    const group = lastKonva("Group");
    expect(group!.clip).toEqual({ x: 0, y: 0, width: 392, height: 392 });
    expect(group!.clipFunc).toBeUndefined();
  });

  it("onDragEnd comitea el offset (target.x − width/2) y avisa dragEnd", () => {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    const onTransform = vi.fn();
    const onDragEnd = vi.fn();
    render(
      renderLayer(
        phLayer,
        slot({ assetUrl: "https://x/f.png" }),
        STAGE,
        undefined,
        undefined,
        onTransform,
        undefined,
        onDragEnd,
      ) as React.ReactElement,
    );
    const img = lastKonva("Image");
    const target = { x: () => 392 / 2 + 20, y: () => 392 / 2 + 10 };
    (img!.onDragEnd as (e: unknown) => void)({ target });
    expect(onTransform).toHaveBeenCalledWith({ offsetX: 20, offsetY: 10 });
    expect(onDragEnd).toHaveBeenCalled();
  });

  it("handlers de cursor (mouse enter/leave/down/up) actualizan el cursor del stage", () => {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    render(
      renderLayer(
        phLayer,
        slot({ assetUrl: "https://x/f.png" }),
        STAGE,
        undefined,
        undefined,
        vi.fn(),
      ) as React.ReactElement,
    );
    const img = lastKonva("Image");
    const container = { style: {} as Record<string, string> };
    const evt = () => ({
      target: { getStage: () => ({ container: () => container }) },
    });
    const run = (handler: string, e: unknown) => (img![handler] as (x: unknown) => void)(e);

    run("onMouseEnter", evt());
    expect(container.style.cursor).toBe("grab");
    run("onMouseDown", evt());
    expect(container.style.cursor).toBe("grabbing");
    run("onMouseUp", evt());
    expect(container.style.cursor).toBe("grab");
    run("onMouseLeave", evt());
    expect(container.style.cursor).toBe("");
  });

  it("filtro preset arma el array de filtros Konva y sus params", () => {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    render(
      renderLayer(
        phLayer,
        slot({ assetUrl: "https://x/f.png", filter: "bw" }),
        STAGE,
        undefined,
      ) as React.ReactElement,
    );
    const img = lastKonva("Image");
    expect(Array.isArray(img!.filters)).toBe(true);
    // bw = Grayscale + Contrast(10) (brightness 0 y saturation/hue 0 no agregan)
    expect(img!.filters).toHaveLength(2);
    expect(img!.contrast).toBe(10);
    expect(img!.brightness).toBe(0);
    expect(img!.saturation).toBe(0);
    expect(img!.hue).toBe(0);
  });

  it("sin filtro → filters undefined (no-op)", () => {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    render(
      renderLayer(
        phLayer,
        slot({ assetUrl: "https://x/f.png" }),
        STAGE,
        undefined,
      ) as React.ReactElement,
    );
    const img = lastKonva("Image");
    expect(img!.filters).toBeUndefined();
  });

  it("shape heart/circle → la foto cubre TODO el stage (useFullStage)", () => {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    const el = renderLayer(
      phLayer,
      slot({ assetUrl: "https://x/f.png" }),
      STAGE,
      undefined,
      "heart",
    ) as React.ReactElement<{
      layer: ImagePlaceholderLayer;
    }>;
    // ImagePlaceholder recibe el layer reescrito a stage completo
    expect(el.props.layer.x).toBe(0);
    expect(el.props.layer.width).toBe(450);
    expect(el.props.layer.height).toBe(600);
    expect(el.props.layer.cornerRadius).toBe(0);
  });

  it("tarjeta simple sin borde → foto a sangre total (simpleCardPhotoRect)", () => {
    const el = renderLayer(
      phLayer,
      slot(),
      STAGE,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        simpleCard: true,
        frameFullBleed: true,
        borderColor: null,
      },
    ) as React.ReactElement<{ layer: ImagePlaceholderLayer }>;
    expect(el.props.layer.x).toBe(0);
    expect(el.props.layer.y).toBe(0);
    expect(el.props.layer.width).toBe(450);
    expect(el.props.layer.height).toBe(600);
  });

  it("full-bleed con borderColor (no IG, no full-stage) → ventana con margen mínimo", () => {
    const el = renderLayer(
      phLayer,
      slot(),
      STAGE,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        fullBleed: true,
        borderColor: "#FF0000",
      },
    ) as React.ReactElement<{ layer: ImagePlaceholderLayer }>;
    expect(el.props.layer.x).toBeGreaterThan(0); // insertada, no a sangre
    expect(el.props.layer.width).toBeLessThan(450);
  });

  it("stripPosition first ajusta la ventana a la tira", () => {
    const el = renderLayer(
      phLayer,
      slot(),
      STAGE,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        stripPosition: "first",
      },
    ) as React.ReactElement<{ layer: ImagePlaceholderLayer }>;
    // stripPhotoRect("first") aplica el inset del borde superior (y) de la tira
    expect(el.props.layer.y).not.toBe(58);
  });

  it("Ola 25 — tira SIN BORDE (placeholder a sangre total): celda continua, SIN canaletas", () => {
    // El toggle "Sin borde" de la toolbar reescribe el placeholder a sangre total
    // de la celda → isStripBorderless → stripPhotoRect no aplica NI el borde
    // exterior NI las canaletas: las fotos se tocan (regla del dueño 2026-09-09).
    const phFullBleed = {
      ...phLayer,
      x: 0,
      y: 0,
      width: 450,
      height: 600,
      cornerRadius: 0,
    } as unknown as ImagePlaceholderLayer;
    const el = renderLayer(
      phFullBleed,
      slot(),
      STAGE,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { stripPosition: "first" },
    ) as React.ReactElement<{ layer: ImagePlaceholderLayer }>;
    // La ventana queda INTACTA (sangre total): sin inset arriba y sin canaleta abajo.
    expect(el.props.layer.y).toBe(0);
    expect(el.props.layer.height).toBe(600);
  });

  it("Ola 23 — con photoBackingHex la ventana lleva Rect de respaldo bajo la foto", () => {
    // Marco constante bajo zoom-out: el hueco de la ventana se pinta del color de la
    // tarjeta SIN marco (respaldo), no del color del marco (que está debajo).
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    render(
      renderLayer(
        phLayer,
        slot({ assetUrl: "https://x/f.png" }),
        STAGE,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { photoBackingHex: "#FFFFFF" },
      ) as React.ReactElement,
    );
    const backing = mocks.konvaProps.find(
      (k) => k.name === "Rect" && k.props.fill === "#FFFFFF" && k.props.width === 392,
    );
    expect(backing).toBeDefined();
    expect(backing!.props.listening).toBe(false);
    // Contenido del diseño (SÍ se hornea): NO es un adorno edit-indicator/realism.
    expect(backing!.props.name).toBeUndefined();
  });

  it("Ola 23 — sin photoBackingHex no hay Rect de respaldo (control)", () => {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    render(
      renderLayer(
        phLayer,
        slot({ assetUrl: "https://x/f.png" }),
        STAGE,
        undefined,
      ) as React.ReactElement,
    );
    expect(mocks.konvaProps.some((k) => k.name === "Rect")).toBe(false);
  });
});

// ── renderLayer — texto editable ─────────────────────────────────────

describe("renderLayer — text", () => {
  const textLayer = {
    id: "caption",
    type: "text",
    x: 225,
    y: 526,
    text: "Escribe tu mensaje",
    fontSize: 16,
    editable: true,
  } as unknown as CanvasLayer;

  it("heart/circle → la capa de texto NO se dibuja", () => {
    expect(renderLayer(textLayer, slot(), STAGE, undefined, "circle")).toBeNull();
  });

  it("allowText=false → la capa no se dibuja (Cuadrados/separadores)", () => {
    expect(renderLayer(textLayer, slot(), STAGE, undefined, "rectangle")).toBeNull();
  });

  it("editable sin override → SIN texto en la tarjeta: solo la zona de edición vacía", () => {
    // Ola 25 (Lucy 2026-09-09) — regla estricta: la tarjeta nace VACÍA; el default
    // de la plantilla no se dibuja en ninguna superficie. En la grilla (editable)
    // solo queda la zona punteada turquesa + dot + hit invisible (edit-indicator).
    const el = renderLayer(
      textLayer,
      slot(),
      STAGE,
      vi.fn(),
      "rectangle",
      undefined,
      undefined,
      undefined,
      undefined,
      {
        allowText: true,
      },
    ) as React.ReactElement;
    const children = (
      (el.props as { children: Array<React.ReactElement | null> }).children ?? []
    ).filter(Boolean);
    // NINGÚN nodo de texto.
    expect(children.some((c) => (c as React.ReactElement).key === "caption-text")).toBe(false);
    // Zona de edición: rect punteado + dot, ambos edit-indicator (no se hornean).
    const zone = children[0] as React.ReactElement<{ name?: string; dash?: number[] }>;
    expect(zone.props.name).toBe("edit-indicator");
    expect(zone.props.dash).toEqual([5, 3]);
  });

  it("Ola 25 — la zona vacía es tappeable: el hit invisible abre el editor de texto", () => {
    const onTextEdit = vi.fn();
    render(
      renderLayer(
        textLayer,
        slot(),
        STAGE,
        onTextEdit,
        "rectangle",
        undefined,
        undefined,
        undefined,
        undefined,
        {
          allowText: true,
        },
      ) as React.ReactElement,
    );
    // No hay NINGÚN Text en el árbol Konva (la tarjeta no muestra el default).
    expect(mocks.konvaProps.some((k) => k.name === "Text")).toBe(false);
    // El hit es un Rect transparente (último del grupo) con el handler.
    const hit = [...mocks.konvaProps]
      .reverse()
      .find((k) => k.name === "Rect" && typeof k.props.onClick === "function");
    expect(hit).toBeDefined();
    expect(hit!.props.fill).toBe("rgba(0, 0, 0, 0)");
    const stopPropagation = vi.fn();
    (hit!.props.onClick as (e: unknown) => void)({
      cancelBubble: false,
      evt: { stopPropagation },
    });
    expect(stopPropagation).toHaveBeenCalled();
    expect(onTextEdit).toHaveBeenCalledWith("caption");
  });

  it("Ola 25 — superficie NO editable (preview del modal / 3D / confirmación): no se dibuja NADA", () => {
    // StudioPhotoPreview llama renderLayer SIN onTextEdit: el placeholder no pinta
    // ni texto ni zona — la tarjeta se ve exactamente como se imprimirá (vacía).
    const el = renderLayer(
      textLayer,
      slot(),
      STAGE,
      undefined,
      "rectangle",
      undefined,
      undefined,
      undefined,
      undefined,
      {
        allowText: true,
      },
    );
    expect(el).toBeNull();
  });

  it("override SOLO de estilo (sin text) → sigue siendo placeholder: tarjeta vacía", () => {
    // Ola 23/25 — el cliente cambió solo el color: sin texto del cliente no hay
    // nada que mostrar ni imprimir (renderTextLayer tampoco imprime sin text).
    const el = renderLayer(
      textLayer,
      slot({ textOverrides: { caption: { fill: "#E85B9F" } } }),
      STAGE,
      vi.fn(),
      "rectangle",
      undefined,
      undefined,
      undefined,
      undefined,
      {
        allowText: true,
      },
    ) as React.ReactElement;
    const children = (
      (el.props as { children: Array<React.ReactElement | null> }).children ?? []
    ).filter(Boolean);
    expect(children.some((c) => (c as React.ReactElement).key === "caption-text")).toBe(false);
    expect((children[0] as React.ReactElement<{ name?: string }>).props.name).toBe(
      "edit-indicator",
    );
  });

  it('override de texto vacío ("") → placeholder también (vacío = sin texto)', () => {
    const el = renderLayer(
      textLayer,
      slot({ textOverrides: { caption: { text: "" } } }),
      STAGE,
      undefined,
      "rectangle",
      undefined,
      undefined,
      undefined,
      undefined,
      { allowText: true },
    );
    expect(el).toBeNull();
  });

  it("con override: manda el texto del cliente y su estilo", () => {
    const el = renderLayer(
      textLayer,
      slot({ textOverrides: { caption: { text: "Mi viaje", fill: "#FF0000", fontSize: 20 } } }),
      STAGE,
      vi.fn(),
      "rectangle",
      undefined,
      undefined,
      undefined,
      undefined,
      { allowText: true },
    ) as React.ReactElement;
    const text = (el.props as { children: Array<React.ReactElement | null> }).children
      .filter(Boolean)
      .find((c) => (c as React.ReactElement).key === "caption-text") as React.ReactElement<{
      name?: string;
      opacity?: number;
      listening?: boolean;
      text?: string;
      fill?: string;
      fontSize?: number;
    }>;
    expect(text.props.text).toBe("Mi viaje");
    expect(text.props.fill).toBe("#FF0000");
    expect(text.props.fontSize).toBe(20);
    expect(text.props.name).toBeUndefined(); // no es guía
  });

  it("darkCard → texto blanco por defecto (sin override de fill)", () => {
    const el = renderLayer(
      textLayer,
      slot({ textOverrides: { caption: { text: "Hola" } } }),
      STAGE,
      vi.fn(),
      "rectangle",
      undefined,
      undefined,
      undefined,
      undefined,
      { allowText: true, darkCardBg: true },
    ) as React.ReactElement;
    const text = (el.props as { children: Array<React.ReactElement | null> }).children
      .filter(Boolean)
      .find((c) => (c as React.ReactElement).key === "caption-text") as React.ReactElement<{
      name?: string;
      opacity?: number;
      listening?: boolean;
      text?: string;
      fill?: string;
      fontSize?: number;
    }>;
    expect(text.props.fill).toBe("#FFFFFF");
  });

  // Ola 26 (Lucy 2026-09-09) — Polaroid Instagram: el color de letra sigue al de
  // la tarjeta POR CAPA, pero los hashtags SIEMPRE salen azul link IG (legible
  // sobre tarjeta clara u oscura), nunca blanco/negro del contraste.
  describe("Ola 26 — color de texto IG por capa (hashtags siempre azules)", () => {
    const hashtagsLayer = {
      id: "hashtags",
      type: "text",
      x: 22,
      y: 542,
      text: "#mirecuerdo #lucamsshop",
      fontSize: 13,
      fill: "#00376B",
      editable: true,
    } as unknown as CanvasLayer;

    const textFillOf = (el: React.ReactElement, key: string) => {
      const text = (el.props as { children: Array<React.ReactElement | null> }).children
        .filter(Boolean)
        .find((c) => (c as React.ReactElement).key === key) as React.ReactElement<{
        fill?: string;
      }>;
      return text.props.fill;
    };

    it("tarjeta OSCURA: hashtags azul IG legible (#0095F6), NO blanco; caption sí blanco", () => {
      const ht = renderLayer(
        hashtagsLayer,
        slot({ textOverrides: { hashtags: { text: "#amor #lucamsshop" } } }),
        STAGE,
        vi.fn(),
        "rectangle",
        undefined,
        undefined,
        undefined,
        undefined,
        { allowText: true, isIg: true, darkCardBg: true },
      ) as React.ReactElement;
      expect(textFillOf(ht, "hashtags-text")).toBe("#0095F6");

      const cap = renderLayer(
        textLayer,
        slot({ textOverrides: { caption: { text: "Hola" } } }),
        STAGE,
        vi.fn(),
        "rectangle",
        undefined,
        undefined,
        undefined,
        undefined,
        { allowText: true, isIg: true, darkCardBg: true },
      ) as React.ReactElement;
      expect(textFillOf(cap, "caption-text")).toBe("#FFFFFF");
    });

    it("tarjeta CLARA: hashtags azul clásico (#00376B); caption con su fill oscuro", () => {
      const ht = renderLayer(
        hashtagsLayer,
        slot({ textOverrides: { hashtags: { text: "#amor" } } }),
        STAGE,
        vi.fn(),
        "rectangle",
        undefined,
        undefined,
        undefined,
        undefined,
        { allowText: true, isIg: true, darkCardBg: false },
      ) as React.ReactElement;
      expect(textFillOf(ht, "hashtags-text")).toBe("#00376B");

      const cap = renderLayer(
        textLayer,
        slot({ textOverrides: { caption: { text: "Hola" } } }),
        STAGE,
        vi.fn(),
        "rectangle",
        undefined,
        undefined,
        undefined,
        undefined,
        { allowText: true, isIg: true, darkCardBg: false },
      ) as React.ReactElement;
      // textLayer (caption) no declara fill → fallback oscuro IG (#262626).
      expect(textFillOf(cap, "caption-text")).toBe("#262626");
    });

    it("el override de color del cliente SIEMPRE manda sobre el azul automático", () => {
      const ht = renderLayer(
        hashtagsLayer,
        slot({ textOverrides: { hashtags: { text: "#amor", fill: "#E85B9F" } } }),
        STAGE,
        vi.fn(),
        "rectangle",
        undefined,
        undefined,
        undefined,
        undefined,
        { allowText: true, isIg: true, darkCardBg: true },
      ) as React.ReactElement;
      expect(textFillOf(ht, "hashtags-text")).toBe("#E85B9F");
    });
  });

  it("click en texto editable (con texto del cliente) abre el editor (stopPropagation + callback)", () => {
    const onTextEdit = vi.fn();
    render(
      renderLayer(
        textLayer,
        slot({ textOverrides: { caption: { text: "Mi viaje" } } }),
        STAGE,
        onTextEdit,
        "rectangle",
        undefined,
        undefined,
        undefined,
        undefined,
        { allowText: true },
      ) as React.ReactElement,
    );
    const text = lastKonva("Text");
    const stopPropagation = vi.fn();
    (text!.onClick as (e: unknown) => void)({
      cancelBubble: false,
      evt: { stopPropagation },
    });
    expect(stopPropagation).toHaveBeenCalled();
    expect(onTextEdit).toHaveBeenCalledWith("caption");
  });

  it("texto NO editable: sin Group ni indicadores dashed", () => {
    const plain = { id: "t2", type: "text", x: 10, y: 10, text: "Fijo" } as unknown as CanvasLayer;
    const el = renderLayer(
      plain,
      slot(),
      STAGE,
      undefined,
      "rectangle",
      undefined,
      undefined,
      undefined,
      undefined,
      {
        allowText: true,
      },
    ) as React.ReactElement;
    expect(el.type).not.toBeUndefined();
    expect((el.props as { listening: boolean }).listening).toBe(false);
  });

  it("capa desconocida → null (default del switch)", () => {
    const unknown = { id: "u", type: "hologram" } as unknown as CanvasLayer;
    expect(renderLayer(unknown, slot(), STAGE, undefined)).toBeNull();
  });
});

// ── ProfilePhotoLayerRenderer (Ola 17) ───────────────────────────────

describe("renderLayer — profile-photo (foto de perfil del post IG)", () => {
  const profileLayer = {
    id: "profile_photo",
    type: "profile-photo",
    x: 34,
    y: 34,
    radius: 16,
  } as unknown as CanvasLayer;

  it("sin profileAssetUrl → no dibuja nada (se ve el placeholder del SVG)", () => {
    mocks.image = null;
    const { container } = render(
      renderLayer(profileLayer, slot(), STAGE, undefined) as React.ReactElement,
    );
    expect(container.querySelector("[data-konva]")).toBeNull();
  });

  it("con URL pero imagen cargando → null", () => {
    mocks.image = null;
    mocks.status = "loading";
    const { container } = render(
      renderLayer(
        profileLayer,
        slot({ profileAssetUrl: "https://x/av.png" }),
        STAGE,
        undefined,
      ) as React.ReactElement,
    );
    expect(container.querySelector("[data-konva]")).toBeNull();
  });

  it("con foto: cover circular centrado — clipFunc con ctx.arc(radio, radio, radio)", () => {
    mocks.image = { width: 100, height: 50, naturalWidth: 100, naturalHeight: 50 };
    mocks.status = "loaded";
    render(
      renderLayer(
        profileLayer,
        slot({ profileAssetUrl: "https://x/av.png" }),
        STAGE,
        undefined,
      ) as React.ReactElement,
    );
    const group = lastKonva("Group");
    expect(group).toBeDefined();
    expect(group!.listening).toBe(false);
    const { ctx, calls } = makeCtx();
    (group!.clipFunc as (c: unknown) => void)(ctx);
    const arc = calls.find(([m]) => m === "arc");
    expect(arc).toBeDefined();
    expect(arc![1]).toEqual([16, 16, 16, 0, Math.PI * 2]); // radio = layer.radius
    // cover: max(32/100, 32/50) = 0.64 → la foto ancha se recorta al alto
    const img = lastKonva("Image");
    expect(img!.height).toBeCloseTo(50 * 0.64, 5);
    expect(img!.width).toBeCloseTo(100 * 0.64, 5);
    expect(img!.x).toBeCloseTo((32 - 100 * 0.64) / 2, 5);
    expect(img!.y).toBeCloseTo((32 - 50 * 0.64) / 2, 5);
  });
});

// ── nextWheelScale (Ola 24 — zoom de rueda "milimétrico") ────────────

describe("nextWheelScale — paso fino de zoom por rueda (Ola 24)", () => {
  it("un notch = ×1.04 (4%): paso milimétrico, no el salto tosco de ×1.15", () => {
    // Lucy 2026-09-09: la rueda saltaba ×1.15 por notch y no dejaba afinar el
    // encuadre. El paso fino es multiplicativo y compartido por slot + modal.
    expect(nextWheelScale(1, -100)).toBeCloseTo(1.04, 10);
    expect(nextWheelScale(1, 100)).toBeCloseTo(1 / 1.04, 10);
    // El chip de zoom del slot (Math.round(scale × 100)) marcaría 104% / 96%.
    expect(Math.round(nextWheelScale(1, -100) * 100)).toBe(104);
  });

  it("varios notches componen suave (1.04^n) y permiten aterrizar fino", () => {
    let s = 1;
    for (let i = 0; i < 5; i++) s = nextWheelScale(s, -100);
    expect(s).toBeCloseTo(Math.pow(1.04, 5), 10); // ≈ 1.217, no 2.01 (1.15^5)
  });

  it("clamp a los límites del gesto (0.5–3.0 por defecto)", () => {
    expect(nextWheelScale(2.99, -100)).toBe(3);
    expect(nextWheelScale(0.51, 100)).toBe(0.5);
    // Respeta límites personalizados si el caller los pasa.
    expect(nextWheelScale(1, -100, 1, 2)).toBe(1.04);
  });
});
