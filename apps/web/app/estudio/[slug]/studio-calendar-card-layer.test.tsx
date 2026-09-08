// @vitest-environment jsdom

/*
 * Tests unitarios de CalendarCardLayer — la tarjeta compuesta del mes en el slot
 * del calendario (studio-calendar-card-layer.tsx, 0% de cobertura previa).
 *
 * Cubre: dibujo offscreen (ctx null vs ctx real), re-resolución de la fuente del
 * título al cambiar el selector calendarFont (Lucy 2026-09-07), smart-crop inicial
 * (con/sin foto, con transform persistido, offset significativo vs mínimo), drag
 * en vivo (delta local durante el gesto, commit al store solo en dragEnd y solo
 * si hubo delta) y los handlers de cursor.
 *
 * Mocks: react-konva (registro de props), use-image (imagen controlable),
 * smart-crop (resultado controlable — smartcrop.js necesita canvas real),
 * document.fonts no existe en jsdom → ensure*FontLoaded degrada gracefully.
 * El canvas DOM se stubbea con un ctx 2D grabador. Corre en CI sin Supabase.
 */

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  image: null as null | {
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
  },
  status: "loading",
  konvaProps: [] as Array<{ name: string; props: Record<string, unknown> }>,
  smartCropResult: null as null | { offsetX: number; offsetY: number },
  analyzeSmartCrop: null as unknown as (
    image: unknown,
    w: number,
    h: number,
    scale: number,
  ) => Promise<{ offsetX: number; offsetY: number } | null>,
}));

vi.mock("react-konva", async () => {
  const { forwardRef, useEffect } = await import("react");
  const nodeStub = {
    getLayer: () => ({ batchDraw: () => {} }),
    position: () => {},
    x: () => 0,
    y: () => 0,
    getStage: () => null,
  };
  const Image = forwardRef(function MockImage(
    { children, ...props }: { children?: ReactNode } & Record<string, unknown>,
    ref: unknown,
  ) {
    useEffect(() => {
      if (typeof ref === "function") (ref as (n: unknown) => void)(nodeStub);
    });
    mocks.konvaProps.push({ name: "Image", props });
    return <div data-konva="Image">{children as ReactNode}</div>;
  });
  return { Image };
});

vi.mock("use-image", () => ({ default: () => [mocks.image, mocks.status] }));

vi.mock("./lib/smart-crop", () => ({
  analyzeSmartCrop: (image: unknown, w: number, h: number, scale: number) =>
    mocks.analyzeSmartCrop(image, w, h, scale),
}));

// drawCalendarPage real (rama classic y split) espiado: corre sobre un ctx stub
// (no depende de canvas nativo) y deja inspeccionar los opts de cada repintado.
vi.mock("@/features/personalization/calendar-draw", async () => {
  const real = await vi.importActual<typeof import("@/features/personalization/calendar-draw")>(
    "@/features/personalization/calendar-draw",
  );
  return { ...real, drawCalendarPage: vi.fn(real.drawCalendarPage) };
});

import { drawCalendarPage } from "@/features/personalization/calendar-draw";
import { CalendarCardLayer } from "./studio-calendar-card-layer";

beforeEach(() => {
  vi.mocked(drawCalendarPage).mockClear();
});

beforeEach(() => {
  mocks.konvaProps.length = 0;
  mocks.image = null;
  mocks.status = "loading";
  mocks.smartCropResult = null;
  mocks.analyzeSmartCrop = vi.fn(async () => mocks.smartCropResult);
  // CSS vars de next/font simuladas (resolveCalendarTitleFont las lee del root).
  document.documentElement.style.setProperty("--font-fredoka", '"__Fredoka_test", sans-serif');
  document.documentElement.style.setProperty("--font-inter", '"__Inter_test", sans-serif');
  document.documentElement.style.setProperty("--font-caveat", '"__Caveat_test", sans-serif');
  // jsdom no implementa getContext → stub que devuelve un ctx 2D tolerante.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(makeCtx() as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Ctx 2D stub: cualquier método es un no-op, cualquier prop se acepta. */
function makeCtx() {
  return new Proxy(
    { canvas: null },
    {
      get: (t, prop) => {
        if (prop in t) return (t as Record<string | symbol, unknown>)[prop];
        if (prop === "measureText") return () => ({ width: 10 });
        return () => undefined;
      },
      set: (t, prop, v) => {
        (t as Record<string | symbol, unknown>)[prop] = v;
        return true;
      },
    },
  );
}

function lastImageProps() {
  const found = mocks.konvaProps.filter((k) => k.name === "Image");
  return found[found.length - 1]?.props;
}

function renderLayer(extra: Record<string, unknown> = {}) {
  return render(
    <CalendarCardLayer
      assetUrl={null}
      photoTransform={null}
      year={2027}
      monthIndex0={0}
      templateStageWidth={600}
      stageWidth={300}
      stageHeight={400}
      {...extra}
    />,
  );
}

describe("CalendarCardLayer — dibujo de la tarjeta", () => {
  it("sin foto: dibuja la página (drawCalendarPage con photo null) y no es draggable", async () => {
    renderLayer();
    await waitFor(() => expect(drawCalendarPage).toHaveBeenCalled());
    const drawOpts = vi.mocked(drawCalendarPage).mock.calls.at(-1)![1];
    expect(drawOpts.photo).toBeNull();
    expect(drawOpts.year).toBe(2027);
    expect(drawOpts.monthIndex0).toBe(0);
    expect(drawOpts.layout).toBe("classic");
    const img = lastImageProps();
    expect(img!.draggable).toBe(false);
    expect(img!.preventDefault).toBe(false);
  });

  it("layout split se propaga al dibujo", async () => {
    renderLayer({ layout: "split" });
    await waitFor(() => expect(drawCalendarPage).toHaveBeenCalled());
    const drawOpts = vi.mocked(drawCalendarPage).mock.calls.at(-1)![1];
    expect(drawOpts.layout).toBe("split");
  });

  it("ctx null (canvas sin 2D) → no dibuja ni rompe", () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null as never);
    const { container } = renderLayer();
    expect(container.querySelector("[data-konva='Image']")).not.toBeNull();
    expect(drawCalendarPage).not.toHaveBeenCalled();
  });

  it("con foto y callback: draggable=true (pan en vivo) y la foto llega al dibujo", async () => {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    renderLayer({ assetUrl: "https://x/foto.jpg", onPhotoTransformChange: vi.fn() });
    await waitFor(() => expect(drawCalendarPage).toHaveBeenCalled());
    const drawOpts = vi.mocked(drawCalendarPage).mock.calls.at(-1)![1];
    expect(drawOpts.photo).toBe(mocks.image);
    expect(lastImageProps()!.draggable).toBe(true);
    expect(lastImageProps()!.preventDefault).toBe(true);
  });
});

describe("CalendarCardLayer — selector de tipo de letra (re-resolución)", () => {
  it("resuelve la familia real de la key y la pasa al dibujo", async () => {
    renderLayer({ calendarFont: "caveat" });
    await waitFor(() => {
      const drawOpts = vi.mocked(drawCalendarPage).mock.calls.at(-1)![1];
      expect(drawOpts.fonts?.title).toBe("__Caveat_test");
    });
    // El body/grilla SIEMPRE es Inter, sin importar la elección del título.
    const drawOpts = vi.mocked(drawCalendarPage).mock.calls.at(-1)![1];
    expect(drawOpts.fonts?.body).toBe("__Inter_test");
  });

  it("al cambiar la key re-resuelve y repinta con la nueva familia (Lucy 2026-09-07)", async () => {
    const { rerender } = render(
      <CalendarCardLayer
        assetUrl={null}
        photoTransform={null}
        year={2027}
        monthIndex0={0}
        calendarFont="fredoka"
        templateStageWidth={600}
        stageWidth={300}
        stageHeight={400}
      />,
    );
    await waitFor(() => {
      expect(vi.mocked(drawCalendarPage).mock.calls.at(-1)![1].fonts?.title).toBe("__Fredoka_test");
    });
    rerender(
      <CalendarCardLayer
        assetUrl={null}
        photoTransform={null}
        year={2027}
        monthIndex0={0}
        calendarFont="inter"
        templateStageWidth={600}
        stageWidth={300}
        stageHeight={400}
      />,
    );
    await waitFor(() => {
      expect(vi.mocked(drawCalendarPage).mock.calls.at(-1)![1].fonts?.title).toBe("__Inter_test");
    });
  });

  it("con transform persistido: scalePhotoTransformToPage reescala el encuadre", async () => {
    renderLayer({
      photoTransform: { offsetX: 30, offsetY: -20, scale: 1.2 },
    });
    await waitFor(() => expect(drawCalendarPage).toHaveBeenCalled());
    const drawOpts = vi.mocked(drawCalendarPage).mock.calls.at(-1)![1];
    // 600 → 1080: factor 1.8 (scalePhotoTransformToPage)
    expect(drawOpts.photoTransform).toEqual({ offsetX: 54, offsetY: -36, scale: 1.2 });
  });
});

describe("CalendarCardLayer — smart-crop inicial", () => {
  const photo = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };

  it("foto nueva sin encuadre: offset significativo (>5% de la ventana) se aplica", async () => {
    mocks.image = photo;
    mocks.status = "loaded";
    mocks.smartCropResult = { offsetX: 400, offsetY: 300 };
    const onChange = vi.fn();
    renderLayer({ assetUrl: "https://x/foto.jpg", onPhotoTransformChange: onChange });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ offsetX: 400, offsetY: 300 }));
  });

  it("offset insignificativo (<5%) → no molesta (cover centrado ya está bien)", async () => {
    mocks.image = photo;
    mocks.status = "loaded";
    mocks.smartCropResult = { offsetX: 0.5, offsetY: 0.5 };
    const onChange = vi.fn();
    renderLayer({ assetUrl: "https://x/foto.jpg", onPhotoTransformChange: onChange });
    await new Promise((r) => setTimeout(r, 20));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("con photoTransform persistido → no auto-aplica smart-crop", async () => {
    mocks.image = photo;
    mocks.status = "loaded";
    mocks.smartCropResult = { offsetX: 400, offsetY: 300 };
    const onChange = vi.fn();
    renderLayer({
      assetUrl: "https://x/foto.jpg",
      photoTransform: { offsetX: 0, offsetY: 0, scale: 1 },
      onPhotoTransformChange: onChange,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.analyzeSmartCrop).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("sin callback (vista previa) → no auto-aplica", async () => {
    mocks.image = photo;
    mocks.status = "loaded";
    mocks.smartCropResult = { offsetX: 400, offsetY: 300 };
    renderLayer({ assetUrl: "https://x/foto.jpg" });
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.analyzeSmartCrop).not.toHaveBeenCalled();
  });
});

describe("CalendarCardLayer — drag en vivo (marco quieto, foto se re-encuadra)", () => {
  function setupDrag() {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    const onChange = vi.fn();
    const onStart = vi.fn();
    const onEnd = vi.fn();
    renderLayer({
      assetUrl: "https://x/foto.jpg",
      photoTransform: { offsetX: 10, offsetY: 20, scale: 1 },
      onPhotoTransformChange: onChange,
      onPhotoDragStart: onStart,
      onPhotoDragEnd: onEnd,
    });
    return { onChange, onStart, onEnd };
  }

  it("dragStart avisa y dragMove repinta con el delta en vivo", async () => {
    const { onStart } = setupDrag();
    const img = lastImageProps();
    (img!.onDragStart as () => void)();
    expect(onStart).toHaveBeenCalled();
    const target = { x: () => 15, y: () => 25, position: () => {} };
    (img!.onDragMove as (e: unknown) => void)({ target });
    await waitFor(() => {
      const drawOpts = vi.mocked(drawCalendarPage).mock.calls.at(-1)![1];
      // offset base (10,20) + delta (15,25) → unidades de página ×1.8
      expect(drawOpts.photoTransform).toEqual({ offsetX: 45, offsetY: 81, scale: 1 });
    });
  });

  it("dragEnd comitea base + delta acumulado y resetea el nodo", async () => {
    const { onChange, onEnd } = setupDrag();
    const img = lastImageProps();
    (img!.onDragStart as () => void)();
    const target = { x: () => 15, y: () => 25, position: vi.fn() };
    (img!.onDragMove as (e: unknown) => void)({ target });
    (img!.onDragEnd as (e: unknown) => void)({ target });
    expect(target.position).toHaveBeenCalledWith({ x: 0, y: 0 });
    expect(onChange).toHaveBeenCalledWith({ offsetX: 25, offsetY: 45 }); // 10+15, 20+25
    expect(onEnd).toHaveBeenCalled();
  });

  it("dragEnd sin delta (click sin movimiento) → no comitea ruido al store", async () => {
    const { onChange } = setupDrag();
    const img = lastImageProps();
    (img!.onDragStart as () => void)();
    const target = { x: () => 0, y: () => 0, position: vi.fn() };
    (img!.onDragEnd as (e: unknown) => void)({ target });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("sin callback de transform: dragMove/dragEnd son no-op", async () => {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    renderLayer({ assetUrl: "https://x/foto.jpg" });
    const img = lastImageProps();
    const target = { x: () => 5, y: () => 5, position: vi.fn() };
    (img!.onDragMove as (e: unknown) => void)({ target });
    (img!.onDragEnd as (e: unknown) => void)({ target });
    expect(target.position).not.toHaveBeenCalled();
  });
});

describe("CalendarCardLayer — cursor sobre la tarjeta arrastrable", () => {
  it("enter/down/up/leave cambian el cursor del stage (grab/grabbing/grab/vacío)", () => {
    mocks.image = { width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 };
    mocks.status = "loaded";
    renderLayer({ assetUrl: "https://x/foto.jpg", onPhotoTransformChange: vi.fn() });
    const img = lastImageProps();
    const container = { style: {} as Record<string, string> };
    const evt = () => ({
      target: { getStage: () => ({ container: () => container }) },
    });
    const run = (h: string) => (img![h] as (e: unknown) => void)(evt());
    run("onMouseEnter");
    expect(container.style.cursor).toBe("grab");
    run("onMouseDown");
    expect(container.style.cursor).toBe("grabbing");
    run("onMouseUp");
    expect(container.style.cursor).toBe("grab");
    run("onMouseLeave");
    expect(container.style.cursor).toBe("");
  });

  it("no arrastrable (sin foto): los handlers no tocan el cursor", () => {
    renderLayer();
    const img = lastImageProps();
    const container = { style: {} as Record<string, string> };
    const evt = () => ({
      target: { getStage: () => ({ container: () => container }) },
    });
    (img!.onMouseEnter as (e: unknown) => void)(evt());
    expect(container.style.cursor).toBeUndefined();
  });
});
