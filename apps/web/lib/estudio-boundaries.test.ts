/*
 * Guarda arquitectónica de fronteras de `/estudio` (Fase 5 · #19).
 *
 * Usa el AST real de TypeScript para verificar que ningún módulo fuera de
 * `apps/web/app/estudio/` (salvo las páginas de banco de pruebas interno
 * `apps/web/app/internal/`) importe, re-exporte, cargue dinámicamente o
 * mockee módulos internos desde `apps/web/app/estudio/**`.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const WEB_ROOT = path.resolve(__dirname, "..");
const ESTUDIO_ROOT = path.join(WEB_ROOT, "app", "estudio");
const ROOTS = ["app", "components", "features", "lib"] as const;

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, acc);
    } else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function pointsInsideEstudio(fromFile: string, specifier: string): boolean {
  if (specifier.startsWith("@/app/estudio/") || specifier === "@/app/estudio") return true;
  if (specifier.startsWith(".")) {
    const resolved = path.resolve(path.dirname(fromFile), specifier);
    return resolved === ESTUDIO_ROOT || resolved.startsWith(`${ESTUDIO_ROOT}${path.sep}`);
  }
  return false;
}

function extractModuleSpecifiers(filePath: string, source: string): string[] {
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    false,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specs: string[] = [];

  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specs.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length >= 1 &&
        ts.isStringLiteral(node.arguments[0]!)
      ) {
        specs.push(node.arguments[0]!.text);
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "vi" &&
        node.expression.name.text === "mock" &&
        node.arguments.length >= 1 &&
        ts.isStringLiteral(node.arguments[0]!)
      ) {
        specs.push(node.arguments[0]!.text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return specs;
}

describe("Fronteras de módulos — aislamiento de app/estudio/ (Fase 5 · #19)", () => {
  it("ningún archivo fuera de app/estudio/ ni app/internal/ importa módulos internos de app/estudio/", () => {
    const violations: Array<{ file: string; specifier: string }> = [];

    for (const root of ROOTS) {
      const files = walkTsFiles(path.join(WEB_ROOT, root));
      for (const file of files) {
        const rel = path.relative(WEB_ROOT, file).replace(/\\/g, "/");
        if (rel.startsWith("app/estudio/") || rel.startsWith("app/internal/")) continue;

        const src = fs.readFileSync(file, "utf8");
        for (const specifier of extractModuleSpecifiers(file, src)) {
          if (pointsInsideEstudio(file, specifier)) {
            violations.push({ file: rel, specifier });
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
