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

import { describe, expect, it } from "vitest";
import { waitForSlotPhotosReady } from "./slot-photo-readiness";

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
});
