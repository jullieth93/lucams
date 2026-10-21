/*
 * Unit — asDestinationType / deriveAddressName: el nombre de la dirección
 * guardada (Address.name, obligatoria en DB pero solo display) se DERIVA del
 * tipo de destino; rural/legacy cae a «Mi dirección en {city}». Compartido por
 * /mi-cuenta/direcciones y "guardar al pagar" del checkout.
 */

import { describe, expect, it } from "vitest";
import {
  asDestinationType,
  deriveAddressName,
  DESTINATION_PLAIN_LABELS,
  DESTINATION_TYPES,
} from "./destination-types";

describe("asDestinationType", () => {
  it("acepta cada tipo válido", () => {
    for (const t of DESTINATION_TYPES) expect(asDestinationType(t)).toBe(t);
  });

  it("rechaza valores legacy/tampered", () => {
    expect(asDestinationType("mordor")).toBeNull();
    expect(asDestinationType("")).toBeNull();
    expect(asDestinationType(undefined)).toBeNull();
    expect(asDestinationType(null)).toBeNull();
    expect(asDestinationType(42)).toBeNull();
  });
});

describe("deriveAddressName", () => {
  it("urbana con destinationType → label limpio (sin emoji)", () => {
    expect(deriveAddressName({ destinationType: "casa", city: "Bogotá" })).toBe("Casa");
    expect(deriveAddressName({ destinationType: "oficina", city: "Cali" })).toBe(
      "Oficina / Empresa",
    );
    // Nunca con emoji (va a selects, admin y emails).
    for (const t of DESTINATION_TYPES) {
      expect(deriveAddressName({ destinationType: t, city: "X" })).toBe(
        DESTINATION_PLAIN_LABELS[t],
      );
      expect(DESTINATION_PLAIN_LABELS[t]).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });

  it("rural/legacy (sin destinationType) → «Mi dirección en {city}»", () => {
    expect(deriveAddressName({ city: "Abejorral" })).toBe("Mi dirección en Abejorral");
    expect(deriveAddressName({ destinationType: "mordor", city: "Cali" })).toBe(
      "Mi dirección en Cali",
    );
  });
});
