/*
 * La CI tiene que dispararse en las ramas que EXISTEN — sobre todo en la que ven los clientes.
 *
 * Modo de fallo real (auditoría 2026-07-21, hallazgo A4): `.github/workflows/ci.yml` disparaba en
 * `[develop, main]`. `main` nunca existió en este repo (la rama de producción se llama
 * `production`), así que cada merge a `production` se desplegaba sin typecheck, sin lint, sin los
 * ~1.400 vitest, sin E2E ni gitleaks — y en verde, porque GitHub no avisa cuando un workflow
 * apunta a una rama fantasma: simplemente no corre. Es invisible salvo que alguien mire el YAML.
 *
 * Por eso el test es estático sobre el YAML: no hay forma de "ejecutar" el trigger localmente, y
 * lo que se quiere congelar es exactamente el texto de la config.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CI_YML = join(__dirname, "..", "..", "..", ".github", "workflows", "ci.yml");

/**
 * Ramas PERMANENTES que siempre deben gatearse. `catalogo-whatsapp` NO va aquí a propósito: es la
 * rama de la Etapa 1 y se borrará al mergearse — exigirla volvería rojo el test justo cuando
 * alguien haga lo correcto (quitarla del YAML), que es el mismo anti-patrón que este test previene.
 */
const REQUIRED_BRANCHES = ["develop", "production"];

/**
 * Ramas que EXISTEN y por tanto pueden aparecer en el trigger. La aserción se hace por
 * pertenencia a este allowlist en vez de prohibir el literal `main`: si algún día se renombra
 * `production` → `main` (cosa habitual), basta actualizar esta constante con intención clara, en
 * lugar de que el test falle con un diagnóstico engañoso sobre una "rama fantasma".
 */
const EXISTING_BRANCHES = ["develop", "production", "catalogo-whatsapp", "master"];

/**
 * Extrae las listas `branches: [...]` del bloque `on:` sin depender de un parser YAML
 * (el repo no tiene dependencia de yaml y no vamos a agregar una para un test).
 */
function triggerBranchLists(source: string): string[][] {
  return [...source.matchAll(/^\s+branches:\s*\[([^\]]*)\]/gm)].map((m) =>
    m[1]
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean),
  );
}

describe("triggers de la CI", () => {
  const source = readFileSync(CI_YML, "utf-8");
  const lists = triggerBranchLists(source);

  it("encuentra las listas de ramas de push y pull_request (si no, el test se volvió ciego)", () => {
    expect(lists.length).toBe(2);
  });

  it.each(REQUIRED_BRANCHES)("gatea la rama %s en push y en pull_request", (branch) => {
    for (const list of lists) {
      expect(list, `falta '${branch}' en ${JSON.stringify(list)}`).toContain(branch);
    }
  });

  it("no apunta a ninguna rama inexistente (el fallo original: 'main' nunca existió)", () => {
    for (const list of lists) {
      for (const branch of list) {
        expect(
          EXISTING_BRANCHES,
          `'${branch}' no está en la lista de ramas conocidas: o la rama no existe (y el gate no ` +
            `corre) o hay que agregarla a EXISTING_BRANCHES`,
        ).toContain(branch);
      }
    }
  });

  it("usa la misma lista de ramas en push y en pull_request", () => {
    expect(lists[0]).toEqual(lists[1]);
  });
});
