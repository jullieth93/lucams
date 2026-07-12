/*
 * Limpieza de FIXTURES DE TESTS filtrados a la BD de dev compartida (2026-07-12).
 *
 * Los tests de integración crean categorías `Category { name: "Cat <runId>" }` con productos
 * (`Simple <run>`, `Perso <run>`, `Name <run>`, checkout…). Cuando el `afterAll` falla a mitad
 * (FK/timeout), quedan huérfanos y aparecen en storefront/admin. Este script los detecta y borra
 * de forma SEGURA y SCOPED — nunca toca categorías reales.
 *
 * Detección (defensiva, doble condición): name empieza con "Cat " Y el slug parece de test
 * (termina en "-cat" y arranca con un prefijo de run conocido: cart/chk/e2e/cms/cons/rls/prod).
 *
 * Seguridad: antes de hard-delete de una categoría, verifica que NINGUNA de sus variantes esté
 * referenciada por un OrderItem (FK Restrict). Si alguna lo está (orden de test que quedó),
 * NO la borra en duro: la SOFT-DELETE (deletedAt) para que desaparezca de las vistas sin romper
 * la integridad de órdenes. Reporta ambos casos.
 *
 * Uso:
 *   node scripts/cleanup-test-junk.mjs            # DRY-RUN: solo lista qué haría
 *   node scripts/cleanup-test-junk.mjs --apply    # ejecuta el borrado
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const RUN_PREFIXES = ["cart", "chk", "e2e", "cms", "cons", "rls", "prod", "cat"];
const slugLooksLikeTest = (slug) =>
  /-cat$/.test(slug) && RUN_PREFIXES.some((p) => slug.startsWith(p));

async function main() {
  const candidates = await prisma.category.findMany({
    where: { deletedAt: null, name: { startsWith: "Cat " } },
    select: { id: true, name: true, slug: true, _count: { select: { products: true } } },
    orderBy: { createdAt: "asc" },
  });
  const junk = candidates.filter((c) => slugLooksLikeTest(c.slug));

  console.log(`Candidatas "Cat …": ${candidates.length} · confirmadas como test: ${junk.length}`);
  if (junk.length === 0) {
    console.log("Nada que limpiar. ✓");
    return;
  }

  let hardCats = 0;
  let softCats = 0;
  const totals = { cartItems: 0, designs: 0, ocasionTags: 0, reviews: 0, inventoryLogs: 0, variants: 0, products: 0 };

  for (const cat of junk) {
    const products = await prisma.product.findMany({ where: { categoryId: cat.id }, select: { id: true } });
    const pids = products.map((p) => p.id);
    const variants = await prisma.productVariant.findMany({ where: { productId: { in: pids } }, select: { id: true } });
    const vids = variants.map((v) => v.id);

    // ¿Alguna variante en una orden? (FK Restrict → no se puede hard-delete)
    const inOrder = vids.length
      ? await prisma.orderItem.count({ where: { variantId: { in: vids } } })
      : 0;

    if (inOrder > 0) {
      console.log(`  ~ ${cat.name} (/${cat.slug}) → ${inOrder} orderItem(s) → SOFT-DELETE (preserva órdenes)`);
      if (APPLY) {
        await prisma.product.updateMany({ where: { categoryId: cat.id }, data: { deletedAt: new Date(), isActive: false } });
        await prisma.category.update({ where: { id: cat.id }, data: { deletedAt: new Date() } });
      }
      softCats++;
      continue;
    }

    console.log(`  ⊘ ${cat.name} (/${cat.slug}) → prods=${pids.length} vars=${vids.length} → HARD-DELETE`);
    if (APPLY) {
      totals.cartItems += (await prisma.cartItem.deleteMany({ where: { OR: [{ variant: { productId: { in: pids } } }, { design: { productId: { in: pids } } }] } })).count;
      totals.designs += (await prisma.design.deleteMany({ where: { productId: { in: pids } } })).count;
      for (const [key, fn] of [
        ["ocasionTags", () => prisma.productOcasionTag.deleteMany({ where: { productId: { in: pids } } })],
        ["reviews", () => prisma.productReview.deleteMany({ where: { productId: { in: pids } } })],
        // Referencias a VARIANTE que bloquean su borrado (los checkout tests las crean):
        ["inventoryLogs", () => prisma.inventoryLog.deleteMany({ where: { variantId: { in: vids } } })],
      ]) {
        try { totals[key] = (totals[key] ?? 0) + (await fn()).count; } catch { /* modelo/relación ausente → ignorar */ }
      }
      totals.variants += (await prisma.productVariant.deleteMany({ where: { productId: { in: pids } } })).count;
      totals.products += (await prisma.product.deleteMany({ where: { id: { in: pids } } })).count;
      await prisma.category.delete({ where: { id: cat.id } });
    }
    hardCats++;
  }

  console.log(`\n${APPLY ? "APLICADO" : "DRY-RUN (sin cambios)"} · hard-delete: ${hardCats} cats · soft-delete: ${softCats} cats`);
  if (APPLY) console.log("Filas borradas:", JSON.stringify(totals));
  if (!APPLY) console.log("Para ejecutar: node scripts/cleanup-test-junk.mjs --apply");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
