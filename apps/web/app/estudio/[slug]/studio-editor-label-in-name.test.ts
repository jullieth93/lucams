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
 * Roadmap B1: los textos visibles y los complementos sr-only ya NO son literales — vienen del CMS
 * (`texts.*`, con DEFAULT_STUDIO_TEXTS como fallback exacto). El parser de este test resuelve las
 * referencias `texts.<sección>.<prop>` contra ese DEFAULT, así sigue verificando el invariante
 * con los textos que se ven por defecto en producción (y si mañana alguien cambia el default,
 * la comparación se hace contra el texto nuevo).
 *
 * Test estático: montar `StudioEditor` exige zustand, Konva, WebGL y un producto de BD, y aun así
 * habría que reimplementar el algoritmo de accessible name para verificar esto. Leer el JSX
 * verifica los cinco FABs de una y falla igual si mañana alguien vuelve a poner un `aria-label`
 * que tape el texto visible.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_STUDIO_TEXTS } from "./studio-texts";

const SOURCE = readFileSync(join(__dirname, "studio-editor.tsx"), "utf8");

/** Comparación tolerante a mayúsculas, tildes y espacios (así matchea el control por voz). */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Resuelve una referencia `texts.<sección>.<prop>` al texto por defecto (fallback pre-CMS). */
function resolveStudioText(ref: string): string | null {
  const m = ref.match(/^texts\.(\w+)\.(\w+)$/);
  if (!m) return null;
  const section = DEFAULT_STUDIO_TEXTS[m[1] as keyof typeof DEFAULT_STUDIO_TEXTS] as
    Record<string, string> | undefined;
  return section?.[m[2]!] ?? null;
}

type ButtonInfo = { ariaLabel: string | null; visible: string[] };

/**
 * Extrae de cada `<button>…</button>` su `aria-label` (literal o referencia `texts.*` resuelta
 * al default CMS) y los textos VISIBLES de sus `<span>` (se saltan los `sr-only`, que por
 * definición no se ven). Un span con expresión aporta todas sus ramas: literales (`"Armando…"`)
 * y referencias CMS (`texts.lienzo.btnCalendario` → "Ver mi calendario") — todas son visibles
 * en algún estado y todas deben poder decirse en voz alta.
 */
function buttons(source: string): ButtonInfo[] {
  return source
    .split("<button")
    .slice(1)
    .map((chunk) => {
      const end = chunk.indexOf("</button>");
      const body = end === -1 ? chunk : chunk.slice(0, end);
      const labelLiteral = body.match(/aria-label="([^"]+)"/);
      const labelRef = body.match(/aria-label=\{(texts\.\w+\.\w+)\}/);
      const ariaLabel = labelLiteral
        ? labelLiteral[1]!
        : labelRef
          ? resolveStudioText(labelRef[1]!)
          : null;
      const visible: string[] = [];
      for (const span of body.matchAll(/<span(?![\w-])([^>]*)>([\s\S]*?)<\/span>/g)) {
        if (/sr-only/.test(span[1]!)) continue;
        const inner = span[2]!.trim();
        if (inner.startsWith("{")) {
          for (const literal of inner.matchAll(/"([^"]+)"/g)) visible.push(literal[1]!);
          for (const ref of inner.matchAll(/texts\.\w+\.\w+/g)) {
            const resolved = resolveStudioText(ref[0]);
            if (resolved) visible.push(resolved);
          }
        } else if (!/[<{]/.test(inner) && inner) {
          visible.push(inner);
        }
      }
      return { ariaLabel, visible };
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
    expect(fab).toMatch(/<span className="sr-only">\{texts\.comun\.editarSr\}</);
    // El complemento audible por defecto sigue existiendo y sigue siendo un complemento
    // (empieza con ":" — se anexa al texto visible "Editar", no lo reemplaza).
    expect(DEFAULT_STUDIO_TEXTS.comun.editarSr).toMatch(/^: .*herramientas/);
  });
});
