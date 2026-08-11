/*
 * Purgado de FIXTURES DE TESTS *archivados* (soft-deleted) — complemento de
 * cleanup-test-junk.mjs (2026-07-22).
 *
 * Por qué existe: cleanup-test-junk.mjs solo barre categorías VIVAS (deletedAt:null).
 * Los fixtures que quedaron soft-deleted (por una corrida interrumpida o porque una
 * orden de test referenciaba una variante) SIGUEN VISIBLES en /admin/productos y
 * /admin/categorias, cuyo filtro por defecto es "Todos (activos + inactivos +
 * archivados)". La dueña los ve como basura residual. Este script los borra EN DURO.
 *
 * Detección (misma señal que cleanup-test-junk.mjs): el slug lleva un epoch de 13
 * dígitos (Date.now() del RUN) y arranca con prefijo de test conocido
 * (cart/chk/e2e/cms/cons/rls/prod/cat/ord/saga/rtr/test/shots/clone).
 * Adicionalmente REPORTA (sin tocar) filas con nombres de fixture ("Simple …",
 * "E2E …", "Perso …", "Name …", "Cat …") cuyo slug NO matchea — revisión manual.
 *
 * Seguridad (misma regla que el hermano): si alguna variante del producto fixture
 * está referenciada por un OrderItem (FK Restrict), NO se borra en duro — queda
 * soft-deleted para preservar la integridad de las órdenes y se reporta.
 *
 * También elimina (decisión de negocio Lucy 2026-07-22) las categorías vacías
 * "animales" y "frutas", creadas en trabajo reciente: el tema va en el Estudio,
 * no como categoría. Solo se borran si siguen SIN productos (verificado en runtime).
 *
 * Transaccional: cada producto se borra dentro de su propia $transaction
 * (cartItems → inventoryLogs → designs → product; el resto cae por CASCADE:
 * variants, reviews, ocasionTags, wishlist, backInStock, templates, reservations;
 * QuoteItem/OrderItem.designId son SetNull).
 *
 * Uso:
 *   node scripts/purge-archived-test-junk.mjs            # DRY-RUN: solo lista qué haría
 *   node scripts/purge-archived-test-junk.mjs --apply    # ejecuta el borrado
 *   node scripts/purge-archived-test-junk.mjs --apply --include-archived-business
 *     # además: hard delete del catálogo VIEJO de negocio archivado sin pedidos
 *     # (aprobado por Lucy 2026-08-08, Fase 6 pre-producción).
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

// Guarda de ambiente: borrado EN DURO de fixtures — bloquea PRD/remotos no STG.
assertDestructiveAllowed("purge-archived-test-junk.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
// 2026-08-08 (aprobado por Lucy, Fase 6): incluir el catálogo VIEJO de negocio
// archivado (no-fixture) — hard delete solo si ninguna variante tiene pedidos.
const INCLUDE_ARCHIVED_BUSINESS = process.argv.includes("--include-archived-business");

const RUN_PREFIXES = [
  "cart",
  "chk",
  "e2e",
  "cms",
  "cons",
  "rls",
  "prod",
  "cat",
  "ord",
  "saga",
  "rtr",
  "test",
  "shots",
  "clone",
  // 2026-08-08 (Fase 6 pre-producción): prefijos de fixtures que se escapaban
  // — itestcat/itestquote/itestoca/itestcust (integration suites), finalorch,
  // perso<epoch>, cpn<epoch>. El match es case-insensitive (había ITESTCUST…).
  "itest",
  "finalorch",
  "perso",
  "cpn",
];
const slugLooksLikeTest = (slug) => {
  const s = slug.toLowerCase();
  return /1[0-9]{12}/.test(s) && RUN_PREFIXES.some((p) => s.startsWith(p));
};

// Nombres típicos de fixture que NO llevan epoch en el slug (reporte manual, nunca auto-borrado).
const FIXTURE_NAME_PREFIXES = ["Simple ", "E2E ", "Perso ", "Name ", "Cat ", "Beta ", "ZZ "];

// Decisión Lucy 2026-07-22: el tema animales/frutas va en el Estudio, no como categoría.
const BUSINESS_CATS_TO_REMOVE = ["animales", "frutas"];

async function main() {
  console.log(`=== purge-archived-test-junk (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  // ── 1. Productos fixture (cualquier estado deletedAt) ──────────────────────
  const allProducts = await prisma.product.findMany({
    where: { OR: [{ deletedAt: { not: null } }, { isActive: false }] },
    select: {
      id: true,
      slug: true,
      name: true,
      deletedAt: true,
      category: { select: { slug: true } },
      _count: { select: { variants: true } },
    },
  });
  const junkProducts = allProducts.filter((p) => slugLooksLikeTest(p.slug));

  // Sospechosos por nombre (slug NO fixture) — solo reporte.
  const nameSuspects = allProducts.filter(
    (p) =>
      !slugLooksLikeTest(p.slug) && FIXTURE_NAME_PREFIXES.some((pre) => p.name.startsWith(pre)),
  );

  console.log(`Productos fixture detectados por slug: ${junkProducts.length}`);
  const kept = [];
  let hardProducts = 0;
  const totals = { cartItems: 0, inventoryLogs: 0, designs: 0, products: 0 };

  for (const p of junkProducts) {
    const variants = await prisma.productVariant.findMany({
      where: { productId: p.id },
      select: { id: true },
    });
    const vids = variants.map((v) => v.id);
    const inOrder = vids.length
      ? await prisma.orderItem.count({ where: { variantId: { in: vids } } })
      : 0;

    if (inOrder > 0) {
      console.log(
        `  ~ ${p.slug} → ${inOrder} orderItem(s) referencian sus variantes → SE QUEDA soft-deleted (preserva órdenes)`,
      );
      kept.push(p.slug);
      continue;
    }

    console.log(
      `  ⊘ ${p.slug} (cat ${p.category.slug}, ${vids.length} var, ${p.deletedAt ? "archivado" : "vivo-inactivo"}) → HARD-DELETE`,
    );
    if (APPLY) {
      const t = await prisma.$transaction(async (tx) => {
        const cartItems = await tx.cartItem.deleteMany({
          where: {
            OR: [{ variant: { productId: p.id } }, { design: { productId: p.id } }],
          },
        });
        const inventoryLogs = vids.length
          ? await tx.inventoryLog.deleteMany({ where: { variantId: { in: vids } } })
          : { count: 0 };
        const designs = await tx.design.deleteMany({ where: { productId: p.id } });
        await tx.product.delete({ where: { id: p.id } });
        return {
          cartItems: cartItems.count,
          inventoryLogs: inventoryLogs.count,
          designs: designs.count,
        };
      });
      totals.cartItems += t.cartItems;
      totals.inventoryLogs += t.inventoryLogs;
      totals.designs += t.designs;
      totals.products += 1;
    }
    hardProducts++;
  }

  // ── 1b. Catálogo VIEJO de negocio archivado (opt-in) ───────────────────────
  // Con --include-archived-business: productos archivados que NO son fixtures
  // (packs temáticos, versiones anteriores del catálogo). Misma regla: con
  // pedidos se quedan archivados (FK Restrict + historial de órdenes).
  if (INCLUDE_ARCHIVED_BUSINESS) {
    const archivedBusiness = allProducts.filter((p) => p.deletedAt && !slugLooksLikeTest(p.slug));
    console.log(`\nCatálogo viejo archivado (no-fixture): ${archivedBusiness.length}`);
    for (const p of archivedBusiness) {
      const variants = await prisma.productVariant.findMany({
        where: { productId: p.id },
        select: { id: true },
      });
      const vids = variants.map((v) => v.id);
      const inOrder = vids.length
        ? await prisma.orderItem.count({ where: { variantId: { in: vids } } })
        : 0;
      if (inOrder > 0) {
        console.log(
          `  ~ ${p.slug} → ${inOrder} orderItem(s) → SE QUEDA archivado (preserva órdenes)`,
        );
        continue;
      }
      console.log(`  ⊘ ${p.slug} (${vids.length} var, archivado) → HARD-DELETE`);
      if (APPLY) {
        const t = await prisma.$transaction(async (tx) => {
          const cartItems = await tx.cartItem.deleteMany({
            where: {
              OR: [{ variant: { productId: p.id } }, { design: { productId: p.id } }],
            },
          });
          const inventoryLogs = vids.length
            ? await tx.inventoryLog.deleteMany({ where: { variantId: { in: vids } } })
            : { count: 0 };
          const designs = await tx.design.deleteMany({ where: { productId: p.id } });
          await tx.product.delete({ where: { id: p.id } });
          return {
            cartItems: cartItems.count,
            inventoryLogs: inventoryLogs.count,
            designs: designs.count,
          };
        });
        totals.cartItems += t.cartItems;
        totals.inventoryLogs += t.inventoryLogs;
        totals.designs += t.designs;
        totals.products += 1;
      }
      hardProducts++;
    }
  }

  // ── 2. Categorías fixture (archivadas o vivas) ─────────────────────────────
  const allCats = await prisma.category.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      deletedAt: true,
      parentId: true,
      _count: { select: { products: true } },
    },
  });
  const junkCats = allCats.filter((c) => slugLooksLikeTest(c.slug));
  console.log(`\nCategorías fixture detectadas por slug: ${junkCats.length}`);

  let hardCats = 0;
  const junkCatIds = new Set(junkCats.map((c) => c.id));
  // Hijas primero (parentId Restrict): una categoría fixture cuyo padre también es fixture va antes.
  const ordered = [...junkCats].sort((a, b) => {
    const aChild = a.parentId && junkCatIds.has(a.parentId) ? 0 : 1;
    const bChild = b.parentId && junkCatIds.has(b.parentId) ? 0 : 1;
    return aChild - bChild;
  });

  for (const c of ordered) {
    // Re-contar productos tras el purgado (pueden haber quedado en 0).
    const prodCount = APPLY
      ? await prisma.product.count({ where: { categoryId: c.id } })
      : c._count.products;
    if (prodCount > 0) {
      console.log(
        `  ~ ${c.name} (/${c.slug}) → aún tiene ${prodCount} producto(s) referenciándola → NO se borra (revisar)`,
      );
      continue;
    }
    console.log(`  ⊘ ${c.name} (/${c.slug}) ${c.deletedAt ? "archivada" : "viva"} → HARD-DELETE`);
    if (APPLY) {
      await prisma.category.delete({ where: { id: c.id } });
    }
    hardCats++;
  }

  // ── 3. Categorías de negocio a retirar (animales/frutas) ───────────────────
  console.log(
    `\nCategorías retiradas por decisión de negocio: ${BUSINESS_CATS_TO_REMOVE.join(", ")}`,
  );
  let bizRemoved = 0;
  for (const slug of BUSINESS_CATS_TO_REMOVE) {
    const cat = await prisma.category.findUnique({
      where: { slug },
      select: { id: true, name: true, deletedAt: true, _count: { select: { products: true } } },
    });
    if (!cat) {
      console.log(`  - ${slug}: no existe → nada que hacer`);
      continue;
    }
    if (cat._count.products > 0) {
      console.log(
        `  ⚠ ${slug} ("${cat.name}") tiene ${cat._count.products} producto(s) → NO se toca (esperaba vacía)`,
      );
      continue;
    }
    console.log(
      `  ⊘ ${slug} ("${cat.name}") vacía ${cat.deletedAt ? "(ya archivada) " : ""}→ HARD-DELETE`,
    );
    if (APPLY) {
      await prisma.category.delete({ where: { id: cat.id } });
    }
    bizRemoved++;
  }

  // ── 4. Sospechosos por nombre (slug no-fixture) — SOLO REPORTE ─────────────
  if (nameSuspects.length > 0) {
    console.log(
      `\n⚠ Sospechosos por NOMBRE (slug sin patrón de test) — NO tocados, revisar a mano:`,
    );
    for (const p of nameSuspects) console.log(`  ? ${p.name} (/${p.slug}, cat ${p.category.slug})`);
  } else {
    console.log(`\nSospechosos por nombre (slug no-fixture): ninguno ✓`);
  }

  // ── Resumen ────────────────────────────────────────────────────────────────
  console.log(
    `\n${APPLY ? "APLICADO" : "DRY-RUN (sin cambios)"} · productos hard-delete: ${hardProducts} · categorías test hard-delete: ${hardCats} · categorías negocio: ${bizRemoved} · productos preservados por órdenes: ${kept.length}`,
  );
  if (APPLY) console.log("Filas borradas:", JSON.stringify(totals));
  if (!APPLY) console.log("Para ejecutar: node scripts/purge-archived-test-junk.mjs --apply");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
