import { PrismaClient } from "@lucams/db";
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Global teardown para la suite de vitest.
 *
 * Problema: los tests de integración crean productos, categorías, ocasiones,
 * variantes, etc. con slugs que incluyen timestamps o prefijos de test. Muchos
 * tests limpian su propio `RUN`, pero otros no, y bajo concurrencia/flakes los
 * afterAll fallan y dejan basura. Esa basura acaba en el catálogo público y
 * rompe los e2e / la experiencia de producción.
 *
 * Solución mínima: después de TODA la suite de vitest, conectamos a la misma
 * DB y purgamos suavemente todo lo que no sea parte del catálogo real. Así
 * los tests de integración pueden seguir usando la DB compartida sin dejar
 * residuos peligrosos para la rama `catalogo-whatsapp`.
 *
 * NOTA: esto NO sustituye a una DB de test dedicada (ideal). Es una red de
 * seguridad mientras no exista staging/test separado (ver vitest.config.ts).
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

const REAL_PRODUCT_SLUGS = [
  "abecedario-completo",
  "set-fotoimanes-cuadrados",
  "set-fotoimanes-polaroid",
  "set-fotoimanes-circulares",
  "set-fotoimanes-corazon",
  "calendario-mes-a-mes-fotos",
  "nombre-personalizado",
  "pack-vocales",
  "tiras-magneticas-fotos",
  "separadores-alargados",
  "separadores-magneticos",
  "pack-separadores-libros",
];

const REAL_CATEGORY_SLUGS = [
  "foto-imanes",
  "calendarios",
  "separadores",
  "juegos-aprendizaje",
];

const REAL_OCASION_SLUGS = [
  "cumpleanos",
  "matrimonio",
  "bautizo",
  "baby-shower",
  "grado",
  "quinceanera",
  "aniversario",
  "dia-madre",
  "dia-padre",
  "dia-nino",
  "amor-y-amistad",
  "halloween",
  "navidad",
  "ano-nuevo",
  "empresarial",
  "para-mi-mismo",
];

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

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const [products, categories, ocasiones] = await Promise.all([
      prisma.product.updateMany({
        where: {
          deletedAt: null,
          slug: { notIn: REAL_PRODUCT_SLUGS },
        },
        data: { isActive: false, deletedAt: new Date(), updatedAt: new Date() },
      }),
      prisma.category.updateMany({
        where: {
          deletedAt: null,
          slug: { notIn: REAL_CATEGORY_SLUGS },
        },
        data: { isActive: false, deletedAt: new Date(), updatedAt: new Date() },
      }),
      prisma.ocasionTag.updateMany({
        where: {
          deletedAt: null,
          slug: { notIn: REAL_OCASION_SLUGS },
        },
        data: { isActive: false, deletedAt: new Date(), updatedAt: new Date() },
      }),
    ]);

    await prisma.productVariant.updateMany({
      where: {
        deletedAt: null,
        product: { slug: { notIn: REAL_PRODUCT_SLUGS } },
      },
      data: { isActive: false, deletedAt: new Date(), updatedAt: new Date() },
    });

    await prisma.personalizationTemplate.updateMany({
      where: {
        deletedAt: null,
        product: { slug: { notIn: REAL_PRODUCT_SLUGS } },
      },
      data: { isActive: false, deletedAt: new Date(), updatedAt: new Date() },
    });

    console.log(
      `[vitest teardown] Limpieza: ${products.count} productos, ${categories.count} categorías, ${ocasiones.count} ocasiones.`,
    );
  } catch (err) {
    console.error("[vitest teardown] Error limpiando DB:", err);
    // No fallamos la suite por un error de limpieza; es un safety net.
  } finally {
    await prisma.$disconnect();
  }
}
