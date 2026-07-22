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
 * También barre AdminUser residuales de los tests de MFA (supabaseUserId 'mfaitest_*' /
 * email '*@lucams.test'), que una corrida interrumpida deja como SUPERADMIN activos (audit v3 #20).
 * El admin REAL no usa @lucams.test, así que el filtro nunca lo toca.
 *
 * Uso:
 *   node scripts/cleanup-test-junk.mjs            # DRY-RUN: solo lista qué haría
 *   node scripts/cleanup-test-junk.mjs --apply    # ejecuta el borrado
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

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
];
// Señal robusta de fixture: el slug lleva un epoch de 13 dígitos (Date.now() del
// RUN) y un prefijo de test conocido. Antes exigía name "Cat …" + sufijo "-cat",
// pero los tests nuevos usan slugs `prod<ts>-lp-page-<rand>`, nombres
// `prod<ts>-ZZZ-cat`, `Beta cat<ts>`, etc. — la basura de 2026-07 no se detectaba.
const slugLooksLikeTest = (slug) =>
  /1[0-9]{12}/.test(slug) && RUN_PREFIXES.some((p) => slug.startsWith(p));

async function main() {
  // Candidatas: cualquier categoría cuyo slug parezca fixture (el name ya no se
  // exige "Cat …" — los tests usan `prod<ts>-ZZZ-cat`, `Beta cat<ts>`, etc.).
  const candidates = await prisma.category.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, slug: true, _count: { select: { products: true } } },
    orderBy: { createdAt: "asc" },
  });
  const junk = candidates.filter((c) => slugLooksLikeTest(c.slug));

  console.log(`Categorías vivas: ${candidates.length} · confirmadas como test: ${junk.length}`);
  if (junk.length === 0) {
    console.log("Nada que limpiar. ✓");
    return;
  }

  let hardCats = 0;
  let softCats = 0;
  const totals = {
    cartItems: 0,
    designs: 0,
    ocasionTags: 0,
    reviews: 0,
    inventoryLogs: 0,
    variants: 0,
    products: 0,
  };

  for (const cat of junk) {
    const products = await prisma.product.findMany({
      where: { categoryId: cat.id },
      select: { id: true },
    });
    const pids = products.map((p) => p.id);
    const variants = await prisma.productVariant.findMany({
      where: { productId: { in: pids } },
      select: { id: true },
    });
    const vids = variants.map((v) => v.id);

    // ¿Alguna variante en una orden? (FK Restrict → no se puede hard-delete)
    const inOrder = vids.length
      ? await prisma.orderItem.count({ where: { variantId: { in: vids } } })
      : 0;

    if (inOrder > 0) {
      console.log(
        `  ~ ${cat.name} (/${cat.slug}) → ${inOrder} orderItem(s) → SOFT-DELETE (preserva órdenes)`,
      );
      if (APPLY) {
        await prisma.product.updateMany({
          where: { categoryId: cat.id },
          data: { deletedAt: new Date(), isActive: false },
        });
        await prisma.category.update({ where: { id: cat.id }, data: { deletedAt: new Date() } });
      }
      softCats++;
      continue;
    }

    console.log(
      `  ⊘ ${cat.name} (/${cat.slug}) → prods=${pids.length} vars=${vids.length} → HARD-DELETE`,
    );
    if (APPLY) {
      totals.cartItems += (
        await prisma.cartItem.deleteMany({
          where: {
            OR: [{ variant: { productId: { in: pids } } }, { design: { productId: { in: pids } } }],
          },
        })
      ).count;
      totals.designs += (
        await prisma.design.deleteMany({ where: { productId: { in: pids } } })
      ).count;
      for (const [key, fn] of [
        [
          "ocasionTags",
          () => prisma.productOcasionTag.deleteMany({ where: { productId: { in: pids } } }),
        ],
        ["reviews", () => prisma.productReview.deleteMany({ where: { productId: { in: pids } } })],
        // Referencias a VARIANTE que bloquean su borrado (los checkout tests las crean):
        [
          "inventoryLogs",
          () => prisma.inventoryLog.deleteMany({ where: { variantId: { in: vids } } }),
        ],
      ]) {
        try {
          totals[key] = (totals[key] ?? 0) + (await fn()).count;
        } catch {
          /* modelo/relación ausente → ignorar */
        }
      }
      totals.variants += (
        await prisma.productVariant.deleteMany({ where: { productId: { in: pids } } })
      ).count;
      totals.products += (await prisma.product.deleteMany({ where: { id: { in: pids } } })).count;
      await prisma.category.delete({ where: { id: cat.id } });
    }
    hardCats++;
  }

  console.log(
    `\n${APPLY ? "APLICADO" : "DRY-RUN (sin cambios)"} · hard-delete: ${hardCats} cats · soft-delete: ${softCats} cats`,
  );
  if (APPLY) console.log("Filas borradas:", JSON.stringify(totals));

  // #20 (audit v3) — AdminUser residuales de tests de MFA. El test crea usuarios con
  // supabaseUserId 'mfaitest_*' / email '*@lucams.test'; una corrida interrumpida los deja
  // vivos (SUPERADMIN activos) en la BD compartida. El admin REAL no usa @lucams.test, así que
  // el filtro nunca lo toca. AdminRecoveryCode cae por Cascade.
  const adminJunkWhere = {
    OR: [{ supabaseUserId: { startsWith: "mfaitest_" } }, { email: { endsWith: "@lucams.test" } }],
  };
  const adminJunk = await prisma.adminUser.count({ where: adminJunkWhere });
  console.log(`\nAdminUser residuales de test (mfaitest_ / @lucams.test): ${adminJunk}`);
  if (adminJunk > 0 && APPLY) {
    const { count } = await prisma.adminUser.deleteMany({ where: adminJunkWhere });
    console.log(`  → borrados: ${count}`);
  }

  // Nota: los e2e-mfa-*@example.com también dejan filas en auth.users de Supabase, cuya purga
  // requiere el service client de Supabase (fuera del alcance Prisma-only de este script).
  const e2eResidual = await prisma.adminUser.count({
    where: { email: { startsWith: "e2e-mfa-" } },
  });
  if (e2eResidual > 0) {
    console.log(
      `⚠ ${e2eResidual} AdminUser e2e-mfa-*@example.com: purga con el service client de Supabase (auth.users), no cubierto aquí.`,
    );
  }

  if (!APPLY) console.log("\nPara ejecutar: node scripts/cleanup-test-junk.mjs --apply");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
