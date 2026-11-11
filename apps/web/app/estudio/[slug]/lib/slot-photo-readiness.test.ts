// @vitest-environment jsdom

/*
 * Tests de waitForSlotPhotosReady (2026-10-12 — extraída de studio-editor y
 * extendida a la foto de perfil IG). Blinda la carrera de rasterizado: un
 * stage MONTADO no implica foto decodificada (useImage es async) y un snapshot
 * en esa ventana hornea el placeholder lila (bug STG 2026-10-08).
 *
 * Los stages son fakes con el contrato mínimo (findOne por nombre de nodo);
 * los tiempos usan el timeoutMs acotado del propio helper (sin fake timers).
 */

import { describe, expect, it, vi } from "vitest";
import {
  FORCE_DECODE_BUDGET_BASE_MS,
  FORCE_DECODE_BUDGET_MAX_MS,
  FORCE_DECODE_BUDGET_PER_PHOTO_MS,
  ensureStagePhotosDecoded,
  forceDecodeBudgetMs,
  waitForSlotPhotosReady,
} from "./slot-photo-readiness";

type FakeStage = { findOne: (selector: string) => object | null };

function fakeStage(nodeNames: string[] = []): FakeStage & { add: (name: string) => void } {
  const nodes = new Set(nodeNames);
  return {
    findOne: (selector) => (nodes.has(selector) ? {} : null),
    add: (name) => {
      nodes.add(name);
    },
  };
}

const slot = (slotIndex: number, assetUrl: string | null, profileAssetUrl?: string) => ({
  slotIndex,
  assetUrl,
  profileAssetUrl,
});

describe("waitForSlotPhotosReady", () => {
  it("todas las fotos montadas → resuelve de inmediato", async () => {
    const stages = new Map<number, FakeStage | null>([[0, fakeStage([".slot-photo"])]]);
    const start = performance.now();
    await waitForSlotPhotosReady([slot(0, "https://x/0.png")], stages);
    expect(performance.now() - start).toBeLessThan(200);
  });

  it("slot sin foto asignada → no hay nada que esperar", async () => {
    const stages = new Map<number, FakeStage | null>([[0, fakeStage()]]);
    await waitForSlotPhotosReady([slot(0, null)], stages);
  });

  it("foto decodificando → ESPERA a que aparezca el nodo slot-photo antes de resolver", async () => {
    const stage = fakeStage();
    const stages = new Map<number, FakeStage | null>([[0, stage]]);
    // La imagen termina de decodificar ~3 frames después.
    setTimeout(() => stage.add(".slot-photo"), 50);
    const start = performance.now();
    await waitForSlotPhotosReady([slot(0, "https://x/0.png")], stages, 2000);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(1000);
  });

  it("imagen que NUNCA carga → resuelve al deadline acotado (no cuelga el click)", async () => {
    const stages = new Map<number, FakeStage | null>([[0, fakeStage()]]);
    const start = performance.now();
    await waitForSlotPhotosReady([slot(0, "https://x/rota.png")], stages, 80);
    expect(performance.now() - start).toBeGreaterThanOrEqual(60);
  });

  it("foto de perfil IG decodificando → también bloquea el rasterizado", async () => {
    const stage = fakeStage([".slot-photo"]);
    const stages = new Map<number, FakeStage | null>([[0, stage]]);
    setTimeout(() => stage.add(".slot-profile-photo"), 50);
    const start = performance.now();
    await waitForSlotPhotosReady(
      [slot(0, "https://x/0.png", "https://x/avatar.png")],
      stages,
      2000,
    );
    expect(performance.now() - start).toBeGreaterThanOrEqual(40);
  });

  it("stage aún no montado con foto asignada → espera (el montaje lo fuerza el caller)", async () => {
    const stages = new Map<number, FakeStage | null>([[0, null]]);
    setTimeout(() => stages.set(0, fakeStage([".slot-photo"])), 50);
    const start = performance.now();
    await waitForSlotPhotosReady([slot(0, "https://x/0.png")], stages, 2000);
    expect(performance.now() - start).toBeGreaterThanOrEqual(40);
  });

  // 2026-11-07 (bug owner — celular real): el nodo existe pero el bitmap pudo
  // ser descartado por presión de memoria → se fuerza image.decode() antes de
  // rasterizar (sin él, el snapshot re-dibuja vacío: preview/3D sin fotos).
  it("fuerza decode() de las imágenes presentes (bitmap descartado en móvil)", async () => {
    const decode = vi.fn().mockResolvedValue(undefined);
    const profileDecode = vi.fn().mockResolvedValue(undefined);
    const stage: FakeStage = {
      findOne: (selector) =>
        selector === ".slot-photo"
          ? { image: () => ({ decode }) }
          : selector === ".slot-profile-photo"
            ? { image: () => ({ decode: profileDecode }) }
            : null,
    };
    const stages = new Map<number, FakeStage | null>([[0, stage]]);
    await waitForSlotPhotosReady(
      [slot(0, "https://x/0.png", "https://x/avatar.png")],
      stages,
      2000,
    );
    expect(decode).toHaveBeenCalledTimes(1);
    expect(profileDecode).toHaveBeenCalledTimes(1);
  });

  it("decode() que rechaza (foto rota) no rompe ni cuelga el rasterizado", async () => {
    const decode = vi.fn().mockRejectedValue(new Error("broken"));
    const stage: FakeStage = {
      findOne: (selector) => (selector === ".slot-photo" ? { image: () => ({ decode }) } : null),
    };
    const stages = new Map<number, FakeStage | null>([[0, stage]]);
    await waitForSlotPhotosReady([slot(0, "https://x/rota.png")], stages, 2000);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it("nodos sin image()/decode() (fake mínimo) pasan el re-decode como no-op", async () => {
    const stages = new Map<number, FakeStage | null>([[0, fakeStage([".slot-photo"])]]);
    await waitForSlotPhotosReady([slot(0, "https://x/0.png")], stages);
  });
});

// 2026-11-10 (bug STG bola navideña 5× = 10 fotos en celular): el techo fijo
// de 3 s se agotaba con muchas fotos y el bake salía con caras vacías. El
// presupuesto ahora escala por foto, con piso y tope.
describe("forceDecodeBudgetMs", () => {
  it("sin fotos (o valores inválidos) → piso histórico de 3 s", () => {
    expect(forceDecodeBudgetMs(0)).toBe(3000);
    expect(forceDecodeBudgetMs(-3)).toBe(3000);
    expect(forceDecodeBudgetMs(Number.NaN)).toBe(3000);
  });

  it("escala por foto: base + 700 ms por imagen", () => {
    expect(forceDecodeBudgetMs(1)).toBe(
      FORCE_DECODE_BUDGET_BASE_MS + FORCE_DECODE_BUDGET_PER_PHOTO_MS,
    );
    expect(forceDecodeBudgetMs(2)).toBe(
      FORCE_DECODE_BUDGET_BASE_MS + 2 * FORCE_DECODE_BUDGET_PER_PHOTO_MS,
    );
    expect(forceDecodeBudgetMs(10)).toBe(
      FORCE_DECODE_BUDGET_BASE_MS + 10 * FORCE_DECODE_BUDGET_PER_PHOTO_MS,
    );
  });

  it("muchas fotos → topa en el máximo (nunca cuelga el click)", () => {
    expect(forceDecodeBudgetMs(100)).toBe(FORCE_DECODE_BUDGET_MAX_MS);
  });
});

describe("ensureStagePhotosDecoded — re-decode puntual pre-toDataURL", () => {
  it("decodifica foto principal y avatar del stage antes de rasterizar", async () => {
    const decodeMain = vi.fn().mockResolvedValue(undefined);
    const decodeProfile = vi.fn().mockResolvedValue(undefined);
    const stage: FakeStage = {
      findOne: (selector) =>
        selector === ".slot-photo"
          ? { image: () => ({ decode: decodeMain }) }
          : selector === ".slot-profile-photo"
            ? { image: () => ({ decode: decodeProfile }) }
            : null,
    };
    await ensureStagePhotosDecoded(stage, {
      assetUrl: "https://x/0.png",
      profileAssetUrl: "https://x/avatar.png",
    });
    expect(decodeMain).toHaveBeenCalledTimes(1);
    expect(decodeProfile).toHaveBeenCalledTimes(1);
  });

  it("stage nulo o slot sin fotos es no-op inmediato", async () => {
    await ensureStagePhotosDecoded(null, { assetUrl: "https://x/0.png" });
    await ensureStagePhotosDecoded(fakeStage(), { assetUrl: null });
  });
});
