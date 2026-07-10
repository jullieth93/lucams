import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithTimeout } from "./fetch-with-timeout";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("fetchWithTimeout", () => {
  it("devuelve la respuesta si el fetch responde a tiempo", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const res = await fetchWithTimeout("https://x.test", { timeoutMs: 1000 });
    expect(res.status).toBe(200);
  });

  it("aborta con TimeoutError si el fetch se cuelga más que timeoutMs", async () => {
    // fetch que nunca resuelve pero respeta la señal de abort.
    globalThis.fetch = vi.fn(
      (_url, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject((init.signal as AbortSignal).reason ?? new Error("aborted")),
          );
        }),
    ) as unknown as typeof fetch;

    await expect(fetchWithTimeout("https://slow.test", { timeoutMs: 20 })).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("propaga método/headers del init al fetch", async () => {
    const spy = vi.fn().mockResolvedValue(new Response("{}"));
    globalThis.fetch = spy as unknown as typeof fetch;
    await fetchWithTimeout("https://x.test", { method: "POST", headers: { A: "1" }, timeoutMs: 500 });
    const [, init] = spy.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ A: "1" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
