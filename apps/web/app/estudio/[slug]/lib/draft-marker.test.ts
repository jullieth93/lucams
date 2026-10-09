// @vitest-environment jsdom
/*
 * Fase 2 · item 2.4 — marcador del DRAFT activo por producto (localStorage) y
 * la decisión de ofrecer "Continuar donde quedaste".
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  studioDraftStorageKey,
  readStudioDraftId,
  writeStudioDraftId,
  clearStudioDraftId,
  shouldOfferDraftResume,
} from "./draft-marker";

beforeEach(() => window.localStorage.clear());

describe("draft marker (localStorage por producto)", () => {
  it("la clave es por slug de producto", () => {
    expect(studioDraftStorageKey("fotoimanes-cuadrados")).toBe(
      "lucams_studio_draft_fotoimanes-cuadrados",
    );
  });

  it("write → read devuelve el designId; clear lo borra", () => {
    writeStudioDraftId("polaroid", "design-123");
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

  it("sin marcador o con valor vacío → null", () => {
    expect(readStudioDraftId("nada")).toBeNull();
    window.localStorage.setItem(studioDraftStorageKey("vacio"), "");
    expect(readStudioDraftId("vacio")).toBeNull();
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
});
