/*
 * Lighthouse CI — corrida MÓVIL (complemento de lighthouserc.json, que audita desktop).
 *
 * El gate desktop existía solo; la mayoría del tráfico de la tienda es móvil, así
 * que acá se auditan las mismas 2 URLs públicas con la emulación móvil por defecto
 * de Lighthouse (Moto G Power + throttling 4G simulado — NO lleva `preset: desktop`).
 *
 * Umbral de performance en WARN fijado CONSERVADOR en 0.4: no conocemos todavía el
 * baseline móvil real en CI (2026-10-01). RATCHET: una vez medido el baseline real
 * en varias corridas de CI, SUBIR este umbral redondeando hacia abajo (p. ej. si el
 * p50 observado es 0.55 → fijar 0.5). Nunca bajarlo sin documentar el porqué acá.
 *
 * a11y y SEO quedan en ERROR ≥0.9 igual que desktop (deterministas, no dependen
 * del hardware emulado).
 *
 * outputDir distinto (.lighthouseci/mobile) para no pisar los artefactos desktop.
 * Se invoca con `pnpm lhci:mobile` (lhci autorun --config).
 */
module.exports = {
  ci: {
    collect: {
      startServerCommand: "pnpm --filter web start",
      startServerReadyPattern: "Ready|Local:|started server",
      startServerReadyTimeout: 60000,
      url: ["http://localhost:4000/", "http://localhost:4000/productos"],
      numberOfRuns: 1,
      settings: {
        // Sin `preset`: Lighthouse usa su default = emulación móvil.
        chromeFlags: "--no-sandbox --headless=new",
        skipAudits: ["uses-http2"],
      },
    },
    assert: {
      assertions: {
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["warn", { minScore: 0.85 }],
        // WARN conservador — ver nota de ratchet en el header de este archivo.
        "categories:performance": ["warn", { minScore: 0.4 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci/mobile" },
  },
};
