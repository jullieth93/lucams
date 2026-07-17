import { describe, expect, it } from "vitest";
import { secureEquals } from "./timing-safe";

describe("secureEquals", () => {
  it("true para strings iguales", () => {
    expect(secureEquals("whsec_abc123", "whsec_abc123")).toBe(true);
  });

  it("false para strings distintos de igual longitud", () => {
    expect(secureEquals("aaaaaa", "aaaaab")).toBe(false);
  });

  it("false para longitudes distintas (sin lanzar)", () => {
    expect(secureEquals("corto", "mucho-mas-largo")).toBe(false);
    expect(secureEquals("", "x")).toBe(false);
  });

  it("true para dos vacíos", () => {
    expect(secureEquals("", "")).toBe(true);
  });

  it("distingue por unicode/bytes", () => {
    expect(secureEquals("café", "cafe")).toBe(false);
  });
});
