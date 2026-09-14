/*
 * Tests del helper de nota de borde de los sets de letras (Lucy 2026-09-05).
 *
 * Contrato: solo metadata de set de letras produce nota ("Con borde" / "Sin borde"); cualquier
 * otro metadata devuelve null. Default retrocompatible: sin la clave `withBorder` = con borde
 * (lo que siempre se imprimió antes de la opción).
 */

import { describe, expect, it } from "vitest";
import { letterSetBorderNote } from "./letter-set-border";

const LETTERSET_META = { kind: "letters", surface: "letterset", schemaVersion: 2 };

describe("letterSetBorderNote", () => {
  it("metadata null / vacío / no-letterset → null (no hay nota que mostrar)", () => {
    expect(letterSetBorderNote(null)).toBeNull();
    expect(letterSetBorderNote(undefined)).toBeNull();
    expect(letterSetBorderNote("letterset")).toBeNull();
    expect(letterSetBorderNote({ surface: "photos" })).toBeNull();
    expect(letterSetBorderNote({ letters: ["A", "B"] })).toBeNull(); // name-design sin surface
  });

  it("diseño de set de letras sin la clave (previo a la opción) = Con borde (retrocompatible)", () => {
    expect(letterSetBorderNote(LETTERSET_META)).toBe("Con borde");
    expect(letterSetBorderNote({ ...LETTERSET_META, withBorder: true })).toBe("Con borde");
  });

  it("withBorder: false = Sin borde", () => {
    expect(letterSetBorderNote({ ...LETTERSET_META, withBorder: false })).toBe("Sin borde");
  });
});
