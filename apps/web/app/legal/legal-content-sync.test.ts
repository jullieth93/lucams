/*
 * El texto legal que se renderiza DE VERDAD debe coincidir con la fuente canónica.
 *
 * Auditoría 2026-07-21 (blocker de contenido legal): se reescribieron los `.md` de
 * `packages/db/legal-content/` para reflejar la Etapa 1 (venta por cotización, sin cobro en
 * línea) y el cambio quedó INERTE. Las páginas leen el CmsBlock de la base y caen a un FALLBACK
 * hardcodeado cuando el bloque no existe, no está publicado o la DB falla — y ese fallback seguía
 * prometiendo «Eliges el medio de pago», «a través de Wompi, y pago contraentrega». Es decir: el
 * único texto garantizado ante una caída de la base era el que ya no era cierto (Ley 1480 arts. 23
 * y 29: información veraz; la publicidad vincula al proveedor).
 *
 * Este test es la garantía de que no vuelva a divergir: editar el `.md` sin propagar al fallback
 * (o al revés) rompe la suite. No valida el CONTENIDO legal —eso es criterio humano/abogado—,
 * solo que las dos copias digan exactamente lo mismo.
 *
 * Nota: publicar el texto en el CMS es un paso HUMANO aparte; mientras no ocurra, el fallback es
 * lo que ven los clientes.
 *
 * SI ESTE TEST FALLA tras editar un `.md`: copia el markdown YA FORMATEADO al template literal
 * `const FALLBACK` de la página. El orden importa — `pnpm format` realinea las tablas del markdown
 * pero NO toca el contenido del template literal, así que sincronizar antes de formatear vuelve a
 * divergir.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Los 6 documentos cuyo fallback se puede mantener idéntico al .md. `cookies` y `security`
// quedan fuera a propósito: sus markdown contienen backticks/`${` que romperían el template
// literal del fallback, así que su copia se mantiene a mano (y no cambiaron en la Etapa 1).
const LEGAL_DOCS = [
  "terminos",
  "devoluciones",
  "garantias",
  "privacidad",
  "habeas-data",
  "subprocesadores",
] as const;

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

function canonicalMarkdown(name: string): string {
  return readFileSync(
    join(REPO_ROOT, "packages", "db", "legal-content", `legal.${name}.md`),
    "utf-8",
  ).trim();
}

/** Extrae el contenido del template literal `const FALLBACK = \`…\`;` de la página. */
function pageFallback(name: string): string {
  const src = readFileSync(join(__dirname, name, "page.tsx"), "utf-8");
  const match = src.match(/const FALLBACK = `\n([\s\S]*?)\n`;/);
  if (!match) throw new Error(`No se encontró const FALLBACK en legal/${name}/page.tsx`);
  return match[1].trim();
}

describe("contenido legal — el fallback renderizado coincide con la fuente canónica", () => {
  it.each(LEGAL_DOCS)("legal/%s: fallback === legal-content/*.md", (name) => {
    expect(pageFallback(name)).toBe(canonicalMarkdown(name));
  });

  // Guardas de veracidad para la Etapa 1: estas frases prometen cobro en línea. Pueden aparecer,
  // pero SOLO encuadradas en el futuro ("cuando activemos la compra en línea"), nunca como lo que
  // la tienda hace hoy. Si alguien reintroduce el texto v2 sin encuadre, esto lo caza.
  it.each(LEGAL_DOCS)("legal/%s: ninguna promesa de cobro en línea sin encuadrar", (name) => {
    const text = canonicalMarkdown(name);
    // El encuadre puede redactarse de varias formas ("cuando activemos la compra/el pago en
    // línea", "hoy operamos por cotización"…). Se busca la señal en minúsculas y sin exigir una
    // frase exacta, para no volver frágil el test ante una reescritura legítima del copy.
    const framingSignals = ["cuando activemos", "por cotización", "todavía no cobramos"];
    const promises = ["Wompi", "PSE", "contraentrega", "medio de pago"];
    const lower = text.toLowerCase();
    const mentionsPromise = promises.some((p) => text.includes(p));
    if (!mentionsPromise) return; // el documento no habla de pago: nada que encuadrar
    expect(
      framingSignals.some((s) => lower.includes(s)),
      `legal.${name}.md menciona pago en línea sin encuadrarlo en la etapa actual`,
    ).toBe(true);
  });

  it("los documentos no publican identificación que la tienda todavía no tiene (NIT/RUT)", () => {
    for (const name of LEGAL_DOCS) {
      const text = canonicalMarkdown(name);
      expect(text, `legal.${name}.md`).not.toMatch(/\bNIT\s*[:.]?\s*\d/i);
      expect(text, `legal.${name}.md`).not.toMatch(/matrícula mercantil\s*[:.]?\s*\d/i);
    }
  });
});

/*
 * La versión del aviso NO es cosmética: `Consent.version` y `Quote.dataConsentVersion` se estampan
 * desde el SiteSetting PRIVACY_POLICY_VERSION. Si el texto cambia y la versión no, la prueba de la
 * autorización apunta a un documento que ya no es el que el titular vio — la trazabilidad que pide
 * la Ley 1581 se rompe en silencio, y justo en el flujo nuevo.
 */
describe("contenido legal — versionado coherente", () => {
  it("los documentos tocados en la Etapa 1 declaran la MISMA versión", () => {
    const versionOf = (name: string) =>
      canonicalMarkdown(name)
        .match(/Versión (\d+) · vigente desde (\d{4}-\d{2}-\d{2})/)
        ?.slice(1, 3);

    const touched = ["terminos", "devoluciones", "garantias", "privacidad", "habeas-data"];
    const versions = touched.map((n) => ({ n, v: versionOf(n) }));

    for (const { n, v } of versions) {
      expect(v, `legal.${n}.md no declara una línea de versión reconocible`).toBeDefined();
    }
    const distinct = new Set(versions.map(({ v }) => v!.join(" · ")));
    expect(
      distinct.size,
      `versiones mezcladas: ${versions.map(({ n, v }) => `${n}=${v!.join("·")}`).join(", ")}`,
    ).toBe(1);
  });

  it("la línea de versión compartida del header coincide con la de los documentos", () => {
    const header = readFileSync(
      join(__dirname, "..", "..", "components", "legal", "legal-page-header.tsx"),
      "utf-8",
    );
    const [, num, date] =
      canonicalMarkdown("terminos").match(/Versión (\d+) · vigente desde (\d{4}-\d{2}-\d{2})/) ??
      [];
    expect(header).toContain(`Última actualización: ${date} · Versión ${num}`);
  });
});

/*
 * Las descripciones de metadata viajan al snippet de Google y vinculan al proveedor (Ley 1480
 * art. 23). Varias páginas definen la suya propia y PISAN la del layout, así que derivar solo la
 * del layout no basta: la home prometía "entrega a 1.100+ destinos" —cobertura del operador
 * logístico, inactiva en la Etapa 1— mucho después de que layout y manifest ya estuvieran
 * corregidos.
 */
describe("metadata — sin promesas logísticas sin encuadrar", () => {
  const PAGES = ["page.tsx", "productos/page.tsx"];

  it.each(PAGES)("app/%s no promete cobertura de envío sin derivar del modo", (rel) => {
    const src = readFileSync(join(__dirname, "..", rel), "utf-8");
    const promisesCoverage = /1\.100\+|1100\+/.test(src);
    if (!promisesCoverage) return; // no menciona cobertura: nada que encuadrar
    expect(
      src.includes("isCatalogMode"),
      `app/${rel} menciona la cobertura logística pero no la deriva del modo de tienda`,
    ).toBe(true);
  });
});
