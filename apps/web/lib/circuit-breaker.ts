/*
 * Circuit breaker (CONVENTIONS §Resiliencia). Para llamadas críticas (Wompi,
 * Aveonline): tras N fallos consecutivos abre el circuito y falla-rápido durante
 * `resetMs` (evita martillar un proveedor caído y colgar el checkout). Luego pasa
 * a half-open y una llamada de prueba decide si cierra o reabre.
 *
 * Nota: el estado es PER-INSTANCIA (serverless). Para coordinación global haría
 * falta Redis/Postgres; para nuestra escala inicial es suficiente (mandato #11).
 */

export class CircuitOpenError extends Error {
  constructor(public readonly name2: string) {
    super(`Circuito abierto: ${name2}`);
    this.name = "CircuitOpenError";
  }
}

export type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private failures = 0;
  private state: CircuitState = "closed";
  private lastFailureAt = 0;

  constructor(
    private readonly opts: {
      name: string;
      threshold: number;
      resetMs: number;
      now?: () => number; // inyectable para tests
    },
  ) {}

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  getState(): CircuitState {
    return this.state;
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (this.now() - this.lastFailureAt > this.opts.resetMs) {
        this.state = "half-open"; // permitir una llamada de prueba
      } else {
        throw new CircuitOpenError(this.opts.name);
      }
    }
    try {
      const result = await fn();
      // Éxito → cerrar y limpiar contador.
      this.failures = 0;
      this.state = "closed";
      return result;
    } catch (err) {
      this.failures++;
      this.lastFailureAt = this.now();
      if (this.failures >= this.opts.threshold) this.state = "open";
      throw err;
    }
  }
}
