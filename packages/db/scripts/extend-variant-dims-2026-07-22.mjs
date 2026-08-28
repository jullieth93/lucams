/*
 * Catálogo WhatsApp (Lucy 2026-07-21) — ampliación de dimensiones de variantes.
 *
 *   D2  separadores-libros:        cantidades 2/4/6 por forma (hoy solo 1/3/5).
 *   D3  set-fotoimanes-cuadrados:  tamaños reales 6.5×6.5 y 7.5×10 cm + frameStyle
 *                                  blanco/negro × cantidades 1-6. Las 9 variantes
 *                                  viejas (4×4/5×5/7×7, tamaños que ya no existen)
 *                                  se PAUSAN (isActive=false), no se borran.
 *   C1  set-fotoimanes-polaroid:   variantStyle blanco-clasico / pasteles / instagram.
 *                                  Las 4 actuales se etiquetan "instagram" (es la única
 *                                  plantilla visual que existe: photo-pack-polaroid-instagram).
 *   C2  pack-vocales:              theme animales/frutas/profesiones × language es/en
 *                                  (las 6 actuales = animales·es) + categorías raíz
 *                                  Animales/Frutas + LetterTileSets vacíos para que Lucy
 *                                  suba las ilustraciones desde /admin/fichas.
 *
 * Precios: centavos COP, derivados de la curva existente de cada producto (ver
 * comentarios por sección). Lucy los ajusta después en /admin/productos.
 *
 * Idempotente (upsert por SKU / slug). Cada producto corre en SU transacción.
 * Uso: DATABASE_URL=$DIRECT_URL node scripts/extend-variant-dims-2026-07-22.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Upsert de variante por SKU (SKU es único global). En update NO pisa el precio (respeta admin). */
async function upsertVariant(tx, { productId, sku, name, price, attributes }) {
  const found = await tx.productVariant.findFirst({ where: { sku } });
  if (found) {
    await tx.productVariant.update({
      where: { id: found.id },
      data: { productId, name, attributes, isActive: true, deletedAt: null },
    });
    return { action: "~", sku, priceNote: "precio respetado" };
  }
  await tx.productVariant.create({
    data: { productId, sku, name, attributes, price, stock: 100, isActive: true },
  });
  return { action: "+", sku, priceNote: `$${(price / 100).toLocaleString("es-CO")}` };
}

async function getProduct(tx, slug) {
  const p = await tx.product.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true, slug: true },
  });
  if (!p) throw new Error(`Producto '${slug}' no encontrado`);
  return p;
}

// ───────────────────────────── D2 — Separadores ─────────────────────────────
// Curva existente: 1→$6.000 (6000/u) · 3→$15.000 (5000/u) · 5→$22.000 (4400/u).
// Nuevas (misma lógica de descuento por volumen, definida por Lucy 2026-07-21):
//   2→$11.000 (5500/u) · 4→$19.000 (4750/u) · 6→$25.200 (4200/u).
const SEP_FORMAS = [
  {
    key: "CUAD",
    label: "Cuadrado",
    sizeCm: "4×4.2",
    aspectRatio: "4:4.2",
    variantShape: "cuadrado",
  },
  {
    key: "RECT",
    label: "Rectangular",
    sizeCm: "6×2",
    aspectRatio: "6:2",
    variantShape: "rectangular",
  },
];
const SEP_QTYS_NUEVAS = [
  { qty: 2, pesos: 11000 },
  { qty: 4, pesos: 19000 },
  { qty: 6, pesos: 25200 },
];

async function d2Separadores() {
  const product = await getProduct(prisma, "separadores-libros");
  const results = await prisma.$transaction(
    async (tx) => {
      const out = [];
      for (const f of SEP_FORMAS) {
        for (const q of SEP_QTYS_NUEVAS) {
          out.push(
            await upsertVariant(tx, {
              productId: product.id,
              sku: `SEP-${f.key}-${q.qty}`,
              name: `${f.label} · ${q.qty} separadores · ${f.sizeCm} cm`,
              price: q.pesos * 100,
              // MISMO patrón de attributes que las variantes 1/3/5 existentes.
              attributes: {
                shape: "rectangle",
                sizeCm: f.sizeCm,
                quantity: q.qty,
                photoSlots: q.qty,
                aspectRatio: f.aspectRatio,
                variantShape: f.variantShape,
              },
            }),
          );
        }
      }
      return out;
    },
    { timeout: 60000, maxWait: 15000 },
  );
  return results;
}

// ──────────────────────── D3 — Fotoimanes Cuadrados ────────────────────────
// Curva existente (precio unitario por tamaño, calce exacto sobre qty 6/9/12):
//   unit(q) = a + b/q  →  4×4: a=1167,b=10500 · 5×5: a=1417,b=12800 · 7×7: a=1667,b=15000
// Nuevos tamaños interpolados/extrapolados por área (cm²):
//   6.5×6.5 (42.25): a≈1596, b≈14381 → totales redondeados a $100
//   7.5×10  (75):    a≈1938, b≈17383 → totales redondeados a $100
// El marco (blanco/negro) NO cambia el precio: es solo el color de impresión.
const FI_SIZES = [
  {
    key: "65",
    sizeCm: "6.5×6.5",
    aspectRatio: "1:1",
    // qty → total pesos (unitario: 16000/8800/6400/5200/4500/4000)
    prices: { 1: 16000, 2: 17600, 3: 19200, 4: 20800, 5: 22500, 6: 24000 },
  },
  {
    key: "75X10",
    sizeCm: "7.5×10",
    aspectRatio: "3:4",
    // unitario: 19300/10650/7733/6275/5420/4833
    prices: { 1: 19300, 2: 21300, 3: 23200, 4: 25100, 5: 27100, 6: 29000 },
  },
];
const FI_FRAMES = [
  { key: "BLA", value: "blanco", label: "Marco blanco" },
  { key: "NEG", value: "negro", label: "Marco negro" },
];
const FI_QTYS = [1, 2, 3, 4, 5, 6];

async function d3Fotoimanes() {
  const product = await getProduct(prisma, "set-fotoimanes-cuadrados");
  return prisma.$transaction(
    async (tx) => {
      const out = [];

      // 1) Pausar las 9 variantes de tamaños retirados (4×4, 5×5, 7×7). NO se borran:
      //    carritos/cotizaciones históricas conservan su referencia y Lucy las ve
      //    como "Pausada" en /admin/productos (reversible). Filtro por sizeCm en JS
      //    (no por "todo lo activo") para que un re-run NO pause variantes nuevas.
      const OLD_SIZES = new Set(["4×4", "5×5", "7×7"]);
      const activeNow = await tx.productVariant.findMany({
        where: { productId: product.id, deletedAt: null, isActive: true },
        select: { id: true, attributes: true },
      });
      const oldIds = activeNow
        .filter((v) => OLD_SIZES.has(/** @type {any} */ (v.attributes)?.sizeCm))
        .map((v) => v.id);
      const paused = await tx.productVariant.updateMany({
        where: { id: { in: oldIds } },
        data: { isActive: false },
      });
      out.push({
        action: "⊘",
        sku: `(${oldIds.length} variantes viejas 4×4/5×5/7×7)`,
        priceNote: `pausadas: ${paused.count}`,
      });

      // 2) Variantes nuevas: tamaño × marco × cantidad (2×2×6 = 24, matriz completa
      //    → la PDP no muestra chips deshabilitados).
      for (const s of FI_SIZES) {
        for (const f of FI_FRAMES) {
          for (const qty of FI_QTYS) {
            out.push(
              await upsertVariant(tx, {
                productId: product.id,
                sku: `FI-CUAD-${s.key}-${f.key}-${qty}`,
                name: `${s.sizeCm} cm · ${f.label} · ${qty} ${qty === 1 ? "unidad" : "unidades"}`,
                price: s.prices[qty] * 100,
                attributes: {
                  shape: "rectangle",
                  sizeCm: s.sizeCm,
                  quantity: qty,
                  photoSlots: qty,
                  aspectRatio: s.aspectRatio,
                  frameStyle: f.value,
                },
              }),
            );
          }
        }
      }

      // 3) Schema del producto: sizeCm "5×5" (tamaño retirado) → "6.5×6.5".
      const prod = await tx.product.findUnique({
        where: { id: product.id },
        select: { personalizationSchema: true },
      });
      const schema = { ...(prod.personalizationSchema ?? {}), sizeCm: "6.5×6.5" };
      await tx.product.update({
        where: { id: product.id },
        data: { personalizationSchema: schema },
      });
      out.push({
        action: "~",
        sku: "product.personalizationSchema",
        priceNote: 'sizeCm → "6.5×6.5"',
      });

      // 4) Plantilla rectangular dedicada (stage 600×800 = ratio 0.75) para que las
      //    variantes 7.5×10 rutee a un canvas WYSIWYG (mismo patrón que
      //    foto-cuadrado-simple / sep-cuadrado: [fondo, foto] sin texto).
      //    Sin ella, el filtro por aspecto (|a-target| ≤ 0.05) dejaba esas variantes
      //    sin plantilla → canvas cuadrado por defecto (engañoso para un imán 3:4).
      const canvasData = {
        version: 1,
        stage: { width: 600, height: 800, dpiPreview: 90, dpiProduction: 300 },
        layers: [
          { id: "bg", type: "background", color: "#FFFFFF" },
          {
            id: "photo",
            type: "image-placeholder",
            x: 0,
            y: 0,
            width: 600,
            height: 800,
            cornerRadius: 0,
          },
        ],
      };
      const tplData = {
        productId: product.id,
        kind: "PHOTO_PACK",
        mode: "EDITABLE",
        name: "Rectangular simple",
        description: "Fotoimán rectangular 7.5×10 — tu foto a todo el imán.",
        previewUrl: "/brand/lucams-logo.png",
        canvasData,
        isActive: true,
        order: -10,
        deletedAt: null,
      };
      const tpl = await tx.personalizationTemplate.findFirst({
        where: { slug: "foto-rectangular-simple" },
      });
      if (tpl) {
        await tx.personalizationTemplate.update({ where: { id: tpl.id }, data: tplData });
        out.push({ action: "~", sku: "plantilla foto-rectangular-simple", priceNote: "600×800" });
      } else {
        await tx.personalizationTemplate.create({
          data: { slug: "foto-rectangular-simple", ...tplData },
        });
        out.push({ action: "+", sku: "plantilla foto-rectangular-simple", priceNote: "600×800" });
      }
      return out;
    },
    { timeout: 60000, maxWait: 15000 },
  );
}

// ─────────────────────────── C1 — Polaroid estilos ───────────────────────────
// Mismo precio entre estilos (Lucy no indicó diferencial): cada estilo hereda el
// precio actual de su set. Las 4 existentes se etiquetan "instagram" porque la
// única plantilla visual activa es photo-pack-polaroid-instagram (ig_post.svg).
// blanco-clasico y pasteles quedan como dato de variante; su render visual es
// pendiente (Frente E — plantillas nuevas).
const POL_STYLE_LABEL = {
  instagram: "Instagram",
  "blanco-clasico": "Blanco clásico",
  pasteles: "Pasteles",
};

async function c1Polaroid() {
  const product = await getProduct(prisma, "set-fotoimanes-polaroid");
  return prisma.$transaction(
    async (tx) => {
      const out = [];
      const current = await tx.productVariant.findMany({
        where: { productId: product.id, deletedAt: null, isActive: true },
        select: { id: true, sku: true, name: true, price: true, attributes: true },
        orderBy: { createdAt: "asc" },
      });
      // Base = las 4 originales (sin estilo) o las ya etiquetadas "instagram" en un
      // run anterior. Así un re-run NO deriva estilos nuevos desde BC/PAS (sku-BC-BC).
      const bases = current.filter(
        (v) =>
          !/-(BC|PAS)$/.test(v.sku) &&
          (!v.attributes?.variantStyle || v.attributes?.variantStyle === "instagram"),
      );

      for (const v of bases) {
        const attrs = { ...(v.attributes ?? {}), variantStyle: "instagram" };
        const name = v.name.includes("· Instagram") ? v.name : `${v.name} · Instagram`;
        await tx.productVariant.update({ where: { id: v.id }, data: { name, attributes: attrs } });
        out.push({ action: "~", sku: v.sku, priceNote: 'variantStyle "instagram"' });

        for (const style of ["blanco-clasico", "pasteles"]) {
          const suffix = style === "blanco-clasico" ? "BC" : "PAS";
          out.push(
            await upsertVariant(tx, {
              productId: product.id,
              sku: `${v.sku}-${suffix}`,
              name: `${v.name} · ${POL_STYLE_LABEL[style]}`,
              price: v.price,
              attributes: { ...(v.attributes ?? {}), variantStyle: style },
            }),
          );
        }
      }
      return out;
    },
    { timeout: 60000, maxWait: 15000 },
  );
}

// ────────────────── C2 — Pack Vocales modular + categorías ──────────────────
// Las 6 variantes actuales (tamaño × imán) pasan a ser theme=animales, language=es
// (única combinación con estructura de fichas hoy — aunque SIN ilustraciones subidas
// todavía: los 2 sets existentes tienen 0 fichas). Se crean las otras 5 combinaciones
// theme×language con los mismos precios por tamaño/imán (el tema/idioma no cambia
// el costo de producción). Matriz completa 3×2×6 = 36 → PDP sin chips deshabilitados.
const VOC_THEMES = [
  { key: "ANI", value: "animales", label: "Animales" },
  { key: "FRU", value: "frutas", label: "Frutas" },
  { key: "PRO", value: "profesiones", label: "Profesiones" },
];
const VOC_LANGS = [
  { key: "ES", value: "es", label: "Español" },
  { key: "EN", value: "en", label: "Inglés" },
];

async function c2Vocales() {
  const product = await getProduct(prisma, "pack-vocales");
  return prisma.$transaction(
    async (tx) => {
      const out = [];
      const current = await tx.productVariant.findMany({
        where: { productId: product.id, deletedAt: null, isActive: true },
        select: { id: true, sku: true, name: true, price: true, attributes: true },
        orderBy: { createdAt: "asc" },
      });
      // Base = las 6 originales (sin tema/idioma) o las ya etiquetadas animales·es
      // en un run anterior. Así un re-run NO deriva combos desde FRU/PRO (sku-FRU-ES-PRO-EN).
      const bases = current.filter(
        (v) =>
          !/-(ANI|FRU|PRO)-(ES|EN)$/.test(v.sku) &&
          (!v.attributes?.theme ||
            (v.attributes?.theme === "animales" && v.attributes?.language === "es")),
      );

      for (const v of bases) {
        // Base = animales · Español (lo que Lucy vende hoy).
        const baseAttrs = { ...(v.attributes ?? {}), theme: "animales", language: "es" };
        const baseName = v.name.includes("· Animales") ? v.name : `${v.name} · Animales · Español`;
        await tx.productVariant.update({
          where: { id: v.id },
          data: { name: baseName, attributes: baseAttrs },
        });
        out.push({ action: "~", sku: v.sku, priceNote: "theme animales · es" });

        for (const t of VOC_THEMES) {
          for (const l of VOC_LANGS) {
            if (t.value === "animales" && l.value === "es") continue; // ya existe (base)
            out.push(
              await upsertVariant(tx, {
                productId: product.id,
                sku: `${v.sku}-${t.key}-${l.key}`,
                name: `${v.name} · ${t.label} · ${l.label}`,
                price: v.price,
                attributes: { ...(v.attributes ?? {}), theme: t.value, language: l.value },
              }),
            );
          }
        }
      }
      return out;
    },
    { timeout: 60000, maxWait: 15000 },
  );
}

async function c2CategoriasYSets() {
  return prisma.$transaction(
    async (tx) => {
      const out = [];

      // Categorías raíz nuevas (el árbol actual es plano: 4 raíces sin hijas).
      const CATS = [
        {
          slug: "animales",
          name: "Animales",
          order: 4,
          description: "Juegos y diseños con animalitos para aprender y decorar.",
        },
        {
          slug: "frutas",
          name: "Frutas",
          order: 5,
          description: "Juegos y diseños con frutas para aprender y decorar.",
        },
      ];
      for (const c of CATS) {
        const found = await tx.category.findFirst({ where: { slug: c.slug } });
        if (found) {
          await tx.category.update({
            where: { id: found.id },
            data: { name: c.name, description: c.description, isActive: true, deletedAt: null },
          });
          out.push({
            action: "~",
            sku: `categoría ${c.slug}`,
            priceNote: "reactivada/actualizada",
          });
        } else {
          await tx.category.create({ data: { ...c, isActive: true } });
          out.push({ action: "+", sku: `categoría ${c.slug}`, priceNote: "raíz, activa" });
        }
      }

      // LetterTileSets VACÍOS para los temas/idiomas que faltan (Lucy sube las
      // ilustraciones desde /admin/fichas). listLetterStyles omite sets sin fichas
      // → no aparecen en el Estudio hasta tener al menos 1 ficha (degrade gracioso).
      const SETS = [
        { name: "Frutas · Español", language: "es" },
        { name: "Frutas · English", language: "en" },
        { name: "Profesiones · Español", language: "es" },
        { name: "Profesiones · English", language: "en" },
      ];
      for (const s of SETS) {
        const found = await tx.letterTileSet.findFirst({
          where: { name: s.name, language: s.language, deletedAt: null },
        });
        if (found) {
          out.push({ action: "=", sku: `letter-set "${s.name}"`, priceNote: "ya existía" });
          continue;
        }
        const order = await tx.letterTileSet.count({
          where: { language: s.language, deletedAt: null },
        });
        await tx.letterTileSet.create({
          data: { name: s.name, language: s.language, isActive: true, isDefault: false, order },
        });
        out.push({ action: "+", sku: `letter-set "${s.name}"`, priceNote: "vacío, sin fichas" });
      }
      return out;
    },
    { timeout: 60000, maxWait: 15000 },
  );
}

async function main() {
  console.log("D2 — Separadores (qty 2/4/6):");
  for (const r of await d2Separadores()) console.log(`  ${r.action} ${r.sku} — ${r.priceNote}`);

  console.log("D3 — Fotoimanes Cuadrados (tamaños reales + marco):");
  for (const r of await d3Fotoimanes()) console.log(`  ${r.action} ${r.sku} — ${r.priceNote}`);

  console.log("C1 — Polaroid (estilos):");
  for (const r of await c1Polaroid()) console.log(`  ${r.action} ${r.sku} — ${r.priceNote}`);

  console.log("C2 — Pack Vocales (tema × idioma):");
  for (const r of await c2Vocales()) console.log(`  ${r.action} ${r.sku} — ${r.priceNote}`);

  console.log("C2 — Categorías + sets de fichas:");
  for (const r of await c2CategoriasYSets()) console.log(`  ${r.action} ${r.sku} — ${r.priceNote}`);

  console.log("\n✓ DONE.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
