/*
 * Gate de convención (bug LCM-2026-0004): NINGÚN archivo de `app/` o `components/`
 * puede formatear fechas con `Intl.DateTimeFormat` / `toLocaleDateString` /
 * `toLocaleTimeString` ad hoc — sin `timeZone` explícito renderizan en la zona del
 * servidor (UTC en Vercel) y las fechas visibles se corren 5 horas. Toda fecha
 * visible para humanos sale de `@/lib/datetime` (America/Bogota fijo).
 *
 * Escaneo estático de fuentes (mismo patrón que cms-sitemap-parity): falla con la
 * lista exacta de infractores para que el PR lo corrija antes de mergear.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");
const SCANNED_DIRS = [join(ROOT, "app"), join(ROOT, "components")];
const FORBIDDEN = /\bnew Intl\.DateTimeFormat\(|\.toLocaleDateString\(|\.toLocaleTimeString\(/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      yield full;
    }
  }
}

describe("convención de fechas — lib/datetime es la única fuente", () => {
  it("ningún archivo de app/ o components/ formatea fechas ad hoc", () => {
    const offenders: string[] = [];
    for (const dir of SCANNED_DIRS) {
      for (const file of walk(dir)) {
        if (FORBIDDEN.test(readFileSync(file, "utf8"))) {
          offenders.push(relative(ROOT, file));
        }
      }
    }
    expect(
      offenders,
      `Fechas formateadas fuera de @/lib/datetime (se renderizan en UTC en Vercel):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
