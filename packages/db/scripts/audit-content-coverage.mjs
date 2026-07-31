/*
 * Auditoría de cobertura de contenido (roadmap D1 — anti-regresión).
 *
 * Escanea el JSX del STOREFRONT (apps/web/app + apps/web/components, excl.
 * admin/api/internal/ui/tests) buscando LITERALES EN ESPAÑOL VISIBLES que NO
 * pasen por el CMS. Un literal cuenta como CUBIERTO si es:
 *   - el `fallback` de <CmsText>/<CmsMarkdown>/<CmsSetting>,
 *   - argumento de un resolvedor CMS (getSettingValue, getCmsList, getCmsBanners,
 *     getCmsImage, getStudioTexts, getPageSeo, fillStudioText, splitStudioText),
 *   - o vive en un archivo studio-texts* (defaults del Estudio = fallback, B1).
 * Todo lo demás (texto JSX, placeholder/title/aria-label/alt) es NO cubierto.
 *
 * La detección es AST (TypeScript compiler API), no regex: solo cuentan
 * strings que de verdad se renderizan en JSX.
 *
 * Uso:
 *   node packages/db/scripts/audit-content-coverage.mjs            → reporte (tabla por área + % global)
 *   node packages/db/scripts/audit-content-coverage.mjs --check    → gate: falla si hay literales NO
 *                                                                    cubiertos que no estén en el
 *                                                                    baseline, o si el % global baja
 *                                                                    del umbral registrado
 *   node packages/db/scripts/audit-content-coverage.mjs --write-baseline → regenera el baseline
 *                                                                    (deliberado: nuevos literales
 *                                                                    hardcodeados legítimos se fijan
 *                                                                    commiteando el baseline)
 *
 * Baseline: packages/db/scripts/content-coverage-baseline.json (ratchet —
 * puede mejorar [menos literales no cubiertos] pero nunca empeorar sin que
 * alguien lo regenere a propósito). El fingerprint es `archivo :: texto`
 * (multiconjunto: cuenta duplicados) — SIN número de línea a propósito:
 * con línea, cualquier edición que desplace código encima de un literal ya
 * fijado lo marcaba como "nuevo" (falso positivo real detectado en CI el
 * 2026-07-31 tras un fix de una línea en back-in-stock-button.tsx).
 *
 * Alcance deliberado (documentado): copy visible en JSX. NO cubre metadata
 * SEO estática ni strings de .ts (mensajes de error de services/actions) —
 * la mayoría de páginas ya usa getPageSeo; extender el scanner es fácil si
 * se decide cerrar ese hueco.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const WEB = path.join(ROOT, "apps/web");
const BASELINE_PATH = path.join(ROOT, "packages/db/scripts/content-coverage-baseline.json");

const SCOPE_DIRS = [path.join(WEB, "app"), path.join(WEB, "components")];

/** Rutas excluidas (no son storefront visible o son infraestructura genérica). */
const EXCLUDE_SEGMENTS = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}.next${path.sep}`,
  `${path.sep}app${path.sep}admin${path.sep}`,
  `${path.sep}app${path.sep}api${path.sep}`,
  `${path.sep}app${path.sep}internal${path.sep}`,
  `${path.sep}components${path.sep}admin${path.sep}`,
  `${path.sep}components${path.sep}ui${path.sep}`,
];
const EXCLUDE_FILES = new Set(
  ["admin-page.tsx", "admin-shell.tsx", "admin-submit-button.tsx"].map((f) =>
    path.join(WEB, "components", f),
  ),
);

/** Componentes CMS cuyo atributo `fallback` es cobertura por definición. */
const CMS_COMPONENTS = new Set(["CmsText", "CmsMarkdown", "CmsSetting"]);

/** Resolvedores CMS: los strings pasados como argumentos son fallbacks. */
const CMS_CALLEES = new Set([
  "getSettingValue",
  "getSiteSetting",
  "getCmsList",
  "getCmsBanners",
  "getCmsImage",
  "getStudioTexts",
  "getPageSeo",
  "fillStudioText",
  "splitStudioText",
]);

/** Atributos JSX audibles/visibles que cuentan como copy (a11y = contenido, B1). */
const VISIBLE_ATTRS = new Set(["placeholder", "title", "aria-label", "alt"]);

const SPANISH_CHAR = /[áéíóúñü¿¡]/i;
const STOPWORDS = new Set(
  `el la los las un una unos unas de del al y o u en con por para que tu tus su sus mi mis
   es son ser está están este esta estos estas esto como más muy ya sí no se lo le les te nos me
   eso aquí ahí sin sobre hasta desde porque pero también solo cada donde cuando quien
   qué cuál cuáles quién quiénes cuánto cuántos hay día días mes año hora`.split(/\s+/),
);
const UI_WORDS = new Set(
  `guardar buscar cerrar volver editar eliminar publicar despublicar programar duplicar mover
   catálogo inicio carrito pedido pedidos ayuda contacto cargando nombre correo teléfono dirección
   ciudad fecha precio total subtotal cantidad agregar añadir quitar continuar finalizar confirmar
   cancelar aceptar rechazar siguiente anterior enviar recibir ver nuevo nueva gratis oferta ofertas
   reseñas opiniones favoritos destacados categorías productos cuenta perfil sesión contraseña
   buscador filtros ordenar compartir descargar subir elegir seleccionar personalizar cotizar
   rastrear devoluciones garantías privacidad términos cookies vendidos agotado disponible envío
   entrega pago pagos seguro segura bienvenida gracias felicidades listo hecho error aviso nota`.split(
    /\s+/,
  ),
);

// ─────────────────── Recolección de archivos ───────────────────

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.tsx$/.test(entry.name) && !/\.(test|spec|d)\.tsx$/.test(entry.name)) {
      yield full;
    }
  }
}

function inScope(file) {
  if (EXCLUDE_FILES.has(file)) return false;
  return !EXCLUDE_SEGMENTS.some((seg) => file.includes(seg));
}

// ─────────────────── Clasificación de literales ───────────────────

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

/** ¿El string parece copy en español visible para el usuario? */
function isSpanishVisible(raw) {
  const text = normalize(raw);
  if (text.length < 2 || !/[a-záéíóúñ]/i.test(text)) return false;
  if (/^(https?:|mailto:|tel:|\/|#|\{)/.test(text)) return false; // rutas/URLs/expresiones
  if (SPANISH_CHAR.test(text)) return true;
  const words = text
    .toLowerCase()
    .split(/[^a-záéíóúñü]+/i)
    .filter(Boolean);
  if (words.length === 0) return false;
  // Un solo token con punto/guion bajo o en MAYÚSCULAS = identificador técnico.
  if (words.length === 1) {
    const w = words[0];
    if (/^[A-Z0-9_]+$/.test(text.trim())) return false;
    if (/^[a-z0-9]+([._-][a-z0-9]+)+$/.test(text.trim())) return false;
    return w.length >= 3 && UI_WORDS.has(w);
  }
  return words.some((w) => STOPWORDS.has(w));
}

/** ¿El nodo es argumento de una llamada a un resolvedor CMS? */
function isInsideCmsCall(node) {
  let cur = node.parent;
  while (cur) {
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : null;
      if (name && CMS_CALLEES.has(name)) return true;
    }
    node = cur;
    cur = cur.parent;
  }
  return false;
}

/** Tag del elemento JSX dueño de un atributo (opening o self-closing). */
function ownerTagName(attr) {
  const opening = attr.parent?.parent;
  if (opening && ts.isJsxOpeningLikeElement(opening) && ts.isIdentifier(opening.tagName)) {
    return opening.tagName.text;
  }
  return null;
}

/** ¿Literal cubierto por el CMS (fallback de componente o de resolvedor)? */
function isCovered(node, attrName, file) {
  if (file.includes("studio-texts")) return true; // defaults del Estudio (B1)
  if (attrName === "fallback") {
    const tag = ownerTagName(node.parent);
    if (tag && CMS_COMPONENTS.has(tag)) return true;
  }
  return isInsideCmsCall(node);
}

// ─────────────────── Scan de un archivo ───────────────────

function scanFile(file) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found = []; // { line, text, covered }

  const push = (node, raw, attrName) => {
    const text = normalize(raw);
    if (!isSpanishVisible(text)) return;
    const { line } = ts.getLineAndCharacterOfPosition(source, node.getStart(source));
    found.push({ line: line + 1, text, covered: isCovered(node, attrName ?? null, file) });
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      push(node, node.getText(source), null);
    } else if (ts.isJsxAttribute(node)) {
      const attrName = node.name.text;
      const init = node.initializer;
      if (init) {
        if (VISIBLE_ATTRS.has(attrName) || attrName === "fallback") {
          if (ts.isStringLiteral(init)) push(init, init.text, attrName);
          else if (
            ts.isJsxExpression(init) &&
            init.expression &&
            (ts.isStringLiteral(init.expression) ||
              ts.isNoSubstitutionTemplateLiteral(init.expression))
          ) {
            push(init.expression, init.expression.text, attrName);
          }
        }
      }
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      // Strings dentro de llamadas resolvedoras (fallbacks .ts server-side,
      // ej. getSettingValue("KEY", "texto") en page.tsx).
      if (ts.isCallExpression(node.parent) && isInsideCmsCall(node)) {
        push(node, node.text, null);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

// ─────────────────── Reporte ───────────────────

function areaOf(file) {
  const rel = path.relative(WEB, file);
  const parts = rel.split(path.sep);
  if (parts[0] === "app") return parts.length > 2 ? `app/${parts[1]}` : "app/(raíz)";
  return parts.length > 2 ? `components/${parts[1]}` : "components/(raíz)";
}

/** Identidad de un literal para el ratchet: archivo + texto (sin línea — ver cabecera). */
function fingerprint(item) {
  return `${item.file} :: ${item.text}`;
}

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const WRITE_BASELINE = args.includes("--write-baseline");

const results = new Map(); // area → { covered, uncovered, items: [] }
for (const dir of SCOPE_DIRS) {
  for (const file of walk(dir)) {
    if (!inScope(file)) continue;
    const rel = path.relative(ROOT, file);
    for (const item of scanFile(file)) {
      const area = areaOf(file);
      if (!results.has(area)) results.set(area, { covered: 0, uncovered: 0, items: [] });
      const bucket = results.get(area);
      if (item.covered) bucket.covered += 1;
      else {
        bucket.uncovered += 1;
        bucket.items.push({ file: rel, line: item.line, text: item.text });
      }
    }
  }
}

const areas = [...results.entries()].sort(([a], [b]) => a.localeCompare(b));
let totalCovered = 0;
let totalUncovered = 0;
const uncoveredAll = [];

console.log("\n=== Cobertura de contenido CMS (D1) ===\n");
for (const [area, { covered, uncovered, items }] of areas) {
  const total = covered + uncovered;
  const pct = total === 0 ? 100 : (covered / total) * 100;
  totalCovered += covered;
  totalUncovered += uncovered;
  uncoveredAll.push(...items);
  console.log(
    `${area.padEnd(38)} ${String(covered).padStart(4)} cubiertos · ${String(uncovered).padStart(3)} sin cubrir · ${pct.toFixed(1)}%`,
  );
}
const grandTotal = totalCovered + totalUncovered;
const globalPct = grandTotal === 0 ? 100 : (totalCovered / grandTotal) * 100;
console.log(
  `\nGLOBAL: ${totalCovered}/${grandTotal} literales cubiertos por el CMS = ${globalPct.toFixed(2)}%`,
);

if (uncoveredAll.length > 0 && !CHECK) {
  console.log(`\n— ${uncoveredAll.length} literales SIN cubrir (primeros 60) —`);
  for (const item of uncoveredAll.slice(0, 60)) {
    console.log(`  ${item.file}:${item.line} :: ${item.text.slice(0, 90)}`);
  }
  if (uncoveredAll.length > 60) console.log(`  … y ${uncoveredAll.length - 60} más`);
}

// ─────────────────── Baseline / gate ───────────────────

if (WRITE_BASELINE) {
  const baseline = {
    generatedAt: new Date().toISOString(),
    threshold: Math.floor(globalPct * 100) / 100,
    uncovered: uncoveredAll.map((i) => fingerprint(i)),
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`\nBaseline escrito en ${path.relative(ROOT, BASELINE_PATH)}`);
  console.log(
    `Umbral registrado: ${baseline.threshold}% · ${uncoveredAll.length} sin cubrir fijados.`,
  );
  process.exit(0);
}

if (CHECK) {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`\nERROR: no existe el baseline (${path.relative(ROOT, BASELINE_PATH)}).`);
    console.error(
      "Generalo con: node packages/db/scripts/audit-content-coverage.mjs --write-baseline",
    );
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  // Multiconjunto: cada literal conocido "gasta" una ocurrencia del baseline —
  // un texto que aparece N veces sin cubrir necesita N entradas fijadas.
  const remaining = new Map();
  for (const fp of baseline.uncovered) remaining.set(fp, (remaining.get(fp) ?? 0) + 1);
  const newViolations = [];
  for (const item of uncoveredAll) {
    const fp = fingerprint(item);
    const left = remaining.get(fp) ?? 0;
    if (left > 0) remaining.set(fp, left - 1);
    else newViolations.push(`${item.file}:${item.line} :: ${item.text}`);
  }

  let failed = false;
  if (globalPct < baseline.threshold) {
    console.error(
      `\nERROR (ratchet): cobertura global ${globalPct.toFixed(2)}% < umbral ${baseline.threshold}%.`,
    );
    failed = true;
  }
  if (newViolations.length > 0) {
    console.error(
      `\nERROR (ratchet): ${newViolations.length} literal(es) NUEVO(S) en español fuera del CMS:`,
    );
    for (const v of newViolations.slice(0, 40)) console.error(`  + ${v}`);
    if (newViolations.length > 40) console.error(`  … y ${newViolations.length - 40} más`);
    console.error(
      "\nPásalos por el CMS (CmsText/getSettingValue/site map) o, si son hardcode legítimo, regenera el baseline con --write-baseline y commitea el cambio.",
    );
    failed = true;
  }
  if (failed) process.exit(1);
  console.log(
    `\nOK (ratchet): cobertura ${globalPct.toFixed(2)}% ≥ ${baseline.threshold}% y 0 literales nuevos sin cubrir.`,
  );
}
