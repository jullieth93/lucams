/*
 * Polaroid → cantidad libre 1–10 + tamaño único 7.5×10 cm (feedback Lucy 2026-07-22).
 *
 * Antes: 4 sets (6·7×9 / 9·6×8 / 12·6×8 / 20 mini·4×5) × 3 estilos = 12 variantes
 * activas (FI-POL-12-V1..V4 + sufijos -BC/-PAS). Ahora: cantidad libre 1..10 a
 * tamaño único 7.5×10 cm. El "Estilo" deja de ser dimensión de variantes: las
 * plantillas visuales se eligen en el Estudio (frente de otro agente). Las 12
 * variantes viejas se PAUSAN (isActive=false), NO se borran: carritos/cotizaciones
 * históricas conservan su referencia y Lucy las ve como "Pausada" en /admin (reversible).
 *
 * Nuevas: FI-POL-75X10-{1..10}, attributes coherentes con el patrón del catálogo
 * WhatsApp (D3 fotoimanes): photoSlots=quantity=qty, sizeCm "7.5×10", shape
 * "rectangle", aspectRatio "400:580" — el MISMO de la plantilla del Estudio
 * (photo-pack-polaroid-instagram, stage 400×580): el filtro por aspecto
 * (|a−target| ≤ 0.05) las rutea a esa plantilla, igual que hoy.
 *
 * Precios (centavos COP): curva calada a los actuales total(q) = 1833·q + 16500
 * PESOS (calce verificado: q=6 → $27.498 ≈ $27.500 actual, q=9 → $32.997 ≈ $33.000,
 * q=12 → $38.496 ≈ $38.500), redondeada a centenas y convertida ×100:
 *   1:$18.300  2:$20.200  3:$22.000  4:$23.800  5:$25.700
 *   6:$27.500  7:$29.300  8:$31.200  9:$33.000  10:$34.800
 * NOTA: el pedido original listaba los valores ×10 como "centavos" (183.300 para
 * q=1 = $1.833 COP): con eso q=6 quedaría $2.750, DIEZ veces bajo el precio actual
 * e incoherente con el resto del feedback (fotoimán 7.5×10 1u = $19.300, tiras
 * magnéticas 3 fotos = $19.000). Se aplica la curva en pesos, que es la que calza.
 *
 * También: product.personalizationSchema.sizeCm "6×8" → "7.5×10" (mismo patrón que
 * D3) y sync del basePrice denormalizado (= opción activa más barata, $18.300;
 * compareAtPrice → null, las nuevas no tienen promo) — replica syncProductBasePrice.
 * Descripción: la copla "Elige set y tamaño" pasa a cantidad libre + estilo en Estudio.
 *
 * Idempotente: upsert por SKU (en update NO pisa precio — respeta ajustes de Lucy en
 * admin); la pausa filtra por prefijo de SKU para no pausar las nuevas en un re-run.
 * Transacción única. Uso: pnpm --filter @lucams/db exec node scripts/polaroid-qty-libre-2026-07-22.mjs
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

const SLUG = "set-fotoimanes-polaroid";
const NEW_SKU_PREFIX = "FI-POL-75X10-";
const SIZE_CM = "7.5×10";
const ASPECT = "400:580";

/** total(q) = 1833·q + 16500 pesos, redondeado a centenas → centavos. */
const priceCentavos = (q) => Math.round((1833 * q + 16500) / 100) * 100 * 100;

async function main() {
  const product = await prisma.product.findFirst({
    where: { slug: SLUG, deletedAt: null },
    select: { id: true, slug: true, personalizationSchema: true },
  });
  if (!product) throw new Error(`Producto '${SLUG}' no encontrado`);

  const out = await prisma.$transaction(
    async (tx) => {
      const log = [];

      // ── 1) Pausar las variantes viejas (sets × estilos). Filtro: activas y cuyo
      //    SKU NO es de la tanda nueva → un re-run no toca las FI-POL-75X10-*.
      const active = await tx.productVariant.findMany({
        where: { productId: product.id, deletedAt: null, isActive: true },
        select: { id: true, sku: true },
      });
      const oldIds = active.filter((v) => !v.sku.startsWith(NEW_SKU_PREFIX)).map((v) => v.id);
      const paused = await tx.productVariant.updateMany({
        where: { id: { in: oldIds } },
        data: { isActive: false },
      });
      log.push(`⊘ pausadas ${paused.count} variantes viejas (sets 6/9/12/20 × estilos)`);

      // ── 2) Upsert de las 10 nuevas (qty 1..10, 7.5×10). En update NO se pisa el
      //    precio (Lucy lo ajusta en admin) ni el stock.
      for (let qty = 1; qty <= 10; qty++) {
        const sku = `${NEW_SKU_PREFIX}${qty}`;
        const name = `${SIZE_CM} cm · ${qty} ${qty === 1 ? "unidad" : "unidades"}`;
        const attributes = {
          shape: "rectangle",
          sizeCm: SIZE_CM,
          quantity: qty,
          photoSlots: qty,
          aspectRatio: ASPECT,
        };
        const found = await tx.productVariant.findFirst({ where: { sku } });
        if (found) {
          await tx.productVariant.update({
            where: { id: found.id },
            data: { productId: product.id, name, attributes, isActive: true, deletedAt: null },
          });
          log.push(`~ ${sku} — ${name} (precio respetado)`);
        } else {
          const price = priceCentavos(qty);
          await tx.productVariant.create({
            data: {
              productId: product.id,
              sku,
              name,
              attributes,
              price,
              stock: 100,
              isActive: true,
            },
          });
          log.push(`+ ${sku} — ${name} · $${(price / 100).toLocaleString("es-CO")}`);
        }
      }

      // ── 3) Schema del producto: sizeCm "6×8" (tamaño retirado) → "7.5×10".
      const schema = { ...(product.personalizationSchema ?? {}), sizeCm: SIZE_CM };
      await tx.product.update({
        where: { id: product.id },
        data: {
          personalizationSchema: schema,
          // Copla de la PDP: ya no hay "sets" sino cantidad libre; el estilo se elige
          // en el Estudio (dimensiones variantStyle ocultas desde la Ola 2A).
          description:
            "Fotoimanes con tus fotos en formato polaroid 7.5×10 cm. Elige el estilo del marco en el Estudio: blanco clásico, colores pasteles o estilo Instagram. Impresión en alta resolución, acabado mate. Elige la cantidad en el selector.",
          // Sync denormalizado (= syncProductBasePrice): base = opción activa más
          // barata (qty 1); sin promo tachada (las nuevas no tienen compareAtPrice).
          basePrice: priceCentavos(1),
          compareAtPrice: null,
        },
      });
      log.push(
        `~ producto: schema.sizeCm → "${SIZE_CM}", basePrice → $${(priceCentavos(1) / 100).toLocaleString("es-CO")}, compareAtPrice → null`,
      );
      return log;
    },
    { timeout: 60000, maxWait: 15000 },
  );

  for (const line of out) console.log(line);

  // ── Verificación post-transacción ──────────────────────────────────────────
  const variants = await prisma.productVariant.findMany({
    where: { productId: product.id, deletedAt: null },
    orderBy: { sku: "asc" },
    select: { sku: true, price: true, isActive: true },
  });
  const active = variants.filter((v) => v.isActive);
  const pausedV = variants.filter((v) => !v.isActive);
  console.log(`\nEstado final: ${active.length} activas · ${pausedV.length} pausadas`);
  const contiguous =
    active.length === 10 &&
    active.every((v) => v.sku.startsWith(NEW_SKU_PREFIX)) &&
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((q) =>
      active.some((v) => v.sku === `${NEW_SKU_PREFIX}${q}`),
    );
  console.log(
    contiguous
      ? "✓ Cantidades 1..10 contiguas activas (stepper PDP aplica)"
      : "✗ REVISAR: la matriz 1..10 no quedó completa",
  );
  if (!contiguous) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
