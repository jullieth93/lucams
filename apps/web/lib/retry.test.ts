import { describe, it, expect, vi } from "vitest";
import { withRetry, isRetryable } from "./retry";

const noSleep = async () => {}; // sin delays reales en tests

describe("isRetryable", () => {
  it("timeouts y aborts → reintentable", () => {
    const t = new Error("x");
    t.name = "TimeoutError";
    expect(isRetryable(t)).toBe(true);
    const a = new Error("x");
    a.name = "AbortError";
    expect(isRetryable(a)).toBe(true);
  });
  it("error de red (TypeError) → reintentable", () => {
    expect(isRetryable(new TypeError("fetch failed"))).toBe(true);
  });
  it("5xx / 408 / 429 → reintentable; otros 4xx → no", () => {
    const withStatus = (s: number) => Object.assign(new Error("http"), { status: s });
    expect(isRetryable(withStatus(500))).toBe(true);
    expect(isRetryable(withStatus(503))).toBe(true);
    expect(isRetryable(withStatus(408))).toBe(true);
    expect(isRetryable(withStatus(429))).toBe(true);
    expect(isRetryable(withStatus(400))).toBe(false);
    expect(isRetryable(withStatus(404))).toBe(false);
  });
  it("errores desconocidos → no reintentable (conservador)", () => {
    expect(isRetryable(new Error("qué será"))).toBe(false);
    expect(isRetryable("string")).toBe(false);
  });
});

describe("withRetry", () => {
  it("devuelve al primer intento si no falla", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await withRetry(fn, { sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reintenta errores reintentables hasta lograrlo", async () => {
    const err = Object.assign(new Error("boom"), { status: 503 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValue("ok");
    expect(await withRetry(fn, { attempts: 3, sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("NO reintenta errores 4xx (falla de una)", async () => {
    const err = Object.assign(new Error("bad"), { status: 400 });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("agota los intentos y lanza el último error", async () => {
    const err = Object.assign(new Error("down"), { status: 500 });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
