import { describe, it, expect, vi } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker";

function fakeClock() {
  let t = 1000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("CircuitBreaker", () => {
  it("abre tras `threshold` fallos consecutivos y falla-rápido", async () => {
    const cb = new CircuitBreaker({ name: "test", threshold: 3, resetMs: 30_000 });
    const boom = () => Promise.reject(new Error("down"));
    for (let i = 0; i < 3; i++) await expect(cb.exec(boom)).rejects.toThrow("down");
    expect(cb.getState()).toBe("open");
    // Con el circuito abierto, ni siquiera llama a fn — CircuitOpenError inmediato.
    const fn = vi.fn();
    await expect(cb.exec(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("pasa a half-open tras resetMs y cierra si la prueba pasa", async () => {
    const clock = fakeClock();
    const cb = new CircuitBreaker({ name: "test", threshold: 2, resetMs: 30_000, now: clock.now });
    const boom = () => Promise.reject(new Error("down"));
    await expect(cb.exec(boom)).rejects.toThrow();
    await expect(cb.exec(boom)).rejects.toThrow();
    expect(cb.getState()).toBe("open");

    clock.advance(31_000); // pasó el resetMs
    // La siguiente llamada entra en half-open; si tiene éxito → cerrado.
    expect(await cb.exec(() => Promise.resolve("ok"))).toBe("ok");
    expect(cb.getState()).toBe("closed");
  });

  it("en half-open solo deja pasar UNA prueba; las concurrentes fallan-rápido", async () => {
    const clock = fakeClock();
    const cb = new CircuitBreaker({ name: "t", threshold: 1, resetMs: 10_000, now: clock.now });
    await expect(cb.exec(() => Promise.reject(new Error("down")))).rejects.toThrow();
    expect(cb.getState()).toBe("open");

    clock.advance(11_000); // pasó resetMs → la próxima entra en half-open

    // La prueba queda en vuelo (promesa que controlamos); un request concurrente
    // que llega mientras la prueba corre debe recibir CircuitOpenError, no pasar.
    let releaseProbe!: (v: string) => void;
    const probe = cb.exec(() => new Promise<string>((res) => (releaseProbe = res)));
    const concurrent = cb.exec(() => Promise.resolve("no-debería-correr"));
    await expect(concurrent).rejects.toBeInstanceOf(CircuitOpenError);

    releaseProbe("ok");
    expect(await probe).toBe("ok");
    expect(cb.getState()).toBe("closed");
  });

  it("una llamada exitosa limpia el contador de fallos", async () => {
    const cb = new CircuitBreaker({ name: "test", threshold: 3, resetMs: 30_000 });
    const boom = () => Promise.reject(new Error("x"));
    await expect(cb.exec(boom)).rejects.toThrow();
    await expect(cb.exec(boom)).rejects.toThrow();
    await cb.exec(() => Promise.resolve("ok")); // resetea failures a 0
    await expect(cb.exec(boom)).rejects.toThrow();
    await expect(cb.exec(boom)).rejects.toThrow();
    // 2 fallos < threshold 3 → sigue cerrado.
    expect(cb.getState()).toBe("closed");
  });
});
