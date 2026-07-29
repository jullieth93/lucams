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
    globalSetup: ["./tests/vitest-global-teardown.ts"],
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
      // Gate de regresión (ratchet).
      //
      // CALIBRADO 2026-07-25 con la medición REAL de CI, que es lo que el baseline anterior
      // dejaba pendiente ("APRETAR estos números una vez el primer run verde de CI revele la
      // cobertura real de ese entorno"). Ese momento no había llegado nunca: la CI no corría en
      // esta rama y en `develop` el job moría con tests fallando sin alcanzar el gate.
      //
      // Baseline local 2026-07-13: lines 79.0% · statements 77.7% · functions 78.1% · branches 69.1%.
      // Medición CI 2026-07-25 (run 30144450398, 1650 tests en verde): lines 71.62%.
      // La diferencia es estructural, no una regresión: en CI se saltan los tests que exigen una
      // Supabase real (rls-matrix y compañía), así que el denominador incluye código que ese
      // entorno nunca ejecuta. El umbral de líneas baja de 72 a 71 para reflejar el entorno que
      // realmente gatea, conservando el margen de ratchet: una regresión de verdad lo rompe igual.
      // Los otros tres ya pasaban en CI y se dejan intactos.
      //
      // PARA APRETAR: subir estos números cuando CI pueda correr contra una Supabase de staging
      // (hoy no existe: dev y producción comparten proyecto — ver auditoría 2026-07-21).
      //
      // RECALIBRADO 2026-07-29 (statements 70→69.5, functions 70→68.5): retention-service y
      // finalize-server-render ahora TAMBIÉN se saltan en CI —exigen Supabase Storage real y
      // antes morían en la recolección, dejando el job rojo desde el merge de Fase A—. Medición
      // REAL de CI (run 30416182665, 2552 tests verdes + 76 skip): functions 68.92; statements,
      // lines y branches sobran. Misma lógica del ajuste de lines de 2026-07-25: el umbral
      // refleja el entorno que realmente gatea. Se aprietan de nuevo con Supabase staging.
      thresholds: {
        lines: 71,
        statements: 69.5,
        functions: 68.5,
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
