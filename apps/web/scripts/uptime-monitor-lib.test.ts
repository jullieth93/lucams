/*
 * Unit — helpers del uptime monitor por VM (decisión Lucy 2026-09-13: sin SaaS
 * ni minutos de Actions). Lógica pura: veredicto de probe, dedup anti-spam,
 * composición del correo de alerta y resumen de corrida.
 */

import { describe, expect, it } from "vitest";
import {
  ALERT_COOLDOWN_MS,
  MONITORED_ENDPOINTS,
  buildAlertEmail,
  isProbeOk,
  shouldAlert,
  summarizeResults,
} from "./uptime-monitor-lib.mjs";

describe("MONITORED_ENDPOINTS", () => {
  it("cubre los 5 healthchecks clave de PRD (all, crons y los 3 probes reales)", () => {
    const paths = MONITORED_ENDPOINTS.map((e) => e.path);
    expect(paths).toEqual([
      "/api/health/all",
      "/api/health/crons",
      "/api/health/resend",
      "/api/health/wompi",
      "/api/health/aveonline",
    ]);
  });
});

describe("isProbeOk", () => {
  it("2xx es ok; el resto no (incluye 302 de Deployment Protection y 503)", () => {
    expect(isProbeOk(200)).toBe(true);
    expect(isProbeOk(204)).toBe(true);
    expect(isProbeOk(302)).toBe(false);
    expect(isProbeOk(404)).toBe(false);
    expect(isProbeOk(503)).toBe(false);
  });
});

describe("shouldAlert (dedup anti-spam)", () => {
  const now = new Date("2026-09-13T12:00:00Z");

  it("sin alerta previa → alerta", () => {
    expect(shouldAlert(now, null)).toBe(true);
  });

  it("dentro del cooldown → NO re-envía", () => {
    const hace10min = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    expect(shouldAlert(now, hace10min)).toBe(false);
  });

  it("pasado el cooldown → re-envía (la falla sigue viva y hay que saberlo)", () => {
    const hace31min = new Date(now.getTime() - (ALERT_COOLDOWN_MS + 60_000)).toISOString();
    expect(shouldAlert(now, hace31min)).toBe(true);
  });

  it("en el borde exacto del cooldown → re-envía", () => {
    const borde = new Date(now.getTime() - ALERT_COOLDOWN_MS).toISOString();
    expect(shouldAlert(now, borde)).toBe(true);
  });
});

describe("buildAlertEmail", () => {
  it("lista solo las fallas, con guía de diagnóstico y nota anti-spam", () => {
    const { subject, text } = buildAlertEmail({
      baseUrl: "https://lucamsshop.com",
      failures: [
        { path: "/api/health/crons", detail: "HTTP 503" },
        { path: "/api/health/wompi", detail: "timeout" },
      ],
      at: new Date("2026-09-13T12:00:00Z"),
    });
    expect(subject).toContain("2 healthcheck(s)");
    expect(text).toContain("/api/health/crons");
    expect(text).toContain("/api/health/wompi");
    expect(text).toContain("HTTP 503");
    expect(text).toContain("timeout");
    expect(text).toContain("30 min");
    expect(text).not.toContain("/api/health/resend —");
  });
});

describe("summarizeResults", () => {
  it("marca ✓/✗ por endpoint con intentos y latencia", () => {
    const out = summarizeResults([
      { path: "/a", ok: true, attempts: 1, latencyMs: 120, detail: "HTTP 200" },
      { path: "/b", ok: false, attempts: 2, latencyMs: 20_001, detail: "timeout" },
    ]);
    expect(out).toContain("✓ /a (1 intento, 120 ms");
    expect(out).toContain("✗ /b (2 intentos, 20001 ms");
  });
});
