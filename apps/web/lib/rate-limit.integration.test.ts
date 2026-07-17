/*
 * Tests de integración de `rateLimit()` contra la DB real (ADR-016).
 *
 * Módulo DB-coupled: `rateLimit` llama a la función SQL `rate_limit_check`
 * (supabase/migrations/00000000000003_rate_limit.sql) vía `prisma.$queryRaw`.
 * No hay forma realista de mockear esa función sin perder el valor del test —
 * lo que importa es el contrato atómico increment+check que ejecuta Postgres.
 *
 * Requiere DATABASE_URL (corre vía `dotenv -e .env.local -- vitest`). Sin ella
 * se saltan (skipIf) para no romper CI sin DB.
 *
 * Aislamiento: cada test usa una `key` única construida con un prefijo RUN por
 * corrida + un sufijo por caso → ningún test pisa el bucket de otro y ningún
 * bucket real (login:<ip>, api:<id>, etc.) se toca. afterAll borra SOLO las
 * filas cuyo `key` empieza con el prefijo RUN.
 *
 * Comportamiento REAL verificado por probe antes de fijar aserciones:
 *   - count se devuelve como `number` (Postgres INT → JS number, no bigint).
 *   - reset_at se devuelve como `Date`.
 *   - allowed = (count <= limit): en el límite exacto allowed=true; recién al
 *     EXCEDER (count = limit+1) pasa a false.
 *   - La ventana es FIJA (fixed window), no deslizante: window_start queda
 *     anclado hasta que expira; al expirar, count reinicia a 1 y window_start
 *     avanza a NOW(). Documentado como tal abajo.
 */

import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { rateLimit } from "./rate-limit";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida. TODA key de test lo lleva → la limpieza borra
// exactamente lo que creamos sin tocar buckets reales.
const RUN = `RLITEST-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// Genera una key FRESCA en cada invocación (nonce monótono + random). Esto hace
// los tests retry-safe: vitest está configurado con `retry: 2`, y si un caso
// reusara una key fija, el bucket sobreviviente del intento fallido envenenaría
// el reintento (count arrancaría en >1). Cada `k(...)` devuelve un bucket virgen.
let nonce = 0;
const k = (suffix: string) => `${RUN}:${suffix}:${nonce++}-${Math.floor(Math.random() * 1e9)}`;

describe.skipIf(!hasDb)("rateLimit() — integración DB (ADR-016)", () => {
  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE ${`${RUN}:%`}`;
  });

  // ───────────────────────── forma del resultado ─────────────────────────

  describe("forma y tipos del RateLimitResult", () => {
    it("primer hit: allowed=true, count=1 y resetAt es un Date futuro", async () => {
      const before = Date.now();
      const res = await rateLimit(k("shape"), 5, 60);

      expect(res.allowed).toBe(true);
      expect(res.count).toBe(1);
      // count tipado como number (no bigint): aritmética directa válida.
      expect(typeof res.count).toBe("number");
      expect(res.resetAt).toBeInstanceOf(Date);
      // resetAt ≈ window_start + 60s; window_start ≈ ahora → ~60s en el futuro.
      const deltaMs = res.resetAt.getTime() - before;
      expect(deltaMs).toBeGreaterThan(55_000);
      expect(deltaMs).toBeLessThan(65_000);
    });
  });

  // ───────────────────────── conteo incremental ─────────────────────────

  describe("incremento de count en hits sucesivos sobre la misma key", () => {
    it("cuenta 1,2,3 en tres llamadas consecutivas (mismo bucket)", async () => {
      const key = k("incr");
      const r1 = await rateLimit(key, 10, 60);
      const r2 = await rateLimit(key, 10, 60);
      const r3 = await rateLimit(key, 10, 60);

      expect(r1.count).toBe(1);
      expect(r2.count).toBe(2);
      expect(r3.count).toBe(3);
      // Todos por debajo del límite → permitidos.
      expect([r1.allowed, r2.allowed, r3.allowed]).toEqual([true, true, true]);
    });

    it("keys distintas no comparten contador (aislamiento por bucket)", async () => {
      const a = await rateLimit(k("iso-a"), 10, 60);
      const b = await rateLimit(k("iso-b"), 10, 60);
      expect(a.count).toBe(1);
      expect(b.count).toBe(1);
    });
  });

  // ───────────────────────── borde del límite ─────────────────────────

  describe("borde exacto del límite (allowed = count <= limit)", () => {
    it("con limit=3: hits 1,2,3 permitidos; el 4º (count=4) bloqueado", async () => {
      const key = k("boundary");
      const r1 = await rateLimit(key, 3, 60);
      const r2 = await rateLimit(key, 3, 60);
      const r3 = await rateLimit(key, 3, 60);
      const r4 = await rateLimit(key, 3, 60);

      // En el límite exacto todavía se permite (count == limit).
      expect(r3.count).toBe(3);
      expect(r3.allowed).toBe(true);

      // Recién al EXCEDER (count = limit + 1) se bloquea.
      expect(r4.count).toBe(4);
      expect(r4.allowed).toBe(false);

      expect([r1.allowed, r2.allowed]).toEqual([true, true]);
    });

    it("una vez excedido, hits posteriores siguen bloqueados y el count sigue subiendo", async () => {
      const key = k("over-keeps-counting");
      await rateLimit(key, 2, 60); // count=1 allowed
      await rateLimit(key, 2, 60); // count=2 allowed (== limit)
      const r3 = await rateLimit(key, 2, 60); // count=3 blocked
      const r4 = await rateLimit(key, 2, 60); // count=4 blocked
      const r5 = await rateLimit(key, 2, 60); // count=5 blocked

      expect(r3).toMatchObject({ count: 3, allowed: false });
      expect(r4).toMatchObject({ count: 4, allowed: false });
      expect(r5).toMatchObject({ count: 5, allowed: false });
    });

    it("resetAt permanece estable mientras la ventana no expira (fixed window, no se extiende por hit)", async () => {
      const key = k("stable-reset");
      const r1 = await rateLimit(key, 5, 300);
      const r2 = await rateLimit(key, 5, 300);
      const r3 = await rateLimit(key, 5, 300);

      // window_start no se mueve dentro de la misma ventana → resetAt idéntico.
      expect(r2.resetAt.getTime()).toBe(r1.resetAt.getTime());
      expect(r3.resetAt.getTime()).toBe(r1.resetAt.getTime());
    });
  });

  // ───────────────────────── expiración de ventana ─────────────────────────

  describe("expiración de ventana (reinicio del bucket)", () => {
    it("tras expirar la ventana, count reinicia a 1, allowed vuelve a true y resetAt avanza", async () => {
      const key = k("window-expiry");

      // Llenar y exceder una ventana de 2s. Window amplio (2s) para que los tres
      // round-trips al pooler de Supabase caigan con holgura dentro de la misma
      // ventana; un window de 1s era flaky porque la latencia de red podía cruzar
      // el borde a mitad de secuencia.
      const r1 = await rateLimit(key, 2, 2); // count=1
      const r2 = await rateLimit(key, 2, 2); // count=2 (== limit, allowed)
      const r3 = await rateLimit(key, 2, 2); // count=3 (> limit, blocked)

      expect(r1.count).toBe(1);
      expect(r2).toMatchObject({ count: 2, allowed: true });
      expect(r3).toMatchObject({ count: 3, allowed: false });
      const oldResetAt = r1.resetAt.getTime();

      // Esperar a que la ventana de 2s expire holgadamente (window_start + 2s < NOW()).
      await new Promise((resolve) => setTimeout(resolve, 2600));

      const r4 = await rateLimit(key, 2, 2);
      // Bucket reiniciado: NUEVA ventana → count 1, permitido de nuevo.
      expect(r4.count).toBe(1);
      expect(r4.allowed).toBe(true);
      // window_start avanzó → resetAt estrictamente posterior al de la ventana vieja.
      expect(r4.resetAt.getTime()).toBeGreaterThan(oldResetAt);
    }, 30000);
  });

  // ───────────────────────── concurrencia / atomicidad ─────────────────────────
  //
  // LA garantía central de ADR-016: el increment+check ocurre dentro de una
  // sola sentencia SQL (INSERT ... ON CONFLICT DO UPDATE ... RETURNING), así que
  // N requests simultáneos sobre el MISMO bucket no pueden pisarse (sin
  // lost-updates ni dirty reads). Sin atomicidad, el rate limiter sería
  // bypasseable bajo carga — exactamente el escenario de un atacante.

  describe("concurrencia: increment atómico bajo carga paralela", () => {
    it("N hits en paralelo (Promise.all) sobre la misma key → counts {1..N} sin perdidos ni duplicados", async () => {
      const key = k("concurrent");
      const N = 25;
      // limit alto a propósito: aquí medimos el CONTEO, no el bloqueo. Todos
      // deben caer dentro de la misma ventana (window de 60s >> latencia).
      const limit = 1000;

      const results = await Promise.all(Array.from({ length: N }, () => rateLimit(key, limit, 60)));

      // Cada count devuelto es único y cubre exactamente el rango 1..N. Un
      // increment perdido produciría un duplicado (dos calls con el mismo count)
      // o un hueco; una lectura sucia rompería la unicidad. Ordenamos porque el
      // orden de resolución de las promesas no es determinista.
      const counts = results.map((r) => r.count).sort((a, b) => a - b);
      expect(counts).toEqual(Array.from({ length: N }, (_, i) => i + 1));

      // Sin duplicados (la afirmación más fuerte contra lost-updates).
      expect(new Set(counts).size).toBe(N);

      // El estado FINAL persistido en DB == N exacto: ninguna escritura se perdió.
      const row = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT count FROM rate_limit_buckets WHERE key = ${key}`;
      expect(row[0]?.count).toBe(N);

      // Todos bajo el límite alto → todos permitidos.
      expect(results.every((r) => r.allowed)).toBe(true);
      // window_start es único por bucket → todos comparten el mismo resetAt.
      const resetTimes = new Set(results.map((r) => r.resetAt.getTime()));
      expect(resetTimes.size).toBe(1);
    }, 30000);

    it("bajo carga paralela el límite se respeta: exactamente `limit` permitidos, el resto bloqueado", async () => {
      const key = k("concurrent-limit");
      const N = 20;
      const limit = 8;

      const results = await Promise.all(Array.from({ length: N }, () => rateLimit(key, limit, 60)));

      // allowed == (count <= limit). Con counts 1..N únicos y atómicos, deben
      // resultar EXACTAMENTE `limit` permitidos (counts 1..8) y N-limit
      // bloqueados (counts 9..N). Si la atomicidad fallara, este número se
      // dispararía (más permitidos de la cuenta) — el bypass clásico.
      const allowedCount = results.filter((r) => r.allowed).length;
      expect(allowedCount).toBe(limit);
      expect(results.filter((r) => !r.allowed).length).toBe(N - limit);

      // Coherencia interna: cada allowed corresponde a count<=limit y viceversa.
      for (const r of results) {
        expect(r.allowed).toBe(r.count <= limit);
      }
    }, 30000);
  });

  // ───────────────────────── entradas borde / inválidas ─────────────────────────

  describe("entradas borde e inválidas (seguridad)", () => {
    it("limit=0 bloquea desde el primer hit (count=1 > 0)", async () => {
      // Caso seguridad: un bucket con límite 0 nunca debe permitir nada.
      const res = await rateLimit(k("limit-zero"), 0, 60);
      expect(res.count).toBe(1);
      expect(res.allowed).toBe(false);
    });

    it("limit negativo (-1) bloquea desde el primer hit y el count sigue incrementando", async () => {
      // Fuera de rango: un limit < 0 no tiene sentido semántico, pero la función
      // SQL no lo rechaza — evalúa allowed = (count <= limit). Con count=1 y
      // limit=-1, 1 <= -1 es false → bloqueado desde el inicio (más estricto aún
      // que limit=0). El bucket se comporta normal: el contador sube por hit.
      const key = k("neg-limit");
      const r1 = await rateLimit(key, -1, 60);
      const r2 = await rateLimit(key, -1, 60);
      expect(r1).toMatchObject({ count: 1, allowed: false });
      expect(r2).toMatchObject({ count: 2, allowed: false });
    });

    it("windowSeconds negativo (-60) NEUTRALIZA el limitador: cada hit reinicia el bucket (count siempre 1)", async () => {
      // Comportamiento REAL verificado por probe (riesgo de seguridad, ver
      // bugsFound): con window negativo, reset_at = window_start + (-60s) queda
      // SIEMPRE en el pasado, por lo que la condición de expiración
      // (window_start + window < NOW()) es verdadera en CADA llamada → el SQL
      // reinicia count a 1 y avanza window_start a NOW() en cada hit. Resultado:
      // el contador nunca acumula y el límite es inalcanzable (allowed siempre
      // true mientras limit>=1). Un window negativo deja el rate limit inerte.
      const before = Date.now();
      const key = k("neg-window");
      const r1 = await rateLimit(key, 5, -60);
      const r2 = await rateLimit(key, 5, -60);
      const r3 = await rateLimit(key, 5, -60);

      // Nunca acumula: cada llamada vuelve a count=1.
      expect(r1.count).toBe(1);
      expect(r2.count).toBe(1);
      expect(r3.count).toBe(1);
      expect([r1.allowed, r2.allowed, r3.allowed]).toEqual([true, true, true]);

      // resetAt = window_start + (-60s) → ~60s en el PASADO respecto a "ahora".
      const deltaMs = r1.resetAt.getTime() - before;
      expect(deltaMs).toBeLessThan(-55_000);
      expect(deltaMs).toBeGreaterThan(-65_000);

      // window_start avanza a NOW() en cada hit → resetAt estrictamente creciente.
      expect(r2.resetAt.getTime()).toBeGreaterThanOrEqual(r1.resetAt.getTime());
      expect(r3.resetAt.getTime()).toBeGreaterThanOrEqual(r2.resetAt.getTime());
    });

    it("limit=1 permite exactamente un hit y bloquea el segundo", async () => {
      const key = k("limit-one");
      const r1 = await rateLimit(key, 1, 60);
      const r2 = await rateLimit(key, 1, 60);
      expect(r1).toMatchObject({ count: 1, allowed: true });
      expect(r2).toMatchObject({ count: 2, allowed: false });
    });

    it("key con caracteres especiales se usa literal (no hay inyección: $queryRaw parametriza)", async () => {
      // Seguridad: la key entra como parámetro ::text, no concatenada. Una key
      // con comillas/escapes NO altera el SQL ni colisiona con otra key.
      const evil = k("ev'il; DROP TABLE rate_limit_buckets;--");
      const benign = k("ev_other");

      const r1 = await rateLimit(evil, 5, 60);
      // La tabla sigue existiendo (si hubiera inyección, el siguiente call fallaría).
      const r2 = await rateLimit(benign, 5, 60);
      const r3 = await rateLimit(evil, 5, 60);

      expect(r1.count).toBe(1);
      expect(r2.count).toBe(1); // bucket independiente, no contaminado por la key "evil"
      expect(r3.count).toBe(2); // misma key evil → su propio contador sigue

      // Confirmar que la tabla y la función siguen operativas tras la "inyección".
      const stillThere = await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::int AS n FROM rate_limit_buckets WHERE key = ${evil}`;
      expect(Number(stillThere[0].n)).toBe(1);
    });

    it("una key larga (~512 chars) se maneja como bucket válido", async () => {
      const longKey = k("long-" + "x".repeat(512));
      const res = await rateLimit(longKey, 5, 60);
      expect(res.count).toBe(1);
      expect(res.allowed).toBe(true);
    });

    it("la misma key con ventanas distintas comparte UN solo bucket (window_seconds no es parte de la PK)", async () => {
      // Documenta comportamiento real: la PK del bucket es solo `key`. Llamar con
      // distinto windowSeconds NO crea buckets separados; el segundo hit
      // incrementa el contador del primero y recalcula resetAt con el nuevo window.
      const key = k("shared-bucket");
      const r1 = await rateLimit(key, 10, 60);
      const r2 = await rateLimit(key, 10, 600);
      expect(r1.count).toBe(1);
      expect(r2.count).toBe(2); // mismo bucket, no uno nuevo
    });
  });

  // ───────────────────────── consistencia con la función SQL ─────────────────────────

  describe("consistencia entre el wrapper TS y la función SQL cruda", () => {
    it("rateLimit() refleja el mismo count/allowed que rate_limit_check directo", async () => {
      const key = k("sql-parity");
      // Primer hit vía wrapper.
      const wrapped = await rateLimit(key, 4, 60);
      expect(wrapped.count).toBe(1);

      // Segundo hit vía SQL crudo (mismo contrato que el wrapper usa internamente).
      const raw = await prisma.$queryRaw<
        Array<{ allowed: boolean; count: number; reset_at: Date }>
      >`SELECT * FROM rate_limit_check(${key}::text, ${4}::int, ${60}::int)`;

      expect(raw[0].count).toBe(2);
      expect(raw[0].allowed).toBe(true);
      // resetAt del wrapper coincide con el window_start ya anclado.
      expect(raw[0].reset_at.getTime()).toBe(wrapped.resetAt.getTime());
    });
  });
});

// ───────────────────────── contrato fail-open (UNIT, sin DB) ─────────────────────────
//
// La rama fail-open de rateLimit() (rows[0] === undefined) es INALCANZABLE vía
// la función SQL real: rate_limit_check SIEMPRE devuelve exactamente una fila
// (RETURN QUERY con un único SELECT). Para ejercitarla de verdad —no solo
// documentarla— se mockea `prisma.$queryRaw` para devolver [] en UNA sola
// llamada. Es un test UNIT puro: no toca la DB (sin skipIf), 100% determinista
// y offline. Se usa spyOn + mockResolvedValueOnce + mockRestore para NO
// contaminar los tests de integración que comparten el mismo `prisma` real.
//
// Contrato esperado (por inspección de rate-limit.ts líneas 49-57):
//   if (!row) return { allowed: true, count: 0, resetAt: now + windowSeconds*1000 }
//
// Es deliberadamente permisivo (fail-open): si la verificación de rate limit
// no devuelve datos, NO se bloquea al usuario legítimo.

describe("rateLimit() — fail-open cuando la fila no llega (UNIT, prisma mockeado)", () => {
  it("rows == [] → allowed=true, count=0 y resetAt calculado en cliente (now + windowSeconds*1000)", async () => {
    const windowSeconds = 120;
    const before = Date.now();

    // Mock SOLO esta invocación: $queryRaw devuelve un array vacío, simulando el
    // caso imposible-pero-defendido en que la función SQL no retorna fila.
    const spy = vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([] as never);

    const res = await rateLimit("failopen:any", 5, windowSeconds);
    const after = Date.now();

    // No se bloquea al usuario legítimo: fail-open.
    expect(res.allowed).toBe(true);
    // count=0 es el sentinel del path fail-open (NO 1, que sería el SQL real).
    expect(res.count).toBe(0);
    expect(res.resetAt).toBeInstanceOf(Date);

    // resetAt se calcula con el reloj del CLIENTE: Date.now() + windowSeconds*1000.
    // Acotamos entre las marcas before/after capturadas alrededor de la llamada.
    const resetMs = res.resetAt.getTime();
    expect(resetMs).toBeGreaterThanOrEqual(before + windowSeconds * 1000);
    expect(resetMs).toBeLessThanOrEqual(after + windowSeconds * 1000);

    // Se llamó exactamente una vez y no se pegó a la DB real.
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});
