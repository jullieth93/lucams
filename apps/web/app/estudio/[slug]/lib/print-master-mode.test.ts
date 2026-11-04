// @vitest-environment jsdom

/*
 * Tests del modo "master para imprenta" (ADR-166, 2026-10-22).
 *
 * Blinda la invariante de calidad de impresión del fallback ADR-081: los PNG
 * de producción que rasteriza el navegador (stage.toDataURL a 3×) deben
 * componerse desde el MASTER, no del derivado ≤800px del lienzo. La espera es
 * DETERMINISTA por src: no basta "hay nodo slot-photo" (el del derivado ya
 * estaba montado), la imagen del nodo debe ser la del master.
 *
 * Los stages son fakes con el contrato mínimo (findOne por nombre → nodo con
 * image().src), mismo patrón que slot-photo-readiness.test.ts.
 */

import { describe, expect, it, vi } from "vitest";
import {
  MasterPhotoLoadError,
  isPrintMasterMode,
  runWithPrintMasters,
  waitForMasterPhotosReady,
} from "./print-master-mode";

type FakeNode = { image: () => { src: string } };
type FakeStage = { findOne: (selector: string) => FakeNode | null };

function fakeStage(nodes: Record<string, string> = {}): FakeStage & {
  set: (selector: string, src: string) => void;
  remove: (selector: string) => void;
} {
  const map = new Map(Object.entries(nodes));
  return {
    findOne: (selector) => {
      const src = map.get(selector);
      return src === undefined ? null : { image: () => ({ src }) };
    },
    set: (selector, src) => {
      map.set(selector, src);
    },
    remove: (selector) => {
      map.delete(selector);
    },
  };
}

const MASTER = "https://signed.example/master.jpg?token=t";
const DERIVATIVE = "https://signed.example/master.canvas.webp?token=t";
const AVATAR_MASTER = "https://signed.example/avatar.jpg?token=t";

describe("waitForMasterPhotosReady", () => {
  it("nodo slot-photo con la imagen del MASTER → resuelve de inmediato", async () => {
    const stages = new Map<number, FakeStage | null>([[0, fakeStage({ ".slot-photo": MASTER })]]);
    const start = performance.now();
    await waitForMasterPhotosReady([{ slotIndex: 0, assetUrl: MASTER }], stages);
    expect(performance.now() - start).toBeLessThan(200);
  });

  it("nodo montado con el DERIVADO (carrera del re-render) → SIGUE esperando al master", async () => {
    // El bug que este helper previene: waitForSlotPhotosReady resolvería aquí
    // (hay nodo), pero es la imagen del derivado — el snapshot saldría a 800px.
    const stage = fakeStage({ ".slot-photo": DERIVATIVE });
    const stages = new Map<number, FakeStage | null>([[0, stage]]);
    // useImage resuelve el master ~3 frames después.
    setTimeout(() => stage.set(".slot-photo", MASTER), 50);
    const start = performance.now();
    await waitForMasterPhotosReady([{ slotIndex: 0, assetUrl: MASTER }], stages, 2000);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(1000);
  });

  it("master que NUNCA carga → resuelve al deadline (no cuelga el finalize)", async () => {
    const stages = new Map<number, FakeStage | null>([
      [0, fakeStage({ ".slot-photo": DERIVATIVE })],
    ]);
    const start = performance.now();
    await waitForMasterPhotosReady([{ slotIndex: 0, assetUrl: MASTER }], stages, 80);
    expect(performance.now() - start).toBeGreaterThanOrEqual(60);
  });

  it("también exige el master en la foto de PERFIL IG (slot-profile-photo)", async () => {
    const stage = fakeStage({
      ".slot-photo": MASTER,
      ".slot-profile-photo": DERIVATIVE,
    });
    const stages = new Map<number, FakeStage | null>([[0, stage]]);
    setTimeout(() => stage.set(".slot-profile-photo", AVATAR_MASTER), 50);
    const start = performance.now();
    await waitForMasterPhotosReady(
      [{ slotIndex: 0, assetUrl: MASTER, profileAssetUrl: AVATAR_MASTER }],
      stages,
      2000,
    );
    expect(performance.now() - start).toBeGreaterThanOrEqual(40);
  });
});

describe("runWithPrintMasters", () => {
  // jsdom no decodifica imágenes reales: se stubea Image para que el preload
  // "resuelva" de inmediato (onload al asignar src).
  function stubInstantImage() {
    vi.stubGlobal(
      "Image",
      class {
        crossOrigin = "";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          setTimeout(() => this.onload?.(), 0);
        }
      },
    );
  }

  it("corre fn con el modo master ON y lo apaga al terminar (también si fn lanza)", async () => {
    stubInstantImage();
    const stages = new Map<number, FakeStage | null>([[0, fakeStage({ ".slot-photo": MASTER })]]);
    const slots = [{ slotIndex: 0, assetUrl: MASTER }];

    expect(isPrintMasterMode()).toBe(false);
    const seenInside = await runWithPrintMasters(slots, stages, async () => isPrintMasterMode());
    expect(seenInside).toBe(true);
    expect(isPrintMasterMode()).toBe(false);

    await expect(
      runWithPrintMasters(slots, stages, async () => {
        throw new Error("toDataURL falló");
      }),
    ).rejects.toThrow("toDataURL falló");
    expect(isPrintMasterMode()).toBe(false);
  });

  it("[STU-01] auto-renueva signed URLs vencidas (>1h) vía refreshMasters y exporta el master fresco", async () => {
    const EXPIRED_MASTER = "https://signed.example/master.jpg?token=expired";
    const FRESH_MASTER = "https://signed.example/master.jpg?token=fresh";

    vi.stubGlobal(
      "Image",
      class {
        crossOrigin = "";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(v: string) {
          setTimeout(() => {
            if (v.includes("expired")) this.onerror?.();
            else this.onload?.();
          }, 0);
        }
      },
    );

    const stage = fakeStage({ ".slot-photo": DERIVATIVE });
    const stages = new Map<number, FakeStage | null>([[0, stage]]);
    const refreshMasters = vi.fn(async () => {
      // Simula que el store/stage re-mapea al master recién firmado.
      setTimeout(() => stage.set(".slot-photo", FRESH_MASTER), 10);
      return [{ slotIndex: 0, assetUrl: FRESH_MASTER }];
    });

    const exported = await runWithPrintMasters(
      [{ slotIndex: 0, assetUrl: EXPIRED_MASTER }],
      stages,
      async () => stage.findOne(".slot-photo")?.image().src,
      { refreshMasters, timeoutMs: 1000 },
    );

    expect(refreshMasters).toHaveBeenCalledTimes(1);
    expect(exported).toBe(FRESH_MASTER);
    expect(isPrintMasterMode()).toBe(false);
  });

  it("[STU-01] fail-closed: lanza MasterPhotoLoadError si el master sigue fallando tras refresh (jamás hornea #F4ECFF)", async () => {
    const BROKEN_MASTER = "https://signed.example/master.jpg?token=broken";
    vi.stubGlobal(
      "Image",
      class {
        crossOrigin = "";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          setTimeout(() => this.onerror?.(), 0);
        }
      },
    );

    const stage = fakeStage({ ".slot-photo": DERIVATIVE });
    const stages = new Map<number, FakeStage | null>([[0, stage]]);
    const fn = vi.fn(async () => "never-called");

    await expect(
      runWithPrintMasters([{ slotIndex: 0, assetUrl: BROKEN_MASTER }], stages, fn, {
        refreshMasters: async () => [{ slotIndex: 0, assetUrl: BROKEN_MASTER }],
        timeoutMs: 200,
      }),
    ).rejects.toBeInstanceOf(MasterPhotoLoadError);

    expect(fn).not.toHaveBeenCalled();
    expect(isPrintMasterMode()).toBe(false);
  });
});
