// @vitest-environment jsdom
/*
 * Component test — WebVitalsReporter consent gate (F-19, audit 2026-09-04).
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
 *  - next/web-vitals is mocked to CAPTURE the metric callback the component
 *    registers; the test then fires metrics by invoking it directly.
 *  - next/navigation is mocked (no App Router context in jsdom) with a
 *    dynamic-route pathname to also assert route normalization.
 *  - @/lib/cookie-consent is NOT mocked: it is pure client logic over
 *    document.cookie, so the test exercises the real consent contract.
 *  - jsdom's navigator has no sendBeacon → the component falls back to
 *    fetch (stubbed via vi.stubGlobal). One test stubs sendBeacon to cover
 *    the primary path.
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
};

// Holder for the callback the component passes to useReportWebVitals.
const vitals = vi.hoisted(() => ({
  callback: null as null | ((metric: ReportedMetric) => void),
}));

vi.mock("next/web-vitals", () => ({
  useReportWebVitals: (cb: (metric: ReportedMetric) => void) => {
    vitals.callback = cb;
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/producto/imantado-corazon-123",
  useSelectedLayoutSegments: () => [],
}));

import { WebVitalsReporter } from "./web-vitals";
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
  if (!vitals.callback) throw new Error("useReportWebVitals callback was not registered");
  vitals.callback(METRIC);
}

beforeEach(() => {
  clearConsentCookie();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  clearConsentCookie();
  vi.unstubAllGlobals();
  // Restore navigator if a test stubbed sendBeacon via defineProperty.
  delete (window.navigator as { sendBeacon?: unknown }).sendBeacon;
});

describe("WebVitalsReporter — consent gate (F-19)", () => {
  it("does NOT send the beacon when the visitor has not answered the banner yet", () => {
    render(<WebVitalsReporter />);
    fireMetric();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT send the beacon when analytics was rejected ('Solo necesarias')", () => {
    writeClientCookiePreferences(rejectAllPreferences());
    render(<WebVitalsReporter />);
    fireMetric();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the beacon with the normalized route once analytics is accepted", () => {
    writeClientCookiePreferences(acceptAllPreferences());
    render(<WebVitalsReporter />);
    fireMetric();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/vitals");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body).toMatchObject({ name: "LCP", route: "/producto/[slug]" });
  });

  it("starts sending mid-session when the visitor accepts after the component mounted", () => {
    render(<WebVitalsReporter />);
    fireMetric();
    expect(fetchMock).not.toHaveBeenCalled();
    // Same render, no remount: the lazy cookie read picks up the new choice.
    writeClientCookiePreferences(acceptAllPreferences());
    fireMetric();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops sending mid-session when the visitor revokes analytics", () => {
    writeClientCookiePreferences(acceptAllPreferences());
    render(<WebVitalsReporter />);
    fireMetric();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    writeClientCookiePreferences(rejectAllPreferences());
    fireMetric();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses navigator.sendBeacon when available (primary path)", () => {
    writeClientCookiePreferences(acceptAllPreferences());
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });
    render(<WebVitalsReporter />);
    fireMetric();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe("/api/vitals");
    expect(blob.type).toBe("application/json");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
