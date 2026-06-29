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
      reporter: ["text", "html"],
      exclude: ["**/node_modules/**", "**/.next/**", "**/*.config.*", "**/tests/**"],
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
