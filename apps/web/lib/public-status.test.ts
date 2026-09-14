/*
 * lib/public-status.ts — veredictos de la página PÚBLICA /status (N-16).
 *
 * Reglas que estos tests fijan:
 *  - rate_limited (429) y skipped NO son caídas: mostrarlos como "Caído" sería
 *    una falsa alarma pública.
 *  - warn (Aveonline responde pero mal configurado) NO se disfraza de ok ni
 *    se infla a down: tiene estado propio.
 *  - El detalle nunca arrastra los `detail` internos del endpoint.
 */

import { describe, expect, it } from "vitest";
import { aveonlinePublicVerdict, wompiPublicVerdict } from "./public-status";

describe("wompiPublicVerdict", () => {
  it("200 + ok → ok con latencia", () => {
    const v = wompiPublicVerdict(200, { status: "ok", latencyMs: 120 });
    expect(v.status).toBe("ok");
    expect(v.latencyMs).toBe(120);
  });

  it("200 + skipped (pagos no habilitados) → pending, NUNCA down", () => {
    const v = wompiPublicVerdict(200, {
      status: "skipped",
      detail: "WOMPI_* no configuradas (modo catálogo).",
    });
    expect(v.status).toBe("pending");
    expect(v.status).not.toBe("down");
    // El detalle interno del endpoint no se expone.
    expect(v.detail).not.toContain("WOMPI_");
  });

  it("503 (probe fail) → down", () => {
    expect(wompiPublicVerdict(503, { status: "fail" }).status).toBe("down");
  });

  it("429 rate_limited → pending, NUNCA down (falsa alarma pública)", () => {
    expect(wompiPublicVerdict(429, { status: "rate_limited" }).status).toBe("pending");
  });

  it("200 con body inesperado → down", () => {
    expect(wompiPublicVerdict(200, null).status).toBe("down");
  });
});

describe("aveonlinePublicVerdict", () => {
  it("200 + ok → ok", () => {
    expect(aveonlinePublicVerdict(200, { status: "ok", latencyMs: 300 }).status).toBe("ok");
  });

  it("200 + warn → warn (ni ok ni down), sin detalle interno", () => {
    // El endpoint incluye un detalle interno (menciona la cuenta/env): la
    // página pública muestra un texto genérico, nunca ese detalle.
    const v = aveonlinePublicVerdict(200, { status: "warn" });
    expect(v.status).toBe("warn");
    expect(v.detail).toBe("En revisión técnica");
  });

  it("500 (sonda muerta) → down", () => {
    expect(aveonlinePublicVerdict(500, null).status).toBe("down");
  });

  it("429 rate_limited → pending, NUNCA down", () => {
    expect(aveonlinePublicVerdict(429, { status: "rate_limited" }).status).toBe("pending");
  });
});
