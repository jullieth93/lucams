/*
 * Guarda de regresión del bundle inicial del Estudio 2D (Fase 5 · #19).
 *
 * Recorre el grafo de imports estáticos (runtime, vía AST real de TypeScript —
 * excluyendo `import type` y `next/dynamic(() => import(...))`) a partir de
 * todos los entrypoints del Estudio 2D (`page.tsx`, `studio-editor-loader.tsx`,
 * `studio-editor.tsx`, `letter-set-editor.tsx`, `name-editor.tsx`,
 * `scene-gallery.tsx`) y certifica que NINGUNO arrastre `three`,
 * `@react-three/fiber` ni `@react-three/drei` al chunk inicial.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  CALENDAR_CARD_THICKNESS_CM,
  MAGNET_THICKNESS_CM,
  realWorldDepth,
} from "./lib/magnet-3d-constants";

const WEB_ROOT = path.resolve(__dirname, "../../..");
const ESTUDIO_DIR = __dirname;
const FORBIDDEN_3D_PACKAGES = ["three", "@react-three/fiber", "@react-three/drei"] as const;

function extractRuntimeImports(filePath: string, source: string): string[] {
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    false,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specs: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (!clause) {
        // Side-effect import (`import "three";`) — siempre runtime.
        specs.push(node.moduleSpecifier.text);
      } else if (!clause.isTypeOnly) {
        const hasDefault = Boolean(clause.name);
        const bindings = clause.namedBindings;
        const hasRuntimeNamed =
          bindings &&
          (ts.isNamespaceImport(bindings) ||
            (ts.isNamedImports(bindings) && bindings.elements.some((el) => !el.isTypeOnly)));
        if (hasDefault || hasRuntimeNamed) {
          specs.push(node.moduleSpecifier.text);
        }
      }
    } else if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.exportClause;
      const hasRuntimeExport =
        !clause || ts.isNamespaceExport(clause) || clause.elements.some((el) => !el.isTypeOnly);
      if (hasRuntimeExport) {
        specs.push(node.moduleSpecifier.text);
      }
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      specs.push(node.arguments[0]!.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return specs;
}

function resolveLocalModule(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) {
    base = path.join(WEB_ROOT, spec.slice(2));
  } else if (spec.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else {
    return null;
  }

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function findStatic3DImports(entryFiles: string[]): Array<{ chain: string[]; pkg: string }> {
  const visited = new Set<string>();
  const violations: Array<{ chain: string[]; pkg: string }> = [];

  function walk(filePath: string, chain: string[]) {
    if (visited.has(filePath)) return;
    visited.add(filePath);
    const source = fs.readFileSync(filePath, "utf8");
    const rel = path.relative(WEB_ROOT, filePath);
    const nextChain = [...chain, rel];

    for (const spec of extractRuntimeImports(filePath, source)) {
      if (FORBIDDEN_3D_PACKAGES.some((pkg) => spec === pkg || spec.startsWith(`${pkg}/`))) {
        violations.push({ chain: nextChain, pkg: spec });
        continue;
      }
      const target = resolveLocalModule(filePath, spec);
      if (target) walk(target, nextChain);
    }
  }

  for (const entry of entryFiles) {
    walk(entry, []);
  }
  return violations;
}

describe("Estudio 2D — aislamiento del bundle 3D (Fase 5 · #19)", () => {
  it("los entrypoints del Estudio 2D (incluyendo page.tsx) y SceneGallery no importan estáticamente three/@react-three/*", () => {
    const entries = [
      path.join(ESTUDIO_DIR, "page.tsx"),
      path.join(ESTUDIO_DIR, "studio-editor-loader.tsx"),
      path.join(ESTUDIO_DIR, "studio-editor.tsx"),
      path.join(ESTUDIO_DIR, "letter-set-editor.tsx"),
      path.join(ESTUDIO_DIR, "name-editor.tsx"),
      path.join(ESTUDIO_DIR, "scene-gallery.tsx"),
      path.join(ESTUDIO_DIR, "lib/magnet-3d-constants.ts"),
    ];

    const violations = findStatic3DImports(entries);
    expect(violations).toEqual([]);
  }, 20_000);

  it("lib/magnet-3d-constants funciona puro en Node sin mocks de @react-three/drei", () => {
    expect(CALENDAR_CARD_THICKNESS_CM).toBe(0.04);
    expect(MAGNET_THICKNESS_CM).toBe(0.2);
    expect(realWorldDepth(0.54, CALENDAR_CARD_THICKNESS_CM)).toBeCloseTo(0.0216, 9);
  });
});
