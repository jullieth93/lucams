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

  it("multi-set (ADR-157): el borde se resuelve por set sobre metadata.units[*].withBorder", () => {
    // Todos con borde / todos sin borde → la nota de siempre (la clave raíz,
    // representante del set 0, no manda sobre el resto).
    const allWith = {
      ...LETTERSET_META,
      withBorder: false, // raíz dice "sin" pero los sets dicen "con": ganan los sets
      units: [{ withBorder: true }, { withBorder: true }],
    };
    expect(letterSetBorderNote(allWith)).toBe("Con borde");
    const allWithout = {
      ...LETTERSET_META,
      withBorder: true,
      units: [{ withBorder: false }, { withBorder: false }],
    };
    expect(letterSetBorderNote(allWithout)).toBe("Sin borde");
  });

  it("multi-set con bordes mixtos → texto generalista (el detalle lo da el pager del «Ver»)", () => {
    const mixed = {
      ...LETTERSET_META,
      withBorder: true,
      units: [{ withBorder: true }, { withBorder: false }, { withBorder: true }],
    };
    expect(letterSetBorderNote(mixed)).toBe("Borde: varía por set");
    // Un set sin la clave = con borde (default retrocompatible por unidad).
    const mixedDefault = { ...LETTERSET_META, units: [{ withBorder: false }, {}] };
    expect(letterSetBorderNote(mixedDefault)).toBe("Borde: varía por set");
  });

  it("array units de 1 solo set → comportamiento de la clave raíz (1 unidad no cambia)", () => {
    expect(
      letterSetBorderNote({ ...LETTERSET_META, withBorder: false, units: [{ withBorder: true }] }),
    ).toBe("Sin borde");
  });
});
