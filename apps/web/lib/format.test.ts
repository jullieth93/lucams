import { describe, expect, it } from "vitest";
import { formatCOP, formatCOPExact, formatRelativeTime } from "./format";

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

describe("formatRelativeTime", () => {
  const now = new Date("2026-10-29T12:00:00Z");

  it("less than a minute ago → ahora", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 30_000), now)).toBe("ahora");
  });

  it("minutes ago", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 5 * 60_000), now)).toBe("hace 5 minutos");
  });

  it("hours ago", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 3 * 3_600_000), now)).toBe("hace 3 horas");
  });

  it("1 day ago → ayer (numeric: auto)", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 24 * 3_600_000), now)).toBe("ayer");
  });

  it("weeks ago beyond 7 days", () => {
    expect(formatRelativeTime(new Date(now.getTime() - 14 * 86_400_000), now)).toBe(
      "hace 2 semanas",
    );
  });

  it("slight future clock skew → ahora", () => {
    expect(formatRelativeTime(new Date(now.getTime() + 20_000), now)).toBe("ahora");
  });
});

describe("formatCOPExact (2026-10-29 — conciliación: los centavos importan)", () => {
  it("sin centavos se ve igual que formatCOP (26.410.000 centavos → «$ 264.100»)", () => {
    expect(formatCOPExact(26_410_000)).toMatch(/\$\s*264\.100/);
    expect(formatCOPExact(26_410_000)).not.toContain(",00");
  });

  it("con centavos los discrimina (26.410.050 centavos → «$ 264.100,50»)", () => {
    expect(formatCOPExact(26_410_050)).toMatch(/264\.100,5/);
  });
});
