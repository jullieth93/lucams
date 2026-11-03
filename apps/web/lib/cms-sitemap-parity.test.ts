/*
 * Gate de integridad y paridad exacta del CMS v2 (`código ↔ cms-site-map.mjs`).
 *
 * Reemplaza el ratchet legacy `audit-content-coverage.mjs` bajo la arquitectura
 * de 3 capas (ADR-082 actualizado):
 *   1. Toda clave CMS leída en `apps/web` (bloques, settings, imágenes, listas,
 *      banners, FAQs, SEO y claves comerciales de Checkout / Mi Cuenta) DEBE
 *      existir declarada en `packages/db/scripts/cms-site-map.mjs` — garantiza
 *      que un seed limpio (`make migrate-cms-v2` / `nightly-full.yml`) siembre
 *      el 100 % de los campos reales.
 *   2. Ningún campo declarado en `cms-site-map.mjs` puede quedar huérfano sin
 *      consumidor en `apps/web` — impide que `/admin/contenido` muestre campos
 *      muertos que prometen un efecto inexistente.
 *   3. Invariantes estructurales del `SITE_MAP`: slugs/keys únicos, iconos
 *      registrados en `CMS_PAGE_ICONS`, tipos válidos y marca sin apóstrofo.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { CMS_PAGE_ICONS } from "@/app/admin/(panel)/contenido/page-icons";
import { SITE_MAP } from "../../../packages/db/scripts/cms-site-map.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, "..");

/**
 * Única clave legacy de solo lectura conservada por retrocompatibilidad de
 * migración V1→V2 en `features/shipping/settings.ts` (cubierta por
 * `features/shipping/settings.test.ts`). NO se declara en `SITE_MAP` porque no
 * debe aparecer como campo editable en `/admin/contenido`.
 */
const LEGACY_READ_ONLY_KEYS = new Set(["LUCAMS_SHIPPING_LOCALITIES"]);

const VALID_FIELD_KINDS = new Set(["BLOCK", "SETTING"]);
const VALID_FIELD_TYPES = new Set([
  "TEXT",
  "TEXTAREA",
  "MARKDOWN",
  "HTML",
  "JSON",
  "EMAIL",
  "URL",
  "NUMBER",
  "PHONE",
  "COLOR",
  "BOOLEAN",
  "IMAGE",
]);

type SiteMapField = {
  key: string;
  kind: string;
  type: string;
  label: string;
  helpText?: string;
  category: string;
  body: string;
  sortOrder?: number;
  metadata?: unknown;
  defaultListItems?: unknown[];
};

type SiteMapSection = {
  key: string;
  title: string;
  description?: string;
  sortOrder?: number;
  fields?: SiteMapField[];
};

type SiteMapPage = {
  slug: string;
  title: string;
  description?: string;
  path?: string;
  icon?: string;
  sortOrder?: number;
  sections: SiteMapSection[];
};

function walkProductionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "tests") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkProductionFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function unwrapExpression(expr: ts.Expression | undefined): ts.Expression | undefined {
  let current = expr;
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isParenthesizedExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function extractConsumedCmsKeys(): Map<string, Set<string>> {
  const files = walkProductionFiles(WEB_ROOT);

  type FileSymbols = {
    sf: ts.SourceFile;
    localStrings: Map<string, string>;
    localArrays: Map<string, string[]>;
    localObjects: Map<string, Record<string, string>>;
    localArrayOfObjects: Map<string, Record<string, string>[]>;
  };

  const parsedFiles = new Map<string, FileSymbols>();
  const exportedStrings = new Map<string, string>();
  const exportedArrays = new Map<string, string[]>();
  const exportedObjects = new Map<string, Record<string, string>>();

  // Pasada 1: recolectar constantes string, arrays, Sets y mapas de claves.
  for (const file of files) {
    const src = readFileSync(file, "utf-8");
    const sf = ts.createSourceFile(
      file,
      src,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const localStrings = new Map<string, string>();
    const localArrays = new Map<string, string[]>();
    const localObjects = new Map<string, Record<string, string>>();
    const localArrayOfObjects = new Map<string, Record<string, string>[]>();

    const collectSymbols = (node: ts.Node) => {
      if (ts.isVariableStatement(node)) {
        const isExported =
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
        for (const decl of node.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
          const name = decl.name.text;
          const init = unwrapExpression(decl.initializer);
          if (!init) continue;

          if (ts.isStringLiteralLike(init)) {
            localStrings.set(name, init.text);
            if (isExported) exportedStrings.set(name, init.text);
          } else if (ts.isObjectLiteralExpression(init)) {
            const record: Record<string, string> = {};
            for (const prop of init.properties) {
              if (ts.isPropertyAssignment(prop)) {
                const propKey =
                  ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name)
                    ? prop.name.text
                    : null;
                const val = unwrapExpression(prop.initializer);
                if (propKey && val && ts.isStringLiteralLike(val)) {
                  record[propKey] = val.text;
                }
              }
            }
            if (Object.keys(record).length > 0) {
              localObjects.set(name, record);
              if (isExported) exportedObjects.set(name, record);
            }
          } else if (ts.isArrayLiteralExpression(init)) {
            const strings: string[] = [];
            const objects: Record<string, string>[] = [];
            for (const element of init.elements) {
              const unwrapped = unwrapExpression(element);
              if (!unwrapped) continue;
              if (ts.isStringLiteralLike(unwrapped)) {
                strings.push(unwrapped.text);
              } else if (ts.isObjectLiteralExpression(unwrapped)) {
                const obj: Record<string, string> = {};
                for (const prop of unwrapped.properties) {
                  if (ts.isPropertyAssignment(prop)) {
                    const propKey =
                      ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name)
                        ? prop.name.text
                        : null;
                    const val = unwrapExpression(prop.initializer);
                    if (propKey && val && ts.isStringLiteralLike(val)) {
                      obj[propKey] = val.text;
                    }
                  }
                }
                if (Object.keys(obj).length > 0) objects.push(obj);
              }
            }
            if (strings.length > 0) {
              localArrays.set(name, strings);
              if (isExported) exportedArrays.set(name, strings);
            }
            if (objects.length > 0) {
              localArrayOfObjects.set(name, objects);
            }
          } else if (
            ts.isNewExpression(init) &&
            ts.isIdentifier(init.expression) &&
            init.expression.text === "Set" &&
            init.arguments?.[0]
          ) {
            const arg0 = unwrapExpression(init.arguments[0]);
            if (arg0 && ts.isArrayLiteralExpression(arg0)) {
              const strings = arg0.elements
                .map((el) => unwrapExpression(el))
                .filter((el): el is ts.StringLiteralLike => !!el && ts.isStringLiteralLike(el))
                .map((el) => el.text);
              if (strings.length > 0) {
                localArrays.set(name, strings);
                if (isExported) exportedArrays.set(name, strings);
              }
            }
          }
        }
      }
      ts.forEachChild(node, collectSymbols);
    };

    collectSymbols(sf);
    parsedFiles.set(file, { sf, localStrings, localArrays, localObjects, localArrayOfObjects });
  }

  // Pasada 2: extraer todas las lecturas de claves CMS en funciones y JSX.
  const keys = new Map<string, Set<string>>();
  const addKey = (key: string, file: string) => {
    if (!key) return;
    const rel = path.relative(WEB_ROOT, file);
    let set = keys.get(key);
    if (!set) {
      set = new Set<string>();
      keys.set(key, set);
    }
    set.add(rel);
  };

  const DIRECT_KEY_CALLS = new Set([
    "getCmsBlock",
    "getSiteSetting",
    "getSettingValue",
    "getCmsList",
    "getCmsImage",
    "getPageSeo",
    "cmsMenuText",
    "cmsAccountText",
    "CodAwareCmsText",
  ]);
  const ARRAY_KEY_CALLS = new Set(["getCmsBlocksByKeys", "getSettingsMap"]);
  const JSX_KEY_COMPONENTS = new Map<string, string>([
    ["CmsText", "blockKey"],
    ["CmsMarkdown", "blockKey"],
    ["CmsSetting", "settingKey"],
    ["LegalPageHeader", "blockKey"],
    ["CodAwareCmsText", "blockKey"],
  ]);

  for (const [file, info] of parsedFiles) {
    const { sf, localStrings, localArrays, localObjects, localArrayOfObjects } = info;
    const rel = path.relative(WEB_ROOT, file).replace(/\\/g, "/");

    const resolveStrings = (rawExpr: ts.Expression | undefined): string[] => {
      const expr = unwrapExpression(rawExpr);
      if (!expr) return [];
      if (ts.isStringLiteralLike(expr)) return [expr.text];
      if (ts.isIdentifier(expr)) {
        const s = localStrings.get(expr.text) ?? exportedStrings.get(expr.text);
        if (s) return [s];
        const arr = localArrays.get(expr.text) ?? exportedArrays.get(expr.text);
        if (arr) return arr;
        const obj = localObjects.get(expr.text) ?? exportedObjects.get(expr.text);
        if (obj) return Object.values(obj);
      }
      if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
        const base = expr.expression.text;
        const prop = expr.name.text;
        const obj = localObjects.get(base) ?? exportedObjects.get(base);
        if (obj?.[prop]) return [obj[prop]];
        for (const [, list] of localArrayOfObjects) {
          const matched = list.map((item) => item[prop]).filter((v): v is string => Boolean(v));
          if (matched.length > 0) return matched;
        }
      }
      if (ts.isElementAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
        const obj =
          localObjects.get(expr.expression.text) ?? exportedObjects.get(expr.expression.text);
        if (obj) return Object.values(obj);
      }
      if (
        ts.isCallExpression(expr) &&
        ts.isPropertyAccessExpression(expr.expression) &&
        ts.isIdentifier(expr.expression.expression) &&
        expr.expression.expression.text === "Object" &&
        expr.expression.name.text === "values" &&
        expr.arguments.length === 1
      ) {
        return resolveStrings(expr.arguments[0]);
      }
      if (ts.isArrayLiteralExpression(expr)) {
        return expr.elements.flatMap((el) => resolveStrings(el));
      }
      return [];
    };

    if (rel === "app/api/cms/settings/route.ts") {
      const pubKeys = localArrays.get("PUBLIC_SETTING_KEYS") ?? [];
      for (const k of pubKeys) addKey(k, file);
    }

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const fn = node.expression.text;
        if ((DIRECT_KEY_CALLS.has(fn) || ARRAY_KEY_CALLS.has(fn)) && node.arguments.length >= 1) {
          for (const k of resolveStrings(node.arguments[0])) addKey(k, file);
        } else if (fn === "getCmsBanners") {
          if (node.arguments.length >= 1) {
            for (const k of resolveStrings(node.arguments[0])) addKey(k, file);
          } else {
            addKey("home.banners", file);
          }
        }
      }

      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = ts.isIdentifier(node.tagName) ? node.tagName.text : null;
        const propName = tag ? JSX_KEY_COMPONENTS.get(tag) : null;
        if (propName) {
          for (const attr of node.attributes.properties) {
            if (
              ts.isJsxAttribute(attr) &&
              ts.isIdentifier(attr.name) &&
              attr.name.text === propName &&
              attr.initializer
            ) {
              if (ts.isStringLiteral(attr.initializer)) {
                addKey(attr.initializer.text, file);
              } else if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
                for (const k of resolveStrings(attr.initializer.expression)) addKey(k, file);
              }
            }
          }
        }
      }

      // Catálogo de FAQs en /ayuda (`getCmsBlocksByCategory("FAQ")`).
      if (
        rel === "app/ayuda/page.tsx" &&
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "slug" &&
        ts.isStringLiteralLike(node.initializer)
      ) {
        addKey(`faq.${node.initializer.text}`, file);
      }

      // Diccionarios comerciales parciales (`CHECKOUT_TEXT_KEYS` y `ACCOUNT_TEXT_KEYS`).
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "Object" &&
        node.expression.name.text === "entries" &&
        node.arguments.length === 1
      ) {
        const arg = unwrapExpression(node.arguments[0]);
        if (
          arg &&
          ts.isIdentifier(arg) &&
          (arg.text === "CHECKOUT_TEXT_KEYS" || arg.text === "ACCOUNT_TEXT_KEYS")
        ) {
          const obj = localObjects.get(arg.text) ?? exportedObjects.get(arg.text);
          if (obj) {
            for (const k of Object.values(obj)) addKey(k, file);
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sf);
  }

  return keys;
}

describe("CMS v2 — paridad exacta entre apps/web y cms-site-map.mjs", () => {
  const pages = (SITE_MAP as { pages: SiteMapPage[] }).pages;
  const allFields = pages.flatMap((p) =>
    p.sections.flatMap((s) =>
      (s.fields ?? []).map((f) => ({ pageSlug: p.slug, sectionKey: s.key, ...f })),
    ),
  );
  const siteMapKeys = new Set(allFields.map((f) => f.key));
  const consumedKeysMap = extractConsumedCmsKeys();

  it("toda clave CMS consumida en apps/web está declarada en cms-site-map.mjs", () => {
    const missingInSiteMap: string[] = [];
    for (const [key, files] of consumedKeysMap) {
      if (LEGACY_READ_ONLY_KEYS.has(key)) continue;
      if (!siteMapKeys.has(key)) {
        missingInSiteMap.push(`${key} (leída en: ${[...files].join(", ")})`);
      }
    }
    expect(missingInSiteMap.sort()).toEqual([]);
  });

  it("ningún campo declarado en cms-site-map.mjs queda huérfano sin lector en apps/web", () => {
    const orphanInSiteMap = allFields
      .filter((f) => !consumedKeysMap.has(f.key))
      .map((f) => `${f.key} (${f.pageSlug}/${f.sectionKey})`);
    expect(orphanInSiteMap.sort()).toEqual([]);
  });

  it("estructura de SITE_MAP válida: slugs/keys únicos, iconos registrados y marca limpia", () => {
    const pageSlugs = new Set<string>();
    const fieldKeys = new Set<string>();

    for (const page of pages) {
      expect(pageSlugs.has(page.slug), `slug de página duplicado: ${page.slug}`).toBe(false);
      pageSlugs.add(page.slug);
      expect(page.title.trim().length).toBeGreaterThan(0);
      if (page.icon) {
        expect(
          Object.prototype.hasOwnProperty.call(CMS_PAGE_ICONS, page.icon),
          `icono "${page.icon}" de página "${page.slug}" no existe en CMS_PAGE_ICONS`,
        ).toBe(true);
      }

      const sectionKeys = new Set<string>();
      for (const section of page.sections) {
        expect(sectionKeys.has(section.key), `sección duplicada ${page.slug}/${section.key}`).toBe(
          false,
        );
        sectionKeys.add(section.key);
        expect(
          (section.fields ?? []).length,
          `sección vacía ${page.slug}/${section.key}`,
        ).toBeGreaterThan(0);

        for (const field of section.fields ?? []) {
          expect(fieldKeys.has(field.key), `campo CMS duplicado: ${field.key}`).toBe(false);
          fieldKeys.add(field.key);
          expect(VALID_FIELD_KINDS.has(field.kind), `kind inválido en ${field.key}`).toBe(true);
          expect(VALID_FIELD_TYPES.has(field.type), `type inválido en ${field.key}`).toBe(true);
          expect(field.label.trim().length, `label vacío en ${field.key}`).toBeGreaterThan(0);
          expect(field.category.trim().length, `category vacía en ${field.key}`).toBeGreaterThan(0);
          expect(typeof field.body).toBe("string");

          // Higiene de marca: prohibido "Lucam's" o "Lucams_shop" en copy/labels.
          expect(field.label).not.toMatch(/Lucam['’]s|Lucams_shop/i);
          if (field.helpText) {
            expect(field.helpText).not.toMatch(/Lucam['’]s|Lucams_shop/i);
          }
          if (field.type !== "URL") {
            expect(field.body).not.toMatch(/Lucam['’]s|Lucams_shop/i);
          }
        }
      }
    }

    expect(pages.length).toBe(9);
    expect(fieldKeys.size).toBe(166);
  });
});
