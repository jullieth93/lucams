/*
 * ONE-SHOT (D3, 2026-09-15) — DIAGNÓSTICO de visibilidad de plantillas Estudio.
 *
 * Por qué existe: reporte "las plantillas cargadas en el Admin no se ven en el
 * Estudio" (admin y cliente). El Estudio lista vía
 * `listTemplatesForKind` (apps/web/features/personalization/service.ts) que aplica,
 * en orden:
 *   1. Filtro DB: kind del producto, mode EDITABLE, isActive, deletedAt:null,
 *      productId del producto O global (null).
 *   2. preferProductSpecific: si el producto tiene específicas curadas, SOLO esas
 *      (las globales del mismo kind se ocultan).
 *   3. filterTemplatesByAspectRatio: stage.width/height ≈ aspectRatio efectivo
 *      (atributo de la variante seleccionada, o personalizationSchema del
 *      producto si la variante no lo declara), tolerancia ±0.05.
 * El admin lista TODO (incluidas soft-deleted) → una plantilla puede "existir" en
 * el admin y estar invisible en el Estudio por cualquiera de esos filtros.
 *
 * Qué hace: para CADA producto personalizable con superficie de foto imprime
 *   - sus aspect ratios efectivos (por variante, con fallback al schema),
 *   - TODAS las plantillas del kind (de cualquier estado) que le aplican,
 *   - cuáles quedan VISIBLES en el Estudio y POR QUÉ se excluye cada una de
 *     las demás (estado / preferencia de específicas / aspect ratio),
 *   - alerta si algún aspect efectivo queda con 0 visibles (el boot cae al
 *     canvas cuadrado 1080×1080 de respaldo — ADR-063 T4).
 *
 * READ-ONLY: no escribe nada → NO pasa por env-guard y sirve tal cual para
 * LOCAL, STG y PRD (cargar el .env correspondiente con dotenv-cli).
 * Réplica fiel de apps/web/features/personalization/template-visibility.ts
 * (helpers puros copiados: si cambian allá, actualizar acá).
 *
 * Uso:
 *   pnpm --filter @lucams/db exec dotenv -e ../../.env.local -- node scripts/one-shot/diagnose-template-visibility-20260915.mjs
 *   pnpm --filter @lucams/db exec dotenv -e ../../.env.stg   -- node scripts/one-shot/diagnose-template-visibility-20260915.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

// ── Réplica de template-visibility.ts (helpers puros) ──────────────────────

const ASPECT_TOLERANCE = 0.05; // misma tolerancia que filterTemplatesByAspectRatio

function parseAspectRatio(s) {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^(\d+(?:\.\d+)?)\s*[:×x]\s*(\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  const h = parseFloat(m[2]);
  if (h === 0) return null;
  return parseFloat(m[1]) / h;
}

function templateAspectRatio(canvasData) {
  const st = canvasData?.stage;
  const w = typeof st?.width === "number" ? st.width : null;
  const h = typeof st?.height === "number" ? st.height : null;
  if (w === null || h === null || h === 0) return null;
  return w / h;
}

function matchesAspect(canvasData, target) {
  if (target === null) return true; // sin aspect del producto → no se filtra
  const a = templateAspectRatio(canvasData);
  if (a === null) return true; // plantilla sin stage parseable → permitir
  return Math.abs(a - target) <= ASPECT_TOLERANCE;
}

const fmtA = (a) => (a === null ? "?" : a.toFixed(3));

// Kinds cuya superficie del Estudio SÍ lista plantillas (editor de foto). Los
// demás (TEXT_ONLY, EVENT_FAVOR, BUSINESS_LOGO…) abren superficies no-foto que
// no consumen plantillas — ver resolvePersonalizationSurface en apps/web.
const TEMPLATE_CONSUMING_KINDS = new Set([
  "PHOTO_PACK",
  "PHOTO_GRID",
  "CALENDAR_PHOTO_MONTH",
  "CALENDAR_PHOTO_HERO",
  "CUSTOM_DECOR",
]);

async function main() {
  console.log("=== diagnose-template-visibility (READ-ONLY) ===\n");

  const products = await prisma.product.findMany({
    where: {
      isPersonalizable: true,
      deletedAt: null,
      personalizationKind: { not: "NONE" },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      personalizationKind: true,
      personalizationSchema: true,
      variants: {
        where: { isActive: true, deletedAt: null },
        select: { sku: true, attributes: true },
      },
    },
    orderBy: { slug: "asc" },
  });

  let productsWithZeroVisible = 0;

  for (const p of products) {
    const schema =
      p.personalizationSchema && typeof p.personalizationSchema === "object"
        ? p.personalizationSchema
        : {};

    // Aspects efectivos: atributo aspectRatio de cada variante activa (el Estudio
    // mergea variante sobre schema — mergeVariantOverProduct), con fallback al
    // aspectRatio del personalizationSchema del producto. Un producto puede tener
    // varios aspects (ej. separadores: 1:3 y 20:21) → se evalúa cada uno.
    const aspectSet = new Map(); // aspectString → origen
    for (const v of p.variants) {
      const attrs = v.attributes && typeof v.attributes === "object" ? v.attributes : {};
      const eff = attrs.aspectRatio ?? schema.aspectRatio ?? null;
      const key = typeof eff === "string" ? eff : "(sin aspect)";
      if (!aspectSet.has(key)) {
        aspectSet.set(key, typeof attrs.aspectRatio === "string" ? "variante" : "schema");
      }
    }
    if (aspectSet.size === 0) aspectSet.set("(sin aspect)", "—");

    // Universo COMPLETO del kind para este producto (todas las plantillas que el
    // admin ve y podría esperar ver en el Estudio), sin filtrar estado.
    const all = await prisma.personalizationTemplate.findMany({
      where: { kind: p.personalizationKind, OR: [{ productId: p.id }, { productId: null }] },
      orderBy: { order: "asc" },
      select: {
        slug: true,
        name: true,
        mode: true,
        isActive: true,
        deletedAt: true,
        productId: true,
        canvasData: true,
      },
    });

    console.log(
      `■ ${p.slug} — "${p.name}" [${p.personalizationKind}]${p.isActive ? "" : "  ⚠ PRODUCTO INACTIVO"}`,
    );
    const aspectList = [...aspectSet.entries()]
      .map(([a, src]) => `${a} (${src}, ratio ${fmtA(parseAspectRatio(a))})`)
      .join(" · ");
    console.log(`  aspects efectivos: ${aspectList}`);
    if (p.variants.length === 0) console.log("  ⚠ sin variantes activas");

    if (all.length === 0) {
      if (TEMPLATE_CONSUMING_KINDS.has(p.personalizationKind)) {
        console.log("  ✗ NO hay plantillas del kind (ni específicas ni globales).");
        productsWithZeroVisible++;
      } else {
        console.log("  (superficie no-foto: el Estudio no consume plantillas para este kind)");
      }
      console.log("");
      continue;
    }

    // Paso 1 — filtro DB (kind ya aplicado en la query).
    const dbExcluded = []; // [{ t, reasons }]
    const dbSurvivors = []; // plantillas crudas
    for (const t of all) {
      const reasons = [];
      if (t.mode !== "EDITABLE") reasons.push(`mode=${t.mode} (Estudio solo lista EDITABLE)`);
      if (!t.isActive) reasons.push("isActive=false");
      if (t.deletedAt) reasons.push(`soft-deleted ${t.deletedAt.toISOString().slice(0, 10)}`);
      if (reasons.length > 0) dbExcluded.push({ t, reasons });
      else dbSurvivors.push(t);
    }

    // Paso 2 — preferProductSpecific: específicas curadas tapan a las globales.
    const specific = dbSurvivors.filter((t) => t.productId === p.id);
    const hiddenBySpecific =
      specific.length > 0 ? dbSurvivors.filter((t) => t.productId === null) : [];
    const afterPrefer = specific.length > 0 ? specific : dbSurvivors;

    // Paso 3 — filtro de aspect por cada aspect efectivo.
    const visibleByAspect = new Map(); // aspectString → slugs visibles
    for (const [aspectStr] of aspectSet) {
      const target = parseAspectRatio(aspectStr);
      visibleByAspect.set(
        aspectStr,
        afterPrefer.filter((t) => matchesAspect(t.canvasData, target)).map((t) => t.slug),
      );
    }

    for (const t of afterPrefer) {
      const a = templateAspectRatio(t.canvasData);
      const st = t.canvasData?.stage;
      const perAspect = [...aspectSet.keys()]
        .map((aspectStr) => {
          const target = parseAspectRatio(aspectStr);
          return matchesAspect(t.canvasData, target)
            ? `✓ ${aspectStr}`
            : `✗ ${aspectStr} (stage ${fmtA(a)} vs ${fmtA(target)})`;
        })
        .join(" · ");
      const scope = t.productId === p.id ? "específica" : "global";
      console.log(
        `  • ${t.slug} (${scope}, stage ${st?.width}×${st?.height}, ratio ${fmtA(a)})  →  ${perAspect}`,
      );
    }
    for (const { t, reasons } of dbExcluded) {
      console.log(`  ✗ ${t.slug} — EXCLUIDA: ${reasons.join(" + ")}`);
    }
    for (const t of hiddenBySpecific) {
      console.log(
        `  ✗ ${t.slug} — OCULTA: el producto tiene ${specific.length} específica(s) curada(s) (preferProductSpecific)`,
      );
    }

    for (const [aspectStr, slugs] of visibleByAspect) {
      if (slugs.length === 0) {
        const consumes = TEMPLATE_CONSUMING_KINDS.has(p.personalizationKind);
        console.log(
          consumes
            ? `  ⚠⚠ aspect ${aspectStr}: 0 plantillas visibles → el boot cae al canvas 1080×1080 genérico`
            : `  (aspect ${aspectStr}: 0 visibles — kind no-foto, el Estudio no las lista)`,
        );
        if (consumes) productsWithZeroVisible++;
      } else {
        console.log(`  → visibles para aspect ${aspectStr}: ${slugs.join(", ")}`);
      }
    }
    console.log("");
  }

  console.log(
    productsWithZeroVisible === 0
      ? "OK: todo producto/aspect tiene al menos 1 plantilla visible."
      : `⚠ ${productsWithZeroVisible} caso(s) producto/aspect SIN plantilla visible (ver ⚠⚠ arriba).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
