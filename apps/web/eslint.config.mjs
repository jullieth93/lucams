import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefactos de trabajo locales (gitignored): scripts de verificación
    // manual, evidencia E2E, etc. No son código del repo.
    "tmp/**",
  ]),
  // Honrar convención de underscore-prefix para args/vars no usados
  // (Lucy 2026-05-21: objetivo 0 warnings en producción).
  // Stubs como `_params`, `_headers`, `_rawBody` en interfaces que aún
  // no implementan todos los métodos quedan documentados con `_` sin
  // ruido en lint.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  // Anti-regresión IP-spoofing (plan de producción · P1): leer el token izquierdo
  // crudo de x-forwarded-for / x-real-ip es spoofeable y envenena evidencia legal
  // (consentimiento Ley 1581) y forense (admin-audit). La única fuente permitida es
  // getClientIp() de lib/client-ip.ts, que ya prioriza x-vercel-forwarded-for.
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["lib/client-ip.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='get'][arguments.0.value=/^(x-forwarded-for|x-real-ip|x-vercel-forwarded-for)$/i]",
          message:
            "No leas x-forwarded-for / x-real-ip crudos (spoofeables): usa getClientIp(headers) de @/lib/client-ip.",
        },
      ],
    },
  },
  // Anti-import-directo de sharp (auditoría 2026-08-24, F-4): sharp@0.34.4 está
  // clavado por ERR_DLOPEN_FAILED en lambdas de Vercel y su GHSA-f88m-g3jw-g9cj
  // quedó mitigada SOLO porque todo el código de runtime pasa por
  // features/personalization/sharp-safe.ts (bloquea los loaders GIF/TIFF/VIPS).
  // Un import directo nuevo saltaría ese bloqueo → prohibido. Exentos:
  // sharp-safe.ts (la puerta única) y los tests/specs (corren en CI/local,
  // nunca en una lambda de prod ni procesan input no confiable en runtime).
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["features/personalization/sharp-safe.ts", "**/*.test.ts", "tests/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "sharp",
              message:
                "Importa sharp desde @/features/personalization/sharp-safe (bloquea los loaders vulnerables de libvips), nunca desde 'sharp' directo.",
            },
          ],
        },
      ],
    },
  },
  // Playwright fixtures: el callback `use(...)` de test.extend dispara un falso
  // positivo de react-hooks/rules-of-hooks (no es React). Solo en tests E2E.
  {
    files: ["tests/e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
]);

export default eslintConfig;
