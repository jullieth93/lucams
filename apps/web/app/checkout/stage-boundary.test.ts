/*
 * Completitud de la frontera de etapa: TODA Server Action del checkout debe estar guardada.
 *
 * Los tests de `lib/stage-guard.test.ts` prueban que el guard funciona; este prueba que está
 * PUESTO en todas partes. Es el modo de fallo realista (auditoría 2026-07-21, hallazgo A3):
 * nadie va a romper el guard, pero es fácil agregar mañana una acción transaccional nueva y
 * olvidarlo — y como en modo catálogo esas páginas no se renderizan, el hueco no se nota
 * navegando: solo se ve cuando alguien postea el action ID directo.
 *
 * Es un test ESTÁTICO a propósito: invocar las acciones reales exigiría montar cookies de sesión,
 * Turnstile, carrito y BD, y verificaría un solo camino. Leer el archivo verifica todos.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CHECKOUT_DIR = join(__dirname);
const GUARD_CALL = "guardTransactionalAction(";

/** Rutas `app/checkout/<paso>/actions.ts` que existan. */
function checkoutActionFiles(): string[] {
  return readdirSync(CHECKOUT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(CHECKOUT_DIR, e.name, "actions.ts"))
    .filter((p) => {
      try {
        readFileSync(p);
        return true;
      } catch {
        return false;
      }
    });
}

/** Nombres de las Server Actions exportadas (async y exportadas) del archivo. */
function exportedActions(source: string): string[] {
  return [...source.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]);
}

describe("frontera de etapa — Server Actions del checkout", () => {
  const files = checkoutActionFiles();

  it("encuentra los archivos de acciones del checkout (si no, el test se volvió ciego)", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it.each(files)("%s importa el guard de etapa", (file) => {
    const src = readFileSync(file, "utf-8");
    expect(src).toContain("@/lib/stage-guard");
  });

  it.each(files)("%s guarda TODAS sus Server Actions exportadas", (file) => {
    const src = readFileSync(file, "utf-8");
    const actions = exportedActions(src);
    expect(actions.length).toBeGreaterThan(0);

    // Cada acción debe llamar al guard dentro de su cuerpo, antes de tocar datos. Se corta el
    // fuente por declaración de acción y se exige la llamada en el trozo de cada una.
    for (const name of actions) {
      const start = src.indexOf(`export async function ${name}`);
      const nextStarts = actions
        .map((n) => src.indexOf(`export async function ${n}`))
        .filter((i) => i > start);
      const end = nextStarts.length ? Math.min(...nextStarts) : src.length;
      const body = src.slice(start, end);
      expect(body, `${name} en ${file} no llama a ${GUARD_CALL}`).toContain(GUARD_CALL);
    }
  });
});

describe("frontera de etapa — backstop en la capa de servicio", () => {
  it("finalizeCheckout y createOrderFromCart no crean órdenes sin pasar por el backstop", () => {
    const checkout = readFileSync(
      join(__dirname, "..", "..", "features", "checkout", "service.ts"),
      "utf-8",
    );
    const orders = readFileSync(
      join(__dirname, "..", "..", "features", "orders", "service.ts"),
      "utf-8",
    );

    expect(checkout).toContain('assertTransactionalAllowed("finalizeCheckout")');
    expect(orders).toContain('assertTransactionalAllowed("createOrderFromCart")');
  });

  it("processPaidOrder (saga post-PAID) tampoco corre sin el backstop de etapa", () => {
    const saga = readFileSync(
      join(__dirname, "..", "..", "features", "orders", "saga.ts"),
      "utf-8",
    );
    expect(saga).toContain('assertTransactionalAllowed("processPaidOrder")');
  });
});
