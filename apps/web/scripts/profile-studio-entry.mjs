#!/usr/bin/env node
/*
 * profile-studio-entry — harness de laboratorio del rendimiento de ENTRADA al
 * Estudio (/estudio/<slug>), metodología ADR-166.
 *
 * Qué mide (el síntoma real: trabajo de hilo principal que calienta el celular,
 * NO peso de red/imágenes):
 *   - jsMs:        segundos de JS del renderer (métrica `ScriptDuration` del
 *                  dominio Performance de CDP) desde la navegación hasta que el
 *                  estudio está montado y el hilo principal queda en reposo.
 *   - longtasks:   conteo y ms totales de longtasks (>50 ms) vía
 *                  PerformanceObserver inyectado antes de cualquier script.
 *   - hotspots:    top de funciones por self-time (Profiler de muestreo CDP)
 *                  para el análisis estructural cuando un producto se desvía.
 *
 * Condiciones (idénticas a ADR-166): Chromium, 390×844 dpr 3 (móvil), CPU ×6
 * (Emulation.setCPUThrottlingRate), contexto frío por corrida (sin caché).
 *
 * Control: set-fotoimanes-cuadrados (referencia ADR-166 ≈ 7.3 s JS / 13
 * longtasks). Umbral de alerta: +30 % de jsMs vs el control o longtasks
 * anómalos → causa estructural a corregir (sin parches por producto).
 *
 * Uso (con `next start` de un BUILD DE PRODUCCIÓN sirviendo en :4000 — ver
 * header de scripts/db-local-setup.sh / Makefile para levantar el entorno):
 *
 *   pnpm --filter web build
 *   cd apps/web && set -a && source ../../.env.local && set +a && pnpm exec next start -p 4000 &
 *   pnpm --filter web exec node scripts/profile-studio-entry.mjs
 *
 * Opciones:
 *   --base-url <url>   default http://localhost:4000
 *   --slugs <a,b,c>    subset de slugs (default: todos los de PRODUCTS)
 *   --runs <n>         corridas por slug, se reporta la mediana (default 3)
 *   --out <path>       JSON de salida (default tmp/studio-perf-<timestamp>.json
 *                      del repo — tmp/ es scratch gitignored)
 */

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CONTROL_SLUG = "set-fotoimanes-cuadrados";
const ALERT_THRESHOLD = 1.3; // +30 % vs control (ADR-166)

// Superficie "photo" = StudioEditor Konva (readiness: primer <canvas> del
// Stage). "letterset" = LetterSetEditor (readiness: sección de colores).
const PRODUCTS = [
  { slug: "set-fotoimanes-cuadrados", surface: "photo" },
  { slug: "set-fotoimanes-polaroid", surface: "photo" },
  { slug: "tiras-magneticas-fotos", surface: "photo" },
  { slug: "separadores-magneticos", surface: "photo" },
  { slug: "separadores-alargados", surface: "photo" },
  { slug: "cuadro-3-fotos", surface: "photo" },
  { slug: "calendario-mes-a-mes-fotos", surface: "photo" },
  { slug: "calendario-foto-hero-planner", surface: "photo" },
  { slug: "planner-mensual-con-foto", surface: "photo" },
  { slug: "box-para-pareja", surface: "photo" },
  { slug: "box-dia-papa", surface: "photo" },
  { slug: "abecedario-completo", surface: "letterset" },
  { slug: "pack-vocales", surface: "letterset" },
];

const READY_SELECTOR = {
  photo: "canvas",
  letterset: 'section[aria-label^="Elige los colores"]',
};

const LONGTASK_INIT = () => {
  window.__lucamsLongtasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__lucamsLongtasks.push({ startTime: e.startTime, duration: e.duration });
      }
    }).observe({ entryTypes: ["longtask"] });
  } catch {
    /* navegador sin soporte de longtask: queda [] */
  }
};

function parseArgs(argv) {
  const args = { baseUrl: "http://localhost:4000", slugs: null, runs: 3, out: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base-url") args.baseUrl = argv[++i];
    else if (a === "--slugs") args.slugs = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--runs") args.runs = Math.max(1, Number(argv[++i]) || 3);
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log("profile-studio-entry [--base-url url] [--slugs a,b,c] [--runs n] [--out path]");
      process.exit(0);
    } else {
      console.error(`arg desconocido: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function measureOnce(baseUrl, product) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(LONGTASK_INIT);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    await cdp.send("Performance.enable");
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
    await cdp.send("Profiler.start");

    const t0 = Date.now();
    await page.goto(`${baseUrl}/estudio/${product.slug}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    // Readiness: el editor es dynamic(ssr:false); el lienzo monta vía JS.
    await page.waitForSelector(READY_SELECTOR[product.surface], { timeout: 60_000 });
    // Reposo del hilo principal: 1.5 s sin longtasks tras el readiness
    // (absorbe el trabajo diferido post-mount: cacheo de capas, sombras, etc.).
    for (;;) {
      const quiet = await page.evaluate((settleMs) => {
        const lts = window.__lucamsLongtasks;
        const lastEnd = lts.length ? lts[lts.length - 1].startTime + lts[lts.length - 1].duration : 0;
        return performance.now() - lastEnd >= settleMs;
      }, 1500);
      if (quiet || Date.now() - t0 > 90_000) break;
      await page.waitForTimeout(250);
    }

    const [{ metrics }, { profile }, longtasks] = await Promise.all([
      cdp.send("Performance.getMetrics"),
      cdp.send("Profiler.stop"),
      page.evaluate(() => window.__lucamsLongtasks),
    ]);
    const metric = (name) => metrics.find((m) => m.name === name)?.value ?? 0;

    // Self-time por función desde el perfil de muestreo.
    const selfByNode = new Map();
    if (profile.samples?.length) {
      profile.samples.forEach((nodeId, i) => {
        selfByNode.set(nodeId, (selfByNode.get(nodeId) ?? 0) + (profile.timeDeltas[i] ?? 0));
      });
    }
    const byFunc = new Map();
    for (const node of profile.nodes ?? []) {
      const selfUs = selfByNode.get(node.id) ?? 0;
      if (!selfUs) continue;
      const cf = node.callFrame;
      const file = (cf.url || "").split("/").slice(-2).join("/");
      const key = `${cf.functionName || "(anónimo)"} @ ${file}:${cf.lineNumber}`;
      byFunc.set(key, (byFunc.get(key) ?? 0) + selfUs);
    }
    const hotspots = [...byFunc.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([fn, us]) => ({ fn, ms: Math.round(us / 1000) }));

    return {
      jsMs: Math.round(metric("ScriptDuration") * 1000),
      taskMs: Math.round(metric("TaskDuration") * 1000),
      wallMs: Date.now() - t0,
      longtaskCount: longtasks.length,
      longtaskMs: Math.round(longtasks.reduce((a, t) => a + t.duration, 0)),
      hotspots,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const products = PRODUCTS.filter((p) => !args.slugs || args.slugs.includes(p.slug));
  if (args.slugs) {
    const known = new Set(PRODUCTS.map((p) => p.slug));
    const unknown = args.slugs.filter((s) => !known.has(s));
    // Slugs fuera de la tabla se miden como superficie photo (canvas).
    for (const s of unknown) products.push({ slug: s, surface: "photo" });
  }
  if (!products.length) {
    console.error("sin slugs que medir");
    process.exit(2);
  }

  console.log(`→ ${products.length} producto(s) × ${args.runs} corrida(s) contra ${args.baseUrl}`);
  const results = [];
  for (const product of products) {
    const runs = [];
    for (let r = 0; r < args.runs; r++) {
      process.stdout.write(`  · ${product.slug} [${r + 1}/${args.runs}] … `);
      try {
        const m = await measureOnce(args.baseUrl, product);
        runs.push(m);
        console.log(`${(m.jsMs / 1000).toFixed(1)} s JS · ${m.longtaskCount} longtasks`);
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
        runs.push({ error: err.message });
      }
    }
    const ok = runs.filter((r) => !r.error);
    results.push({
      slug: product.slug,
      surface: product.surface,
      runs,
      median: ok.length
        ? {
            jsMs: Math.round(median(ok.map((r) => r.jsMs))),
            taskMs: Math.round(median(ok.map((r) => r.taskMs))),
            wallMs: Math.round(median(ok.map((r) => r.wallMs))),
            longtaskCount: Math.round(median(ok.map((r) => r.longtaskCount))),
            longtaskMs: Math.round(median(ok.map((r) => r.longtaskMs))),
            hotspots: ok[Math.floor(ok.length / 2)].hotspots,
          }
        : null,
    });
  }

  const control = results.find((r) => r.slug === CONTROL_SLUG)?.median;
  console.log("\nslug                                        jsMs   taskMs  longtasks  ltMs   vs control");
  console.log("─".repeat(92));
  for (const r of results) {
    if (!r.median) {
      console.log(`${r.slug.padEnd(43)} ERROR`);
      continue;
    }
    const ratio = control && r.slug !== CONTROL_SLUG ? r.median.jsMs / control.jsMs : null;
    const flag = ratio !== null && ratio > ALERT_THRESHOLD ? "  ⚠ >+30%" : "";
    console.log(
      `${r.slug.padEnd(43)} ${String(r.median.jsMs).padStart(6)} ${String(r.median.taskMs).padStart(7)} ${String(r.median.longtaskCount).padStart(9)} ${String(r.median.longtaskMs).padStart(6)} ${ratio ? ratio.toFixed(2) + "×" : "(control)"}${flag}`,
    );
  }

  const out =
    args.out ??
    resolve(
      import.meta.dirname,
      `../../../tmp/studio-perf-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
  mkdirSync(resolve(out, ".."), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      {
        methodology: "ADR-166: chromium 390×844 dpr3, CPU×6, contexto frío; jsMs=ScriptDuration CDP hasta readiness+reposo(1.5s sin longtasks)",
        baseUrl: args.baseUrl,
        runsPerSlug: args.runs,
        controlSlug: CONTROL_SLUG,
        alertThreshold: ALERT_THRESHOLD,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\n✓ JSON: ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
