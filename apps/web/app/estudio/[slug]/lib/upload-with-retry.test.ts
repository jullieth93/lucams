/*
 * upload-with-retry — subida a signed URLs con concurrencia limitada, retry
 * con backoff y timeout (fix STG 2026-10-05). Antes los PUTs del finalize
 * eran secuenciales, sin retry ni timeout, y el error crudo del navegador
 * llegaba a la pantalla.
 */

import { describe, it, expect, vi } from "vitest";
import {
  isNetworkError,
  isServerActionCrash,
  mapWithConcurrency,
  putWithRetry,
  retryDelayMs,
  type StoragePutRequest,
} from "./upload-with-retry";

const REQ: StoragePutRequest = {
  url: "https://storage.example.com/signed/slot-0",
  body: new Blob(["png"]),
  contentType: "image/png",
};

function okResponse(): Response {
  return { ok: true, status: 200 } as Response;
}

function errorResponse(status: number): Response {
  return { ok: false, status } as Response;
}

describe("retryDelayMs", () => {
  it("backoff exponencial: 600, 1200, 2400…", () => {
    expect(retryDelayMs(0)).toBe(600);
    expect(retryDelayMs(1)).toBe(1200);
    expect(retryDelayMs(2)).toBe(2400);
  });
});

describe("isNetworkError", () => {
  it("TypeError ('Failed to fetch' / 'NetworkError…') y AbortError son de red", () => {
    expect(isNetworkError(new TypeError("NetworkError when attempting to fetch resource"))).toBe(
      true,
    );
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new DOMException("Aborted", "AbortError"))).toBe(true);
  });

  it("errores de la app NO son de red (conservan su mensaje)", () => {
    expect(isNetworkError(new Error("preview demasiado grande"))).toBe(false);
    expect(isNetworkError("NetworkError when attempting to fetch resource")).toBe(false);
  });
});

describe("isServerActionCrash (500/504 HTML de plataforma en la Server Action)", () => {
  it("detecta el mensaje de Next ante una respuesta no-JSON de la action", () => {
    expect(
      isServerActionCrash(new Error("An unexpected response was received from the server.")),
    ).toBe(true);
  });

  it("no confunde errores de red ni de la app (cada uno conserva su copy)", () => {
    expect(isServerActionCrash(new TypeError("Failed to fetch"))).toBe(false);
    expect(isServerActionCrash(new Error("No pudimos subir el slot 3"))).toBe(false);
    expect(isServerActionCrash("An unexpected response was received from the server")).toBe(false);
    expect(isServerActionCrash(null)).toBe(false);
  });
});

describe("putWithRetry", () => {
  it("reintenta errores de red y termina subiendo", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(okResponse());

    await putWithRetry(REQ, { fetchImpl, retryBaseMs: 0 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(init.headers["content-type"]).toBe("image/png");
  });

  it("reintenta 5xx (Storage caído) pero NO 4xx (firma vencida)", async () => {
    const fetch5xx = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(okResponse());
    await putWithRetry(REQ, { fetchImpl: fetch5xx, retryBaseMs: 0 });
    expect(fetch5xx).toHaveBeenCalledTimes(2);

    const fetch4xx = vi.fn().mockResolvedValue(errorResponse(403));
    await expect(putWithRetry(REQ, { fetchImpl: fetch4xx, retryBaseMs: 0 })).rejects.toThrow(
      "HTTP 403",
    );
    expect(fetch4xx).toHaveBeenCalledTimes(1);
  });

  it("agota los intentos y lanza el último error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(putWithRetry(REQ, { fetchImpl, retries: 2, retryBaseMs: 0 })).rejects.toThrow(
      "Failed to fetch",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 intento + 2 reintentos
  });

  it("el timeout aborta el fetch colgado (pasa la señal del AbortController)", async () => {
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    await expect(putWithRetry(REQ, { fetchImpl, retries: 0, timeoutMs: 5 })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("mapWithConcurrency", () => {
  it("respeta el tope de concurrencia y completa todos los items", async () => {
    let active = 0;
    let maxActive = 0;
    const done: number[] = [];
    await mapWithConcurrency([0, 1, 2, 3, 4], 2, async (item) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      done.push(item);
    });
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(done.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("fail-fast: el primer error frena el despacho y se re-lanza", async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency([0, 1, 2, 3], 1, async (item) => {
        started.push(item);
        if (item === 0) throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(started).toEqual([0]); // con 1 carril no se despachó nada más
  });

  it("lista vacía resuelve sin trabajar", async () => {
    const worker = vi.fn();
    await mapWithConcurrency([], 3, worker);
    expect(worker).not.toHaveBeenCalled();
  });
});
