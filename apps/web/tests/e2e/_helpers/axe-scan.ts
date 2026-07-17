/*
 * Helper de escaneo axe-core para los specs de a11y (Bloque E, Lucy 2026-07-03).
 *
 * Envuelve @axe-core/playwright con la config del proyecto: reglas WCAG 2.1 A/AA
 * (el objetivo de conformidad de la tienda) y un resumen compacto de violaciones
 * para triage. `scanA11y` devuelve las violaciones; `formatViolations` las
 * imprime legibles (id, impacto, ayuda, primeros targets).
 */

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

// axe-core no es dep directa (llega vía @axe-core/playwright) → derivamos el tipo
// de violación del retorno de analyze() en vez de importar "axe-core" (no resoluble).
type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;
type Result = AxeResults["violations"][number];

// Etiquetas WCAG a evaluar: A y AA (2.0 + 2.1). Es el nivel de conformidad
// razonable para e-commerce (WCAG 2.1 AA es el estándar de facto).
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

export async function scanA11y(
  page: Page,
  opts: { disableRules?: string[] } = {},
): Promise<Result[]> {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (opts.disableRules?.length) builder = builder.disableRules(opts.disableRules);
  const results = await builder.analyze();
  return results.violations;
}

export function formatViolations(label: string, violations: Result[]): string {
  if (violations.length === 0) return `✅ ${label}: 0 violaciones`;
  const lines = [`❌ ${label}: ${violations.length} violación(es)`];
  for (const v of violations) {
    lines.push(`  · [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} nodo/s)`);
    for (const n of v.nodes) {
      lines.push(`      TARGET ${n.target.join(" ")}`);
      // Datos del check (color-contrast trae fg/bg/ratio; otros, contexto).
      const data = n.any?.[0]?.data as
        | {
            fgColor?: string;
            bgColor?: string;
            contrastRatio?: number;
            expectedContrastRatio?: string;
          }
        | undefined;
      if (data?.contrastRatio != null) {
        lines.push(
          `        fg=${data.fgColor} bg=${data.bgColor} ratio=${data.contrastRatio} (need ${data.expectedContrastRatio})`,
        );
      }
      lines.push(`        HTML ${(n.html ?? "").slice(0, 120)}`);
    }
  }
  return lines.join("\n");
}
