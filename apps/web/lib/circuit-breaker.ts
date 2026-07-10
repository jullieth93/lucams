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
  private probing = false; // hay una llamada de prueba (half-open) en vuelo

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

  /**
   * PRECONDICIÓN DURA: `fn` DEBE settlear siempre (resolver o rechazar) en tiempo
   * acotado — envolvé toda llamada de red en un timeout (p.ej. `fetchWithTimeout`).
   * Una `fn` que se cuelga indefinidamente durante la prueba de half-open dejaría
   * el flag `probing` en true para siempre → el breaker queda wedgeado (todo
   * request futuro falla-rápido y la recuperación del proveedor nunca se detecta,
   * hasta que el worker se recicle). Los callers actuales (wompi, aveonline) ya
   * cumplen: pasan `fetchWithTimeout` con timeout obligatorio.
   */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (this.now() - this.lastFailureAt > this.opts.resetMs) {
        this.state = "half-open"; // permitir UNA llamada de prueba
      } else {
        throw new CircuitOpenError(this.opts.name);
      }
    }
    // En half-open solo pasa UNA prueba a la vez: si ya hay una en vuelo, los
    // requests concurrentes fallan-rápido en vez de martillar al proveedor caído
    // (Vercel sirve requests concurrentes en un mismo worker → sin esto el breaker
    // no protegería durante la ventana de prueba). `isProbe` local para que solo
    // ESTA llamada (la prueba) limpie el flag en el finally, no una llamada
    // closed concurrente que termine mientras la prueba sigue en vuelo.
    let isProbe = false;
    if (this.state === "half-open") {
      if (this.probing) throw new CircuitOpenError(this.opts.name);
      this.probing = true;
      isProbe = true;
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
    } finally {
      if (isProbe) this.probing = false;
    }
  }
}
