/*
 * WCAG 2.5.3 "Label in Name" en los botones flotantes del Estudio.
 *
 * Modo de fallo real (auditoría de accesibilidad 2026-07-24): el FAB móvil decía **Editar** pero
 * su nombre accesible era `aria-label="Abrir herramientas (plantillas y fotos)"`. Quien maneja el
 * computador por voz (Voice Control / Voice Access / Dragon) dice lo que LEE — "haz clic en
 * Editar" — y el comando no encontraba nada: el botón que abre TODA la personalización quedaba
 * inalcanzable. Lo mismo con "Ver mi calendario" ("Ver tus tarjetas mes…"), "Ver en un libro"
 * ("Ver tu separador…") y "Ver en tu espacio" ("Míralo en tu espacio…").
 *
 * La corrección es la técnica G208: el nombre accesible se calcula del CONTENIDO del botón —
 * texto visible + un `<span class="sr-only">` con el detalle — en vez de un `aria-label` que lo
 * reemplaza. Así el nombre contiene el texto visible por construcción, y el lector de pantalla
 * sigue oyendo la descripción larga.
 *
 * Test estático: montar `StudioEditor` exige zustand, Konva, WebGL y un producto de BD, y aun así
 * habría que reimplementar el algoritmo de accessible name para verificar esto. Leer el JSX
 * verifica los cinco FABs de una y falla igual si mañana alguien vuelve a poner un `aria-label`
 * que tape el texto visible.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(__dirname, "studio-editor.tsx"), "utf8");

/** Comparación tolerante a mayúsculas, tildes y espacios (así matchea el control por voz). */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

type ButtonInfo = { ariaLabel: string | null; visible: string[] };

/**
 * Extrae de cada `<button>…</button>` su `aria-label` literal (si lo tiene) y los textos VISIBLES
 * de sus `<span>` (se saltan los `sr-only`, que por definición no se ven). Un span con expresión
 * —`{building ? "Armando…" : "Ver mi calendario"}`— aporta las dos ramas: ambas son visibles en
 * algún estado y ambas deben poder decirse en voz alta.
 */
function buttons(source: string): ButtonInfo[] {
  return source
    .split("<button")
    .slice(1)
    .map((chunk) => {
      const end = chunk.indexOf("</button>");
      const body = end === -1 ? chunk : chunk.slice(0, end);
      const label = body.match(/aria-label="([^"]+)"/);
      const visible: string[] = [];
      for (const span of body.matchAll(/<span(?![\w-])([^>]*)>([\s\S]*?)<\/span>/g)) {
        if (/sr-only/.test(span[1]!)) continue;
        const inner = span[2]!.trim();
        if (inner.startsWith("{")) {
          for (const literal of inner.matchAll(/"([^"]+)"/g)) visible.push(literal[1]!);
        } else if (!/[<{]/.test(inner) && inner) {
          visible.push(inner);
        }
      }
      return { ariaLabel: label ? label[1]! : null, visible };
    });
}

describe("WCAG 2.5.3 — el nombre accesible contiene el texto visible", () => {
  it("el parser sí está viendo los FABs (si esto falla, el resto no prueba nada)", () => {
    const visible = buttons(SOURCE).flatMap((b) => b.visible);
    expect(visible).toEqual(
      expect.arrayContaining([
        "Ideas",
        "Ver mi calendario",
        "Ver en un libro",
        "Ver en tu espacio",
        "Editar",
      ]),
    );
  });

  it("ningún botón con texto visible lo tapa con un aria-label que no lo incluya", () => {
    const offenders = buttons(SOURCE)
      .filter((b) => b.ariaLabel !== null && b.visible.length > 0)
      .flatMap((b) =>
        b.visible
          .filter((v) => !normalize(b.ariaLabel!).includes(normalize(v)))
          .map((v) => `aria-label="${b.ariaLabel}" no contiene el texto visible "${v}"`),
      );
    expect(offenders).toEqual([]);
  });

  it("el FAB de Editar describe el detalle en un sr-only, no en un aria-label", () => {
    const fab = SOURCE.slice(SOURCE.indexOf("SheetTrigger asChild"));
    expect(fab).not.toMatch(/aria-label="Abrir herramientas/);
    expect(fab).toMatch(/<span className="sr-only">: abre las herramientas/);
  });
});
