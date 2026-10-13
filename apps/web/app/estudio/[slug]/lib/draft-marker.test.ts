// @vitest-environment jsdom
/*
 * Fase 2 · item 2.4 — marcador del DRAFT activo por producto (localStorage) y
 * la decisión de ofrecer "Continuar donde quedaste".
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  studioDraftStorageKey,
  readStudioDraftId,
  readStudioDraftMarker,
  writeStudioDraftId,
  clearStudioDraftId,
  shouldOfferDraftResume,
  DRAFT_MARKER_MAX_AGE_MS,
  studioCanvasSnapshotKey,
  readStudioCanvasSnapshot,
  writeStudioCanvasSnapshot,
  clearStudioCanvasSnapshot,
  shouldUseCanvasSnapshot,
} from "./draft-marker";

beforeEach(() => window.localStorage.clear());

describe("draft marker (localStorage por producto)", () => {
  it("la clave es por slug de producto", () => {
    expect(studioDraftStorageKey("fotoimanes-cuadrados")).toBe(
      "lucams_studio_draft_fotoimanes-cuadrados",
    );
  });

  it("write → read devuelve designId y savedAt; clear lo borra", () => {
    const before = Date.now();
    writeStudioDraftId("polaroid", "design-123");
    const marker = readStudioDraftMarker("polaroid");
    expect(marker?.designId).toBe("design-123");
    expect(marker?.savedAt).toBeGreaterThanOrEqual(before);
    expect(readStudioDraftId("polaroid")).toBe("design-123");
    clearStudioDraftId("polaroid");
    expect(readStudioDraftId("polaroid")).toBeNull();
  });

  it("el marcador es POR producto: un slug no contamina otro", () => {
    writeStudioDraftId("polaroid", "design-A");
    writeStudioDraftId("calendario", "design-B");
    expect(readStudioDraftId("polaroid")).toBe("design-A");
    expect(readStudioDraftId("calendario")).toBe("design-B");
    clearStudioDraftId("polaroid");
    expect(readStudioDraftId("calendario")).toBe("design-B");
  });

  it("sin marcador → null", () => {
    expect(readStudioDraftMarker("nada")).toBeNull();
  });

  it("marcador LEGACY (string plano, escrito al entrar sin progreso) → null y se AUTO-LIMPIA", () => {
    // La versión anterior guardaba el designId como string plano en el boot —
    // sin evidencia de progreso real. No es confiable: no se ofrece y se borra.
    window.localStorage.setItem(studioDraftStorageKey("polaroid"), "design-viejo");
    expect(readStudioDraftMarker("polaroid")).toBeNull();
    expect(window.localStorage.getItem(studioDraftStorageKey("polaroid"))).toBeNull();
  });

  it("marcador corrupto (JSON inválido o campos faltantes) → null y se limpia", () => {
    window.localStorage.setItem(studioDraftStorageKey("a"), "{no-json");
    expect(readStudioDraftMarker("a")).toBeNull();
    window.localStorage.setItem(studioDraftStorageKey("b"), JSON.stringify({ designId: "x" }));
    expect(readStudioDraftMarker("b")).toBeNull();
    window.localStorage.setItem(
      studioDraftStorageKey("c"),
      JSON.stringify({ designId: "", savedAt: Date.now() }),
    );
    expect(readStudioDraftMarker("c")).toBeNull();
    expect(window.localStorage.getItem(studioDraftStorageKey("b"))).toBeNull();
  });

  it("marcador VENCIDO (> DRAFT_MARKER_MAX_AGE_MS — el draft ya pudo purgar server-side) → null y se limpia", () => {
    const now = Date.now();
    window.localStorage.setItem(
      studioDraftStorageKey("viejo"),
      JSON.stringify({ designId: "design-1", savedAt: now - DRAFT_MARKER_MAX_AGE_MS - 1000 }),
    );
    expect(readStudioDraftMarker("viejo", { now })).toBeNull();
    expect(window.localStorage.getItem(studioDraftStorageKey("viejo"))).toBeNull();
  });

  it("marcador dentro de la ventana de vigencia → se ofrece", () => {
    const now = Date.now();
    window.localStorage.setItem(
      studioDraftStorageKey("fresco"),
      JSON.stringify({ designId: "design-1", savedAt: now - DRAFT_MARKER_MAX_AGE_MS + 1000 }),
    );
    expect(readStudioDraftMarker("fresco", { now })?.designId).toBe("design-1");
  });

  it("savedAt en el FUTURO (reloj del cliente disparado) → null y se limpia", () => {
    const now = Date.now();
    window.localStorage.setItem(
      studioDraftStorageKey("futuro"),
      JSON.stringify({ designId: "design-1", savedAt: now + 10 * 60_000 }),
    );
    expect(readStudioDraftMarker("futuro", { now })).toBeNull();
  });

  it("write con designId vacío no escribe nada", () => {
    writeStudioDraftId("polaroid", "");
    expect(readStudioDraftId("polaroid")).toBeNull();
  });

  it("localStorage que revienta (incógnito) degrada en silencio", () => {
    const original = window.localStorage;
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    } as unknown as Storage;
    Object.defineProperty(window, "localStorage", { value: throwing, configurable: true });
    expect(readStudioDraftId("polaroid")).toBeNull();
    expect(readStudioDraftMarker("polaroid")).toBeNull();
    expect(() => writeStudioDraftId("polaroid", "x")).not.toThrow();
    expect(() => clearStudioDraftId("polaroid")).not.toThrow();
    Object.defineProperty(window, "localStorage", { value: original, configurable: true });
  });
});

describe("shouldOfferDraftResume", () => {
  it("con marcador y sin ?designId= → ofrece continuar", () => {
    expect(
      shouldOfferDraftResume({
        savedDesignId: "design-1",
        urlHasDesignId: false,
        hasInitialDesign: false,
      }),
    ).toBe(true);
  });

  it("?designId= en la URL manda sobre el marcador (link directo)", () => {
    expect(
      shouldOfferDraftResume({
        savedDesignId: "design-1",
        urlHasDesignId: true,
        hasInitialDesign: false,
      }),
    ).toBe(false);
  });

  it("con diseño ya recuperado no hay nada que ofrecer", () => {
    expect(
      shouldOfferDraftResume({
        savedDesignId: "design-1",
        urlHasDesignId: false,
        hasInitialDesign: true,
      }),
    ).toBe(false);
  });

  it("sin marcador → boot normal directo", () => {
    expect(
      shouldOfferDraftResume({
        savedDesignId: null,
        urlHasDesignId: false,
        hasInitialDesign: false,
      }),
    ).toBe(false);
  });

  it("integración: marcador sin progreso real (legacy string) no llega a la decisión", () => {
    // El bug reportado 2026-10-13: el marcador se escribía al ENTRAR al estudio
    // y el interstitial salía siempre. El read nuevo lo descarta antes de decidir.
    window.localStorage.setItem(studioDraftStorageKey("polaroid"), "design-sin-progreso");
    const marker = readStudioDraftMarker("polaroid");
    expect(
      shouldOfferDraftResume({
        savedDesignId: marker?.designId ?? null,
        urlHasDesignId: false,
        hasInitialDesign: false,
      }),
    ).toBe(false);
  });

  it("integración: marcador con progreso real (write tras auto-save) sí ofrece", () => {
    writeStudioDraftId("polaroid", "design-con-progreso");
    const marker = readStudioDraftMarker("polaroid");
    expect(
      shouldOfferDraftResume({
        savedDesignId: marker?.designId ?? null,
        urlHasDesignId: false,
        hasInitialDesign: false,
      }),
    ).toBe(true);
  });
});

describe("canvas snapshot de recuperación (ADR-133)", () => {
  const canvas = { version: 2, slotCount: 6, slots: [] };

  it("la clave es por designId", () => {
    expect(studioCanvasSnapshotKey("design-123")).toBe("lucams_studio_canvas_design-123");
  });

  it("write → read devuelve rev y canvasData; clear lo borra", () => {
    writeStudioCanvasSnapshot("design-1", canvas, 1000);
    const snap = readStudioCanvasSnapshot("design-1");
    expect(snap?.rev).toBe(1000);
    expect(snap?.canvasData).toEqual(canvas);
    clearStudioCanvasSnapshot("design-1");
    expect(readStudioCanvasSnapshot("design-1")).toBeNull();
  });

  it("reescritura pisa el snapshot anterior del mismo designId", () => {
    writeStudioCanvasSnapshot("design-1", canvas, 1000);
    writeStudioCanvasSnapshot("design-1", { ...canvas, slotCount: 12 }, 2000);
    expect(readStudioCanvasSnapshot("design-1")?.rev).toBe(2000);
  });

  it("rev inválida o designId vacío no escriben nada", () => {
    writeStudioCanvasSnapshot("design-1", canvas, 0);
    writeStudioCanvasSnapshot("design-1", canvas, Number.NaN);
    writeStudioCanvasSnapshot("", canvas, 1000);
    expect(readStudioCanvasSnapshot("design-1")).toBeNull();
  });

  it("entrada corrupta en localStorage → null (no revienta el boot)", () => {
    window.localStorage.setItem(studioCanvasSnapshotKey("design-1"), "{no-json");
    expect(readStudioCanvasSnapshot("design-1")).toBeNull();
    window.localStorage.setItem(
      studioCanvasSnapshotKey("design-2"),
      JSON.stringify({ rev: "mil", canvasData: null }),
    );
    expect(readStudioCanvasSnapshot("design-2")).toBeNull();
  });

  it("poda snapshots con más de 7 días al escribir (y conserva los vigentes)", () => {
    const old = { rev: 1, at: Date.now() - 8 * 24 * 60 * 60 * 1000, canvasData: canvas };
    window.localStorage.setItem(studioCanvasSnapshotKey("viejo"), JSON.stringify(old));
    writeStudioCanvasSnapshot("nuevo", canvas, 1000);
    expect(readStudioCanvasSnapshot("viejo")).toBeNull();
    expect(readStudioCanvasSnapshot("nuevo")).not.toBeNull();
  });

  it("localStorage que revienta (incógnito) degrada en silencio", () => {
    const original = window.localStorage;
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    } as unknown as Storage;
    Object.defineProperty(window, "localStorage", { value: throwing, configurable: true });
    expect(readStudioCanvasSnapshot("design-1")).toBeNull();
    expect(() => writeStudioCanvasSnapshot("design-1", canvas, 1000)).not.toThrow();
    expect(() => clearStudioCanvasSnapshot("design-1")).not.toThrow();
    Object.defineProperty(window, "localStorage", { value: original, configurable: true });
  });
});

describe("shouldUseCanvasSnapshot (ADR-133)", () => {
  it("snapshot más nuevo que el server → gana el local", () => {
    expect(shouldUseCanvasSnapshot({ snapshotRev: 2000, serverClientRev: 1000 })).toBe(true);
  });

  it("server sin clientRev (canvas de antes de la ola) → cualquier snapshot gana", () => {
    expect(shouldUseCanvasSnapshot({ snapshotRev: 1000, serverClientRev: null })).toBe(true);
  });

  it("empate o server más nuevo → gana el server", () => {
    expect(shouldUseCanvasSnapshot({ snapshotRev: 1000, serverClientRev: 1000 })).toBe(false);
    expect(shouldUseCanvasSnapshot({ snapshotRev: 1000, serverClientRev: 2000 })).toBe(false);
  });

  it("sin snapshot → server", () => {
    expect(shouldUseCanvasSnapshot({ snapshotRev: null, serverClientRev: null })).toBe(false);
  });
});
