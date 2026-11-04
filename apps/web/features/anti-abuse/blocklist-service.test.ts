import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {}, Prisma: {} }));

import {
  normalizeBlockValue,
  normalizePhoneIdentity,
  phoneIdentityVariants,
} from "./blocklist-service";

describe("normalizePhoneIdentity & normalizeBlockValue ([SEC-03])", () => {
  it("normaliza todos los formatos equivalentes de celular colombiano a +573XXXXXXXXX", () => {
    expect(normalizePhoneIdentity("+57 300 123 4567")).toBe("+573001234567");
    expect(normalizePhoneIdentity("573001234567")).toBe("+573001234567");
    expect(normalizePhoneIdentity("0057-300-123-4567")).toBe("+573001234567");
    expect(normalizePhoneIdentity("300 123 4567")).toBe("+573001234567");
    expect(normalizePhoneIdentity("(300) 123-4567")).toBe("+573001234567");
    expect(normalizeBlockValue("PHONE", " +57 300 123 4567 ")).toBe("+573001234567");
  });

  it("genera variantes equivalentes para matchear registros históricos sin prefijo +57", () => {
    const variants = phoneIdentityVariants("+57 310 555 8899");
    expect(variants).toContain("+573105558899");
    expect(variants).toContain("3105558899");
    expect(variants).toContain("573105558899");
  });

  it("conserva intactas cadenas sintéticas con letras (fixtures de tests)", () => {
    expect(normalizePhoneIdentity("codrisk123-blk")).toBe("codrisk123-blk");
  });

  it("normaliza emails en minúsculas y conserva address keys con trim", () => {
    expect(normalizeBlockValue("EMAIL", "  Cliente@Lucams.CO ")).toBe("cliente@lucams.co");
    expect(normalizeBlockValue("ADDRESS", "  11001|cl 80 10 20  ")).toBe("11001|cl 80 10 20");
  });
});
