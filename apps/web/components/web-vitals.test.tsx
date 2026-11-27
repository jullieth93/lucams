// @vitest-environment jsdom
/*
 * Component test — WebVitalsReporter consent gate (F-19, audit 2026-09-04)
 * y métricas agregadas LONGTASK/PAGEWEIGHT (Paquete C + fix 2026-10-20).
 *
 * The beacon to /api/vitals must respect the "Analíticas" category of the
 * cookie banner (lib/cookie-consent.ts, cookie `cookie_consent_v1`):
 *  - No answer yet (no cookie)     → nothing is sent (opt-in).
 *  - Rejected / analytics off      → nothing is sent.
 *  - Accepted                      → sent, with the normalized route.
 *  - Mid-session acceptance        → the next metric goes out without a
 *    re-render (consent is re-read lazily at fire time).
 *
 * Setup notes:
 *  - next/dist/compiled/web-vitals-attribution is mocked to CAPTURE the
 *    metric callback the component registers in its mount effect; the test
 *    then fires metrics by invoking it directly. (Hasta 2026-10-20 se
 *    mockeaba next/web-vitals — el reporter ya no usa useReportWebVitals
 *    porque ese build no trae atribución.)
 *  - next/navigation is mocked (no App Router context in jsdom) with a
 *    dynamic-route pathname to also assert route normalization.
 *  - @/lib/cookie-consent is NOT mocked: it is pure client logic over
 *    document.cookie, so the test exercises the real consent contract.
 *  - jsdom's navigator has no sendBeacon → the component falls back to
 *    fetch (stubbed via vi.stubGlobal). One test stubs sendBeacon to cover
 *    the primary path.
 *  - jsdom no implementa PerformanceObserver → el effect de agregados hace
 *    early-return y no hay beacons LONGTASK/PAGEWEIGHT salvo que el test
 *    stubee un PerformanceObserver falso (ver describe LONGTASK).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

type ReportedMetric = {
  name: string;
  value: number;
  rating: string;
  delta: number;
  navigationType: string;
  attribution?: Record<string, unknown>;
};

// Holder for the callback the component passes to the attribution handlers.
const vitals = vi.hoisted(() => ({
  callback: null as null | ((metric: ReportedMetric) => void),
  pathname: "/producto/imantado-corazon-123",
}));

vi.mock("next/dist/compiled/web-vitals-attribution", () => {
  const register = (cb: (metric: ReportedMetric) => void) => {
    vitals.callback = cb;
  };
  return {
    onCLS: register,
    onFCP: register,
    onINP: register,
    onLCP: register,
    onTTFB: register,
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => vitals.pathname,
  useSelectedLayoutSegments: () => [],
}));

import { WebVitalsReporter, VITALS_BATCH_MAX_ITEMS, VITALS_FLUSH_DELAY_MS } from "./web-vitals";
import {
  acceptAllPreferences,
  COOKIE_CONSENT_NAME,
  rejectAllPreferences,
  writeClientCookiePreferences,
} from "@/lib/cookie-consent";

const METRIC: ReportedMetric = {
  name: "LCP",
  value: 1234.5,
  rating: "good",
  delta: 100,
  navigationType: "navigate",
};

const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));

function clearConsentCookie() {
  document.cookie = `${COOKIE_CONSENT_NAME}=; Max-Age=0; Path=/`;
}

function fireMetric() {
  if (!vitals.callback) throw new Error("attribution callback was not registered");
  vitals.callback(METRIC);
}

/** Payloads individuales aplanados desde los lotes `{ metrics: [...] }` enviados vía fetch fallback. */
function sentPayloads(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.flatMap((c) => {
    const [, init] = c as unknown as [string, { body: string }];
    const parsed = JSON.parse(init.body) as
      { metrics?: Array<Record<string, unknown>> } | Record<string, unknown>;
    if (Array.isArray(parsed.metrics)) return parsed.metrics;
    return [parsed as Record<string, unknown>];
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  clearConsentCookie();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vitals.pathname = "/producto/imantado-corazon-123";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  clearConsentCookie();
  vi.unstubAllGlobals();
  // Restore navigator if a test stubbed sendBeacon via defineProperty.
  delete (window.navigator as { sendBeacon?: unknown }).sendBeacon;
});

describe("WebVitalsReporter — consent gate (F-19) y batching cliente (Fase 4 · #15)", () => {
  it("does NOT send the beacon when the visitor has not answered the banner yet", () => {
    render(<WebVitalsReporter />);
    fireMetric();
    vi.advanceTimersByTime(VITALS_FLUSH_DELAY_MS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT send the beacon when analytics was rejected ('Solo necesarias')", () => {
    writeClientCookiePreferences(rejectAllPreferences());
    render(<WebVitalsReporter />);
    fireMetric();
    vi.advanceTimersByTime(VITALS_FLUSH_DELAY_MS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("agrupa múltiples métricas dentro de la ventana de batching en un único POST { metrics: [...] }", () => {
    writeClientCookiePreferences(acceptAllPreferences());
    render(<WebVitalsReporter />);
    fireMetric();
    vitals.callback!({
      name: "FCP",
      value: 720,
      rating: "good",
      delta: 720,
      navigationType: "navigate",
    });
    // Antes del timer no dispara requests individuales.
    expect(fetchMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(VITALS_FLUSH_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/vitals");
    const body = JSON.parse(init.body) as { metrics: Array<Record<string, unknown>> };
    expect(body.metrics).toHaveLength(2);
    expect(body.metrics[0]).toMatchObject({ name: "LCP", route: "/producto/[slug]" });
    expect(body.metrics[1]).toMatchObject({ name: "FCP", route: "/producto/[slug]" });
  });

  it("hace flush inmediato al alcanzar VITALS_BATCH_MAX_ITEMS sin esperar el timer", () => {
    writeClientCookiePreferences(acceptAllPreferences());
    render(<WebVitalsReporter />);
    for (let i = 0; i < VITALS_BATCH_MAX_ITEMS; i++) {
      fireMetric();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentPayloads()).toHaveLength(VITALS_BATCH_MAX_ITEMS);
  });

  it("starts sending mid-session when the visitor accepts after the component mounted", () => {
    render(<WebVitalsReporter />);
    fireMetric();
    vi.advanceTimersByTime(VITALS_FLUSH_DELAY_MS);
    expect(fetchMock).not.toHaveBeenCalled();
    // Same render, no remount: the lazy cookie read picks up the new choice.
    writeClientCookiePreferences(acceptAllPreferences());
    fireMetric();
    vi.advanceTimersByTime(VITALS_FLUSH_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops sending mid-session (y descarta métricas en cola) when the visitor revokes analytics", () => {
    writeClientCookiePreferences(acceptAllPreferences());
    render(<WebVitalsReporter />);
    fireMetric();
    vi.advanceTimersByTime(VITALS_FLUSH_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Encola una métrica y revoca el consentimiento ANTES de que venza el timer.
    fireMetric();
    writeClientCookiePreferences(rejectAllPreferences());
    vi.advanceTimersByTime(VITALS_FLUSH_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses navigator.sendBeacon when available (primary path) y vacía la cola al instante en pagehide", () => {
    writeClientCookiePreferences(acceptAllPreferences());
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });
    render(<WebVitalsReporter />);
    fireMetric();
    window.dispatchEvent(new Event("pagehide"));
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe("/api/vitals");
    expect(blob.type).toBe("application/json");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hace fallback a fetch keepalive si navigator.sendBeacon devuelve false (M-2)", () => {
    writeClientCookiePreferences(acceptAllPreferences());
    const sendBeacon = vi.fn(() => false);
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });
    render(<WebVitalsReporter />);
    fireMetric();
    vi.advanceTimersByTime(VITALS_FLUSH_DELAY_MS);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("flushea métricas encoladas tras volver de otra pestaña sin perderlas en el segundo pagehide (M-2)", () => {
    writeClientCookiePreferences(acceptAllPreferences());
    render(<WebVitalsReporter />);
    fireMetric();
    window.dispatchEvent(new Event("pagehide"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Usuario regresa, dispara una nueva métrica y cierra la pestaña antes del timer de 2 s.
    fireMetric();
    window.dispatchEvent(new Event("pagehide"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("normaliza /estudio/<slug> → /estudio/[slug] (INP del Estudio agregable, 2026-09-18)", () => {
    vitals.pathname = "/estudio/set-fotoimanes-polaroid";
    writeClientCookiePreferences(acceptAllPreferences());
    render(<WebVitalsReporter />);
    fireMetric();
    vi.advanceTimersByTime(VITALS_FLUSH_DELAY_MS);
    expect(sentPayloads()[0]).toMatchObject({ route: "/estudio/[slug]" });
  });

  it("para INP adjunta el selector del elemento (attribution.interactionTarget)", () => {
    // 2026-09-18 — las alertas "Interaction Timing" de Vercel dan el elemento;
    // el RUM propio debe guardarlo para poder correlacionar página↔elemento.
    writeClientCookiePreferences(acceptAllPreferences());
    render(<WebVitalsReporter />);
    vitals.callback!({
      name: "INP",
      value: 232,
      rating: "needs-improvement",
      delta: 232,
      navigationType: "navigate",
      attribution: { interactionTarget: "main.bg-brand-cream.flex-1#contenido" },
    });
    vi.advanceTimersByTime(VITALS_FLUSH_DELAY_MS);
    expect(sentPayloads()[0]).toMatchObject({
      name: "INP",
      target: "main.bg-brand-cream.flex-1#contenido",
    });
  });

  it("NO adjunta target en métricas que no son INP", () => {
    writeClientCookiePreferences(acceptAllPreferences());
    render(<WebVitalsReporter />);
    fireMetric(); // LCP sin attribution
    vi.advanceTimersByTime(VITALS_FLUSH_DELAY_MS);
    expect(sentPayloads()[0]).not.toHaveProperty("target");
  });
});

/*
 * LONGTASK (fix 2026-10-20): jsdom no implementa PerformanceObserver, así que
 * se stubee uno falso. Verifica las dos ramas del fix:
 *  - Con soporte: las entradas se acumulan y el flush (pagehide) envía
 *    value=ms totales y delta=cantidad.
 *  - Sin soporte (Firefox/Safari: observe({type:"longtask"}) lanza): el flush
 *    NO envía fila LONGTASK (un 0/0 sintético ensucia los agregados — en STG
 *    284/284 filas LONGTASK eran 0 por esta rama), pero PAGEWEIGHT sí sale.
 */
class FakePerformanceObserver {
  static instances: FakePerformanceObserver[] = [];
  static unsupportedTypes = new Set<string>();
  private cb: (list: { getEntries: () => Array<{ duration: number }> }) => void;
  observedType?: string;

  constructor(cb: FakePerformanceObserver["cb"]) {
    this.cb = cb;
    FakePerformanceObserver.instances.push(this);
  }

  observe(opts: { type: string }) {
    if (FakePerformanceObserver.unsupportedTypes.has(opts.type)) {
      throw new TypeError(`entry type '${opts.type}' not supported`);
    }
    this.observedType = opts.type;
  }

  disconnect() {}

  emit(entries: Array<{ duration: number }>) {
    this.cb({ getEntries: () => entries });
  }

  static reset(unsupported: string[] = []) {
    FakePerformanceObserver.instances = [];
    FakePerformanceObserver.unsupportedTypes = new Set(unsupported);
  }
}

describe("WebVitalsReporter — LONGTASK por pageview (fix 2026-10-20)", () => {
  beforeEach(() => {
    writeClientCookiePreferences(acceptAllPreferences());
    vi.stubGlobal("PerformanceObserver", FakePerformanceObserver);
  });

  afterEach(() => {
    FakePerformanceObserver.reset();
  });

  it("acumula long tasks y flushéa value=ms totales / delta=cantidad en pagehide", () => {
    FakePerformanceObserver.reset();
    render(<WebVitalsReporter />);
    const longtaskObs = FakePerformanceObserver.instances.find(
      (o) => o.observedType === "longtask",
    );
    expect(longtaskObs).toBeDefined();
    longtaskObs!.emit([{ duration: 120 }, { duration: 80 }]);
    window.dispatchEvent(new Event("pagehide"));
    const longtask = sentPayloads().find((p) => p.name === "LONGTASK");
    expect(longtask).toMatchObject({
      value: 200,
      delta: 2,
      rating: "good",
      route: "/producto/[slug]",
    });
  });

  it("sin soporte de longtask (Firefox/Safari) NO envía fila LONGTASK pero sí PAGEWEIGHT", () => {
    FakePerformanceObserver.reset(["longtask"]);
    render(<WebVitalsReporter />);
    window.dispatchEvent(new Event("pagehide"));
    const names = sentPayloads().map((p) => p.name);
    expect(names).not.toContain("LONGTASK");
    expect(names).toContain("PAGEWEIGHT");
  });
});
