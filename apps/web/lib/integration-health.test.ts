/*
 * lib/integration-health.ts — sondas reales del panel de integraciones (CF-03).
 *
 * Lo que estos tests GARANTIZAN (encargo auditoría 360, N-03):
 *  ① Un servicio deshabilitado/no configurado NO genera falsa alarma
 *    (NOT_CONFIGURED/DISABLED_* → "not-configured", nunca warn/fail).
 *  ② Sandbox NUNCA aparece como production (envLabel + detalle explícitos).
 *  ③ Una integración no probada (UNKNOWN_NOT_PROBED) NO aparece caída.
 *  ④ Wompi, Aveonline y Gemini consumen sus probes REALES (mockeadas acá): la
 *    sonda se invoca, su resultado se mapea, y si explota o cuelga el panel
 *    muestra fail sin romperse. La de Gemini (N-19c) es acotada: lista modelos
 *    para validar la key SIN generar contenido (la semántica fina — GET de
 *    modelos, header x-goog-api-key, skipped sin key — vive en features/ai/ai.test.ts).
 *  ⑤ El mapeo es coherente con la semántica del agregador /api/health/all:
 *    ok↔ok, warn↔warn, skipped↔no configurado, sonda muerta↔fail.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AveonlineHealth } from "@/features/shipping/aveonline";
import type { WompiHealth } from "@/lib/wompi";
import type { GeminiHealth } from "@/features/ai/gemini-provider";

// Probes reales, mockeados: el panel debe consumir ESTAS funciones (④).
const { probeWompiHealth, probeAveonlineHealth, probeGeminiHealth } = vi.hoisted(() => ({
  probeWompiHealth: vi.fn(),
  probeAveonlineHealth: vi.fn(),
  probeGeminiHealth: vi.fn(),
}));
vi.mock("@/lib/wompi", () => ({ probeWompiHealth }));
vi.mock("@/features/shipping/aveonline", () => ({ probeAveonlineHealth }));
vi.mock("@/features/ai/gemini-provider", () => ({ probeGeminiHealth }));

import {
  mapAuditState,
  mapAveonlineHealth,
  mapGeminiHealth,
  mapWompiHealth,
  probeAveonlineSafely,
  probeGeminiSafely,
  probeWompiSafely,
  type PanelStatus,
  type SafeProbe,
} from "./integration-health";

function ok<T>(value: T): SafeProbe<T> {
  return { probeFailed: false, value };
}

function wompi(partial: Partial<WompiHealth> & { status: WompiHealth["status"] }): WompiHealth {
  return { env: "sandbox", latencyMs: 10, ...partial };
}

function aveonline(partial: Partial<AveonlineHealth>): AveonlineHealth {
  return {
    mode: "test",
    authenticated: true,
    idempresa: 15289,
    isDemoAccount: true,
    ok: true,
    ...partial,
  };
}

function gemini(partial: Partial<GeminiHealth> & { status: GeminiHealth["status"] }): GeminiHealth {
  return { latencyMs: 10, ...partial };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("① servicio deshabilitado/no configurado: NUNCA falsa alarma", () => {
  it("Wompi sin las 4 llaves (sonda ni se llama) → not-configured", () => {
    const r = mapWompiHealth(null, { productionDeployment: true });
    expect(r.status).toBe("not-configured");
    expect(r.status).not.toBe("fail");
    expect(r.status).not.toBe("warn");
  });

  it("Wompi con sonda skipped (modo catálogo) → not-configured", () => {
    const r = mapWompiHealth(ok(wompi({ status: "skipped", detail: "WOMPI_* no configuradas" })), {
      productionDeployment: true,
    });
    expect(r.status).toBe("not-configured");
  });

  it("Aveonline sin credenciales (sonda ni se llama) → not-configured", () => {
    expect(mapAveonlineHealth(null, { productionDeployment: true }).status).toBe("not-configured");
  });

  it.each([
    "Modo production sin credenciales: falta AVEONLINE_USUARIO, AVEONLINE_CLAVE.",
    "AVEONLINE_USUARIO + AVEONLINE_CLAVE no configurados (modo test). Ver ADR-039 + .env.example.",
  ])("Aveonline reporta credenciales faltantes → not-configured (%s)", (detail) => {
    const r = mapAveonlineHealth(
      ok(aveonline({ ok: false, authenticated: false, idempresa: null, detail })),
      { productionDeployment: true },
    );
    expect(r.status).toBe("not-configured");
  });

  it("DISABLED_BY_MODE / DISABLED_BY_ENVIRONMENT / NOT_CONFIGURED → not-configured", () => {
    expect(mapAuditState("DISABLED_BY_MODE")).toBe("not-configured");
    expect(mapAuditState("DISABLED_BY_ENVIRONMENT")).toBe("not-configured");
    expect(mapAuditState("NOT_CONFIGURED")).toBe("not-configured");
  });

  it("Gemini sin GEMINI_API_KEY (sonda ni se llama, o skipped) → not-configured", () => {
    expect(mapGeminiHealth(null).status).toBe("not-configured");
    expect(
      mapGeminiHealth(ok(gemini({ status: "skipped", detail: "GEMINI_API_KEY no configurada." })))
        .status,
    ).toBe("not-configured");
    expect(mapGeminiHealth(null).status).not.toBe("fail");
  });
});

describe("② sandbox NUNCA se muestra como production", () => {
  it("Wompi ok en sandbox → ok declarado como sandbox", () => {
    const r = mapWompiHealth(ok(wompi({ status: "ok", env: "sandbox" })), {
      productionDeployment: false,
    });
    expect(r.status).toBe("ok");
    expect(r.envLabel).toBe("sandbox");
    expect(r.detail).toContain("sandbox");
    expect(r.detail).not.toContain("production");
  });

  it("Wompi ok en production → ok declarado como production", () => {
    const r = mapWompiHealth(ok(wompi({ status: "ok", env: "production" })), {
      productionDeployment: true,
    });
    expect(r.status).toBe("ok");
    expect(r.envLabel).toBe("production");
    expect(r.detail).toContain("production");
  });

  it("Wompi sandbox en un deployment de producción → warn (no procesa pagos reales)", () => {
    const r = mapWompiHealth(ok(wompi({ status: "ok", env: "sandbox" })), {
      productionDeployment: true,
    });
    expect(r.status).toBe("warn");
    expect(r.envLabel).toBe("sandbox");
    expect(r.detail).toContain("sandbox");
  });

  it("Aveonline modo test → ok declarado como test, jamás production", () => {
    const r = mapAveonlineHealth(ok(aveonline({ mode: "test" })), {
      productionDeployment: false,
    });
    expect(r.status).toBe("ok");
    expect(r.envLabel).toBe("test");
    expect(r.envLabel).not.toBe("production");
    expect(r.detail).toContain("test");
  });

  it("Aveonline modo test en un deployment de producción → warn", () => {
    const r = mapAveonlineHealth(ok(aveonline({ mode: "test" })), {
      productionDeployment: true,
    });
    expect(r.status).toBe("warn");
    expect(r.envLabel).toBe("test");
  });

  it("Aveonline production con cuenta real → ok declarado como production", () => {
    const r = mapAveonlineHealth(
      ok(aveonline({ mode: "production", idempresa: 98765, isDemoAccount: false })),
      { productionDeployment: true },
    );
    expect(r.status).toBe("ok");
    expect(r.envLabel).toBe("production");
  });
});

describe("③ integración no probada: NO aparece caída", () => {
  it("UNKNOWN_NOT_PROBED → unverified (ni fail ni ok ni not-configured)", () => {
    const s = mapAuditState("UNKNOWN_NOT_PROBED");
    expect(s).toBe("unverified");
    expect(s).not.toBe("fail");
    expect(s).not.toBe("ok");
  });
});

describe("④ el panel consume los probes REALES de Wompi y Aveonline", () => {
  it("probeWompiSafely invoca probeWompiHealth y devuelve su resultado", async () => {
    const health = wompi({ status: "ok", env: "production", latencyMs: 42 });
    probeWompiHealth.mockResolvedValue(health);

    const r = await probeWompiSafely();
    expect(probeWompiHealth).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ probeFailed: false, value: health });
  });

  it("probeAveonlineSafely invoca probeAveonlineHealth y devuelve su resultado", async () => {
    const health = aveonline({ mode: "production", idempresa: 98765, isDemoAccount: false });
    probeAveonlineHealth.mockResolvedValue(health);

    const r = await probeAveonlineSafely();
    expect(probeAveonlineHealth).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ probeFailed: false, value: health });
  });

  it("si la sonda de Wompi explota, el card muestra fail (la página no se rompe)", async () => {
    probeWompiHealth.mockRejectedValue(new Error("boom inesperado"));

    const r = await probeWompiSafely();
    expect(r.probeFailed).toBe(true);
    const mapped = mapWompiHealth(r, { productionDeployment: false });
    expect(mapped.status).toBe("fail");
  });

  it("si la sonda de Aveonline se cuelga, el timeout defensivo la corta → fail", async () => {
    probeAveonlineHealth.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(aveonline({})), 200)),
    );

    const r = await probeAveonlineSafely(20);
    expect(r.probeFailed).toBe(true);
    if (r.probeFailed) expect(r.error).toContain("sonda superó");
    expect(mapAveonlineHealth(r, { productionDeployment: false }).status).toBe("fail");
  });

  it("probeGeminiSafely invoca probeGeminiHealth y devuelve su resultado", async () => {
    const health = gemini({ status: "ok", detail: "Key válida · 42 modelos disponibles" });
    probeGeminiHealth.mockResolvedValue(health);

    const r = await probeGeminiSafely();
    expect(probeGeminiHealth).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ probeFailed: false, value: health });
  });

  it("si la sonda de Gemini explota, el card muestra fail (la página no se rompe)", async () => {
    probeGeminiHealth.mockRejectedValue(new Error("boom inesperado"));

    const r = await probeGeminiSafely();
    expect(r.probeFailed).toBe(true);
    expect(mapGeminiHealth(r).status).toBe("fail");
  });
});

describe("N-19c — Gemini: probe REAL acotado (lista modelos, sin generación)", () => {
  it("key válida → ok con el detalle del probe (conteo de modelos + latencia)", () => {
    const r = mapGeminiHealth(
      ok(gemini({ status: "ok", detail: "Key válida · 42 modelos disponibles", latencyMs: 123 })),
    );
    expect(r.status).toBe("ok");
    expect(r.detail).toContain("42 modelos");
    expect(r.latencyMs).toBe(123);
  });

  it("HTTP del tercero (key inválida/API caída) → fail con el detalle accionable", () => {
    const r = mapGeminiHealth(
      ok(
        gemini({
          status: "fail",
          detail: "Gemini devolvió HTTP 403 (¿GEMINI_API_KEY inválida/revocada o API caída?).",
          latencyMs: 80,
        }),
      ),
    );
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("403");
    expect(r.latencyMs).toBe(80);
  });
});

describe("⑤ mapeo coherente con la semántica del agregador /api/health/all", () => {
  const wompiCases: Array<[string, SafeProbe<WompiHealth>, string, PanelStatus]> = [
    // [caso, probe Wompi, status agregador, status panel esperado]
    ["ok", ok(wompi({ status: "ok", env: "production" })), "ok", "ok"],
    ["skipped (sin configurar)", ok(wompi({ status: "skipped" })), "skipped", "not-configured"],
    [
      "fail (HTTP del tercero → 503)",
      ok(wompi({ status: "fail", detail: "Wompi devolvió HTTP 502." })),
      "fail",
      "fail",
    ],
    ["sonda muerta (route 500)", { probeFailed: true, error: "timeout" }, "fail", "fail"],
  ];
  it.each(wompiCases)("Wompi %s → agregador %s → panel %s", (_case, probe, _agg, expected) => {
    expect(mapWompiHealth(probe, { productionDeployment: true }).status).toBe(expected);
  });

  it.each([
    ["ok (test+demo)", aveonline({}), "ok"],
    [
      "ok (production+real)",
      aveonline({ mode: "production", idempresa: 98765, isDemoAccount: false }),
      "ok",
    ],
  ])("Aveonline %s → panel ok (como el agregador)", (_case, health, _agg) => {
    expect(mapAveonlineHealth(ok(health), { productionDeployment: false }).status).toBe("ok");
  });

  it("Aveonline production+cuenta demo → warn con el detalle explícito (como el agregador)", () => {
    const detail =
      "AVEONLINE_ENV=production pero las credenciales son las de la cuenta DEMO pública: " +
      "la tienda cree que genera guías reales y no es así.";
    const r = mapAveonlineHealth(
      ok(aveonline({ mode: "production", ok: false, isDemoAccount: true, detail })),
      { productionDeployment: true },
    );
    expect(r.status).toBe("warn");
    expect(r.detail).toBe(detail);
    expect(r.envLabel).toBe("production");
  });

  it("Aveonline credenciales inválidas → warn, NUNCA un falso ok", () => {
    const r = mapAveonlineHealth(
      ok(
        aveonline({
          mode: "production",
          ok: false,
          authenticated: false,
          idempresa: null,
          detail: "Aveonline auth: credenciales inválidas (revisar AVEONLINE_USUARIO/CLAVE)",
        }),
      ),
      { productionDeployment: true },
    );
    expect(r.status).toBe("warn");
    expect(r.status).not.toBe("ok");
  });

  it("HEALTHY/DEGRADED/DOWN mapean al contrato visual directo", () => {
    expect(mapAuditState("HEALTHY")).toBe("ok");
    expect(mapAuditState("PRODUCTION")).toBe("ok");
    expect(mapAuditState("SANDBOX")).toBe("ok");
    expect(mapAuditState("DEGRADED")).toBe("warn");
    expect(mapAuditState("DOWN")).toBe("fail");
  });
});
