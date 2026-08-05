import { PrismaClient } from "@lucams/db";
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
// Guarda de ambiente compartida con los scripts destructivos de packages/db
// (packages/db/scripts/lib/env-guard.mjs — ver su header: qué permite/bloquea y el
// escape hatch LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1).
import { checkDestructiveAllowed } from "../../../packages/db/scripts/lib/env-guard.mjs";

/**
 * Global teardown para la suite de vitest.
 *
 * Problema: los tests de integración crean productos, categorías, ocasiones,
 * variantes, etc. con slugs que incluyen timestamps o prefijos de test. Muchos
 * tests limpian su propio `RUN`, pero otros no, y bajo concurrencia/flakes los
 * afterAll fallan y dejan basura.
 *
 * Solución: después de TODA la suite, purga suave POR PATRÓN DE TEST — solo
 * entidades cuyo slug/email/número contiene un run-id (timestamp de 13+ dígitos
 * embebido) o un prefijo de test conocido. El catálogo sembrado NUNCA se toca.
 *
 * HISTORIA (por qué era distinto): antes dev y prod COMPARTÍAN la DB, así que
 * la fase de catálogo borraba todo lo que no estuviera en una whitelist de
 * slugs reales — eso protegía el catálogo real pero destruía el catálogo
 * sembrado en ambientes segregados. Desde 2026-08-01 los ambientes están
 * segregados (LOCAL podman / STG cloud / PRD cloud) y además hay guarda de
 * ambiente (env-guard.mjs) que bloquea PRD → el criterio correcto y UNIFORME
 * en local/stg es "solo patrones de test", idéntico al de la fase transaccional.
 *
 * FIX 2026-07-28 — la red estaba rota en corridas LOCALES: el teardown corre en
 * el proceso PRINCIPAL de vitest (globalSetup), pero `.env.local` se cargaba en
 * `setup-env.ts`, que es un setupFile y solo corre en los WORKERS. Resultado:
 * el proceso del teardown nunca veía DATABASE_URL/DIRECT_URL, se saltaba la
 * limpieza ("se omite limpieza") y la basura de tests se acumulaba en la BD
 * compartida hasta volverse visible en lucamsshop.com/productos (categorías
 * "Cat cart…", ocasiones "itestoca…", "Ocasión Base" ×N). Acá el teardown carga
 * el env él mismo (sin pisar vars ya inyectadas por la shell/CI).
 */

export async function setup() {
  // No-op: el env que este proceso necesita lo carga teardown() directamente
  // (los setupFiles solo corren en los workers, no acá).
}

export async function teardown() {
  // El entorno CI inyecta DATABASE_URL/DIRECT_URL; en local hay que cargar .env.local
  // ACÁ MISMO (ver nota del encabezado: los setupFiles no corren en este proceso).
  // dotenv no pisa vars ya definidas → la shell/CI siempre mandan.
  for (const envPath of [
    resolve(__dirname, "../.env.local"),
    resolve(__dirname, "../../../.env.local"),
  ]) {
    if (existsSync(envPath)) {
      config({ path: envPath });
      break;
    }
  }
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.warn("[vitest teardown] DIRECT_URL/DATABASE_URL no disponible; se omite limpieza.");
    return;
  }

  // Guarda de ambiente (2026-08-01): este teardown borra datos — contra PRD sería
  // un incidente. Si la guarda bloquea, se OMITE la limpieza con warn (NO se falla
  // la suite; es un safety net, igual que el catch de abajo).
  const guard = checkDestructiveAllowed();
  if (!guard.allowed) {
    console.warn(`[vitest teardown] Limpieza OMITIDA por guarda de ambiente: ${guard.reason}`);
    return;
  }
  if (guard.bypassed) {
    console.warn(`[vitest teardown] ${guard.reason}`);
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    // Fase 1 — catálogo de TEST solamente (2026-08-04, ambientes segregados):
    // un slug es de test si contiene un run-id (timestamp de 13+ dígitos
    // seguidos — todos los RUN de la suite llevan Date.now()) o un prefijo de
    // test conocido. El catálogo sembrado jamás cumple esos patrones → seguro.
    const TEST_SLUG = "[0-9]{13,}";
    const [products, categories, ocasiones] = await Promise.all([
      prisma.$executeRaw`UPDATE "Product" SET "deletedAt" = NOW(), "isActive" = false, "updatedAt" = NOW()
        WHERE "deletedAt" IS NULL AND (
          slug ~ ${TEST_SLUG} OR slug ILIKE 'test-%' OR slug ILIKE 'itest%')`,
      prisma.$executeRaw`UPDATE "Category" SET "deletedAt" = NOW(), "isActive" = false, "updatedAt" = NOW()
        WHERE "deletedAt" IS NULL AND (
          slug ~ ${TEST_SLUG} OR slug ILIKE 'test-%' OR slug ILIKE 'itest%')`,
      prisma.$executeRaw`UPDATE "OcasionTag" SET "deletedAt" = NOW(), "isActive" = false
        WHERE "deletedAt" IS NULL AND (
          slug ~ ${TEST_SLUG} OR slug ILIKE 'test-%' OR slug ILIKE 'itest%')`,
    ]);

    const variants =
      await prisma.$executeRaw`UPDATE "ProductVariant" SET "deletedAt" = NOW(), "isActive" = false, "updatedAt" = NOW()
      WHERE "deletedAt" IS NULL AND (
        sku ~ ${TEST_SLUG} OR "productId" IN (SELECT id FROM "Product" WHERE slug ~ ${TEST_SLUG}))`;

    const templates =
      await prisma.$executeRaw`UPDATE "PersonalizationTemplate" SET "deletedAt" = NOW(), "isActive" = false, "updatedAt" = NOW()
      WHERE "deletedAt" IS NULL AND (
        slug ~ ${TEST_SLUG} OR "productId" IN (SELECT id FROM "Product" WHERE slug ~ ${TEST_SLUG}))`;

    // ─────────────────────────────────────────────────────────────────────
    // Fase 2 de la red (2026-07-28) — basura TRANSACCIONAL de tests. La red
    // original solo cubría catálogo; los tests de orders/checkout/coupons/
    // customers/reviews/quotes/retracts dejaban residuos que el admin mostraba
    // como pedidos/clientes/cupones fantasmas (caso real: "20 pedidos
    // pendientes" en el dashboard, todos de corridas de integración).
    //
    // Patrón de run-id: timestamp ms + random = 15+ dígitos seguidos. Los
    // números/correos reales NUNCA lo cumplen (LCM-2026-0146, gmail, 10 díg.
    // de teléfono) → el regex es seguro contra data real. Soft-delete donde
    // el modelo lo soporta (mismo criterio recuperable del catálogo);
    // hard-delete en modelos sin deletedAt (ledger/pivotes de pedidos test).
    // ─────────────────────────────────────────────────────────────────────
    const RUN_ID = "[0-9]{15,}";
    const [
      ordersTest,
      customersTest,
      couponsTest,
      reviewsTest,
      quotesTest,
      designsTest,
      tilesTest,
      setsTest,
      codTest,
      retractsTest,
    ] = await Promise.all([
      prisma.$executeRaw`UPDATE "Order" SET "deletedAt" = NOW(), "updatedAt" = NOW()
        WHERE "deletedAt" IS NULL AND (number ~ ${RUN_ID} OR number LIKE 'TEST%')`,
      prisma.$executeRaw`UPDATE "Customer" SET "deletedAt" = NOW(), "updatedAt" = NOW()
        WHERE "deletedAt" IS NULL AND (
          email ILIKE '%@lucams.test' OR email ILIKE '%@cust.test'
          OR email ILIKE '%@consent.test' OR email ILIKE '%@test.local'
          OR email ILIKE 'itest%' OR email LIKE 'test+%@example.com'
          OR email ~ ${RUN_ID})`,
      prisma.$executeRaw`UPDATE "Coupon" SET "isActive" = false
        WHERE "isActive" = true AND code ~ ${RUN_ID}`,
      prisma.$executeRaw`UPDATE "Review" SET "deletedAt" = NOW(), "updatedAt" = NOW()
        WHERE "deletedAt" IS NULL AND comment ~ ${RUN_ID}`,
      prisma.$executeRaw`UPDATE "Quote" SET "deletedAt" = NOW(), "updatedAt" = NOW()
        WHERE "deletedAt" IS NULL AND (
          "customerName" ILIKE 'itest%' OR "customerEmail" ILIKE '%.test'
          OR "customerEmail" ILIKE 'itest%')`,
      prisma.$executeRaw`DELETE FROM "Design" WHERE "sessionId" ILIKE 'test-%'`,
      prisma.$executeRaw`DELETE FROM "LetterTile" WHERE "setId" IN
        (SELECT id FROM "LetterTileSet" WHERE name LIKE 'TEST %')`,
      prisma.$executeRaw`DELETE FROM "LetterTileSet" WHERE name LIKE 'TEST %'`,
      prisma.$executeRaw`DELETE FROM "CodReconciliation" WHERE "orderId" IN
        (SELECT id FROM "Order" WHERE number ~ ${RUN_ID})`,
      prisma.$executeRaw`DELETE FROM "RetractRequest" WHERE "orderItemId" IN
        (SELECT oi.id FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
         WHERE o.number ~ ${RUN_ID})`,
    ]);

    console.log(
      `[vitest teardown] Limpieza (solo patrones de test): ${products} productos, ${categories} categorías, ${ocasiones} ocasiones, ${variants} variantes, ${templates} plantillas. ` +
        `Transaccional: ${ordersTest} pedidos, ${customersTest} clientes, ${couponsTest} cupones, ` +
        `${reviewsTest} reseñas, ${quotesTest} cotizaciones, ${designsTest} diseños, ` +
        `${setsTest} sets fichas (+${tilesTest} fichas), ${codTest} ledger COD, ${retractsTest} retractos.`,
    );
  } catch (err) {
    console.error("[vitest teardown] Error limpiando DB:", err);
    // No fallamos la suite por un error de limpieza; es un safety net.
  } finally {
    await prisma.$disconnect();
  }
}
