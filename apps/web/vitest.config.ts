/*
 * Vitest config para unit + integration tests.
 *
 * - Environment "node" por default (rápido, sin DOM). Tests UI con
 *   @testing-library override a "jsdom" via comentario al inicio
 *   del archivo: `// @vitest-environment jsdom`
 * - Path alias `@/` apunta a apps/web (mismo que tsconfig).
 * - Coverage v8 nativo (más rápido y preciso que istanbul).
 * - Tests viven junto al código: `*.test.ts` o `*.spec.ts` cualquier
 *   ubicación dentro de apps/web. NO en /tests/e2e (eso es Playwright).
 */

import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./tests/setup-env.ts"],
    // Retry para flakes TRANSITORIOS de infraestructura: los tests de integración
    // pegan al pooler de Supabase (pgbouncer :6543), que bajo concurrencia
    // ocasionalmente rechaza/cae una conexión ("Can't reach database server").
    // La lógica de los tests es determinista → un retry reconecta y pasa; un bug
    // real falla los 3 intentos. En CI con Postgres local (directo) no aplica.
    retry: 2,
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html"],
      exclude: [
        "**/node_modules/**",
        "**/.next/**",
        "**/*.config.*",
        "**/tests/**",
        // Superficie sin lógica ejecutable útil de cubrir con unit/integration:
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "app/**/{layout,loading,not-found,error,global-error}.tsx",
      ],
      // Gate de regresión (ratchet). Baseline local medido 2026-07-13:
      // lines 79.0% · statements 77.7% · functions 78.1% · branches 69.1%.
      // Los umbrales van con margen BAJO el baseline porque en CI algunos tests que
      // exigen Supabase real (rls-matrix) se saltan → cobertura de CI algo menor que la
      // local. Piso conservador para el primer ratchet; APRETAR estos números una vez
      // el primer run verde de CI revele la cobertura real de ese entorno.
      thresholds: {
        lines: 72,
        statements: 70,
        functions: 70,
        branches: 62,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      // "server-only" lo resuelve Next.js internamente; en vitest node lo
      // aliasamos a un stub no-op para poder testear módulos server-side
      // (stock ledger, wompi env, etc.).
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
});
