import { describe, expect, it } from "vitest";
import { formatCOP } from "./format";

describe("formatCOP", () => {
  it("formats 0 centavos as $ 0", () => {
    expect(formatCOP(0)).toMatch(/\$\s*0/);
  });

  it("formats 100000 centavos as $ 1.000 (pesos sin centavos)", () => {
    expect(formatCOP(100_000)).toMatch(/\$\s*1\.000/);
  });

  it("formats 4500000 centavos with thousands separator", () => {
    expect(formatCOP(4_500_000)).toMatch(/\$\s*45\.000/);
  });

  it("handles negative values gracefully", () => {
    const out = formatCOP(-100_000);
    expect(out).toContain("1.000");
    expect(out).toMatch(/-/);
  });

  it("rounds non-integer centavos to nearest peso", () => {
    // Centavos siempre deberían ser enteros (Prisma Int), pero defensive.
    expect(formatCOP(100_050)).toMatch(/\$\s*1\.001/);
  });
});
