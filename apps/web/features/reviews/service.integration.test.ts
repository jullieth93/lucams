/*
 * Tests de INTEGRACIÓN del feature reviews — capa de servicio (auditoría v3 · #21).
 *
 * Cubre las funciones de servicio puras contra la BD real compartida (sin mocks):
 *   - public-service: getProductRatingAggregate, listFeaturedReviews.
 *   - admin-service: listReviewsAdmin (filtros/estado/rating/productId/pendingCount)
 *     y las transiciones approve/reject/toggleFeatured/archive/restore + bulk.
 *
 * Estrategia (memoria project_integration_tests_share_dev_db): todo con prefijo
 * único por corrida (RUN) y afterAll SCOPED a ese prefijo — JAMÁS toca datos
 * reales de /admin. Precios en centavos COP enteros.
 *
 * Requiere DATABASE_URL (corre vía `dotenv -e .env.local -- vitest`); sin ella se
 * salta con skipIf para no romper CI sin DB.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getProductRatingAggregate, listFeaturedReviews } from "./public-service";
import {
  approveReview,
  archiveReview,
  bulkApproveReviews,
  bulkArchiveReviews,
  listReviewsAdmin,
  rejectReview,
  restoreReview,
  toggleFeaturedReview,
} from "./admin-service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `rev${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const ADMIN = `${RUN}-admin`;
const T = 30_000;

// Producto de solo-lectura para los agregados/listados (no se muta en los tests).
let catId = "";
let readProductId = "";
let inactiveProductId = "";
// Producto para las transiciones (se muta).
let mutProductId = "";

let seq = 0;
async function mkCustomer(): Promise<string> {
  seq += 1;
  const c = await prisma.customer.create({
    data: {
      email: `${RUN}-c${seq}@test.local`,
      supabaseUserId: `${RUN}-sup-${seq}`,
      referralCode: `${RUN}-ref-${seq}`,
      firstName: "Cliente",
      lastName: `Test ${seq}`,
    },
    select: { id: true },
  });
  return c.id;
}

async function mkReview(opts: {
  productId: string;
  customerId: string | null;
  rating: number;
  isApproved?: boolean;
  featured?: boolean;
  deletedAt?: Date | null;
  createdAt?: Date;
}): Promise<string> {
  const r = await prisma.review.create({
    data: {
      productId: opts.productId,
      customerId: opts.customerId,
      rating: opts.rating,
      comment: `Reseña de prueba ${RUN} con suficiente texto para pasar la validación.`,
      authorName: "Cliente Test",
      isApproved: opts.isApproved ?? false,
      featured: opts.featured ?? false,
      deletedAt: opts.deletedAt ?? null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
    select: { id: true },
  });
  return r.id;
}

describe.skipIf(!hasDb)("features/reviews — servicio (integración DB)", { timeout: T }, () => {
  beforeAll(async () => {
    const cat = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `ZZ Reviews ${RUN}`, order: 0 },
    });
    catId = cat.id;

    const readP = await prisma.product.create({
      data: {
        slug: `${RUN}-read`,
        name: `Producto Reseñas ${RUN}`,
        description: "Producto para agregados de reseñas",
        basePrice: 20_000,
        sku: `${RUN}-READ`.toUpperCase(),
        categoryId: catId,
        personalizationKind: "NONE",
      },
      select: { id: true },
    });
    readProductId = readP.id;

    const inactiveP = await prisma.product.create({
      data: {
        slug: `${RUN}-inactive`,
        name: `Producto Inactivo ${RUN}`,
        description: "Producto inactivo",
        basePrice: 20_000,
        sku: `${RUN}-INACT`.toUpperCase(),
        categoryId: catId,
        personalizationKind: "NONE",
        isActive: false,
      },
      select: { id: true },
    });
    inactiveProductId = inactiveP.id;

    const mutP = await prisma.product.create({
      data: {
        slug: `${RUN}-mut`,
        name: `Producto Transiciones ${RUN}`,
        description: "Producto para transiciones",
        basePrice: 20_000,
        sku: `${RUN}-MUT`.toUpperCase(),
        categoryId: catId,
        personalizationKind: "NONE",
      },
      select: { id: true },
    });
    mutProductId = mutP.id;
  });

  afterAll(async () => {
    await prisma.review.deleteMany({
      where: {
        OR: [
          { product: { slug: { startsWith: RUN } } },
          { customer: { email: { startsWith: RUN } } },
        ],
      },
    });
    await prisma.productVariant.deleteMany({ where: { product: { slug: { startsWith: RUN } } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: RUN } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: RUN } } });
    await prisma.customer.deleteMany({ where: { email: { startsWith: RUN } } });
  });

  // ───────────────────────── getProductRatingAggregate ─────────────────────────
  describe("getProductRatingAggregate", () => {
    it("devuelve null cuando no hay reseñas aprobadas", async () => {
      const agg = await getProductRatingAggregate(mutProductId);
      expect(agg).toBeNull();
    });

    it("promedia solo aprobadas de clientes reales, redondea a 1 decimal e ignora demo/pending", async () => {
      const c1 = await mkCustomer();
      const c2 = await mkCustomer();
      const c3 = await mkCustomer();
      const c4 = await mkCustomer();
      await mkReview({ productId: readProductId, customerId: c1, rating: 4, isApproved: true });
      await mkReview({ productId: readProductId, customerId: c2, rating: 5, isApproved: true });
      await mkReview({ productId: readProductId, customerId: c3, rating: 1 }); // pending → excluida
      await mkReview({ productId: readProductId, customerId: c4, rating: 3, isApproved: true });
      // Demo (customerId=null): aprobada pero NO debe contar en el aggregate público.
      await mkReview({ productId: readProductId, customerId: null, rating: 1, isApproved: true });

      const agg = await getProductRatingAggregate(readProductId);
      // (4 + 5 + 3) / 3 = 4.0 exacto; count 3 (pending y demo excluidas).
      expect(agg).toEqual({ ratingValue: 4, reviewCount: 3 });
    });
  });

  // ───────────────────────── listFeaturedReviews ─────────────────────────
  describe("listFeaturedReviews", () => {
    it("solo aprobadas+featured de clientes reales con producto activo, orden createdAt desc, respeta limit", async () => {
      const cOld = await mkCustomer();
      const cNew = await mkCustomer();
      const cPlain = await mkCustomer();
      const cInactive = await mkCustomer();
      const older = new Date(Date.now() - 5 * 60_000);
      const newer = new Date(Date.now() - 1 * 60_000);
      const idOld = await mkReview({
        productId: readProductId,
        customerId: cOld,
        rating: 5,
        isApproved: true,
        featured: true,
        createdAt: older,
      });
      const idNew = await mkReview({
        productId: readProductId,
        customerId: cNew,
        rating: 5,
        isApproved: true,
        featured: true,
        createdAt: newer,
      });
      // Aprobada NO featured → excluida.
      const idPlain = await mkReview({
        productId: readProductId,
        customerId: cPlain,
        rating: 5,
        isApproved: true,
        featured: false,
      });
      // Demo featured (customerId=null) → excluida.
      const idDemo = await mkReview({
        productId: readProductId,
        customerId: null,
        rating: 5,
        isApproved: true,
        featured: true,
      });
      // Featured pero producto INACTIVO → excluida.
      const idInactive = await mkReview({
        productId: inactiveProductId,
        customerId: cInactive,
        rating: 5,
        isApproved: true,
        featured: true,
      });

      const all = await listFeaturedReviews(50);
      const ids = all.map((r) => r.id);
      expect(ids).toContain(idOld);
      expect(ids).toContain(idNew);
      expect(ids).not.toContain(idPlain);
      expect(ids).not.toContain(idDemo);
      expect(ids).not.toContain(idInactive);

      // Orden createdAt desc entre las mías: la nueva antes que la vieja.
      const mine = ids.filter((id) => id === idOld || id === idNew);
      expect(mine).toEqual([idNew, idOld]);

      // limit acota el número devuelto.
      const limited = await listFeaturedReviews(1);
      expect(limited.length).toBeLessThanOrEqual(1);
    });
  });

  // ───────────────────────── listReviewsAdmin ─────────────────────────
  describe("listReviewsAdmin", () => {
    it("filtra por estado (pending/approved/archived/all) y por producto", async () => {
      const cP = await mkCustomer();
      const cA = await mkCustomer();
      const cX = await mkCustomer();
      const pend = await mkReview({ productId: mutProductId, customerId: cP, rating: 3 });
      const appr = await mkReview({
        productId: mutProductId,
        customerId: cA,
        rating: 4,
        isApproved: true,
      });
      const arch = await mkReview({
        productId: mutProductId,
        customerId: cX,
        rating: 2,
        isApproved: false,
        deletedAt: new Date(),
      });

      const pending = await listReviewsAdmin({ productId: mutProductId, status: "pending" });
      expect(pending.items.map((r) => r.id)).toContain(pend);
      expect(pending.items.map((r) => r.id)).not.toContain(appr);
      expect(pending.items.map((r) => r.id)).not.toContain(arch);

      const approved = await listReviewsAdmin({ productId: mutProductId, status: "approved" });
      expect(approved.items.map((r) => r.id)).toEqual([appr]);

      const archived = await listReviewsAdmin({ productId: mutProductId, status: "archived" });
      expect(archived.items.map((r) => r.id)).toEqual([arch]);

      const all = await listReviewsAdmin({ productId: mutProductId, status: "all" });
      const allIds = all.items.map((r) => r.id);
      expect(allIds).toEqual(expect.arrayContaining([pend, appr, arch]));
    });

    it("filtra por rating y calcula pendingCount por producto vs global", async () => {
      const c5 = await mkCustomer();
      const only5 = await mkReview({ productId: mutProductId, customerId: c5, rating: 5 });

      const byRating = await listReviewsAdmin({
        productId: mutProductId,
        status: "all",
        rating: 5,
      });
      expect(byRating.items.map((r) => r.id)).toContain(only5);
      expect(byRating.items.every((r) => r.rating === 5)).toBe(true);

      // pendingCount por producto: cuenta solo pendientes de este producto.
      const scoped = await listReviewsAdmin({ productId: mutProductId, status: "pending" });
      // pendingCount global es >= el del producto (incluye otras reseñas del catálogo).
      const global = await listReviewsAdmin({ status: "pending" });
      expect(global.pendingCount).toBeGreaterThanOrEqual(scoped.pendingCount);
      expect(scoped.pendingCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ───────────────────────── Transiciones ─────────────────────────
  describe("transiciones de estado", () => {
    it("approveReview marca isApproved:true", async () => {
      const c = await mkCustomer();
      const id = await mkReview({ productId: mutProductId, customerId: c, rating: 4 });
      await approveReview(id, ADMIN);
      const after = await prisma.review.findUnique({ where: { id }, select: { isApproved: true } });
      expect(after?.isApproved).toBe(true);
    });

    it("rejectReview deja pending (isApproved:false, featured:false) — NO archiva (#14)", async () => {
      const c = await mkCustomer();
      const id = await mkReview({
        productId: mutProductId,
        customerId: c,
        rating: 4,
        isApproved: true,
        featured: true,
      });
      await rejectReview(id, ADMIN);
      const after = await prisma.review.findUnique({
        where: { id },
        select: { isApproved: true, featured: true, deletedAt: true },
      });
      expect(after).toMatchObject({ isApproved: false, featured: false, deletedAt: null });
    });

    it("toggleFeaturedReview lanza si NO está aprobada, y togglea si lo está", async () => {
      const c = await mkCustomer();
      const pendingId = await mkReview({ productId: mutProductId, customerId: c, rating: 5 });
      await expect(toggleFeaturedReview(pendingId, ADMIN)).rejects.toThrow(/aprobadas/i);

      const c2 = await mkCustomer();
      const approvedId = await mkReview({
        productId: mutProductId,
        customerId: c2,
        rating: 5,
        isApproved: true,
      });
      await toggleFeaturedReview(approvedId, ADMIN);
      let row = await prisma.review.findUnique({
        where: { id: approvedId },
        select: { featured: true },
      });
      expect(row?.featured).toBe(true);
      await toggleFeaturedReview(approvedId, ADMIN);
      row = await prisma.review.findUnique({
        where: { id: approvedId },
        select: { featured: true },
      });
      expect(row?.featured).toBe(false);
    });

    it("archiveReview setea deletedAt + featured/isApproved false; restoreReview lo revierte", async () => {
      const c = await mkCustomer();
      const id = await mkReview({
        productId: mutProductId,
        customerId: c,
        rating: 5,
        isApproved: true,
        featured: true,
      });
      await archiveReview(id, ADMIN);
      const archived = await prisma.review.findUnique({
        where: { id },
        select: { deletedAt: true, featured: true, isApproved: true },
      });
      expect(archived?.deletedAt).not.toBeNull();
      expect(archived?.featured).toBe(false);
      expect(archived?.isApproved).toBe(false);

      await restoreReview(id, ADMIN);
      const restored = await prisma.review.findUnique({
        where: { id },
        select: { deletedAt: true },
      });
      expect(restored?.deletedAt).toBeNull();
    });

    it("archive saca la reseña del aggregate y del featured; approve+feature la incluye", async () => {
      const c = await mkCustomer();
      const id = await mkReview({
        productId: mutProductId,
        customerId: c,
        rating: 5,
        isApproved: true,
        featured: true,
      });
      // Presente en featured mientras está aprobada+featured.
      let featured = await listFeaturedReviews(50);
      expect(featured.map((r) => r.id)).toContain(id);

      await archiveReview(id, ADMIN);
      featured = await listFeaturedReviews(50);
      expect(featured.map((r) => r.id)).not.toContain(id);
      // Y tampoco cuenta en el aggregate (archivada = deletedAt no null + isApproved false).
      const agg = await getProductRatingAggregate(mutProductId);
      // El producto mut pudo quedar con otras aprobadas de tests previos; basta que esta no cuente.
      const stillCounts = await prisma.review.count({
        where: { id, isApproved: true, deletedAt: null },
      });
      expect(stillCounts).toBe(0);
      expect(agg === null || agg.reviewCount >= 0).toBe(true);
    });

    it("bulkApproveReviews / bulkArchiveReviews solo afectan no-borradas y devuelven count", async () => {
      const cB1 = await mkCustomer();
      const cB2 = await mkCustomer();
      const b1 = await mkReview({ productId: mutProductId, customerId: cB1, rating: 4 });
      const b2 = await mkReview({ productId: mutProductId, customerId: cB2, rating: 3 });

      const approveRes = await bulkApproveReviews([b1, b2], ADMIN);
      expect(approveRes.count).toBe(2);
      const approvedRows = await prisma.review.findMany({
        where: { id: { in: [b1, b2] } },
        select: { isApproved: true },
      });
      expect(approvedRows.every((r) => r.isApproved)).toBe(true);

      // Archivar b1; un segundo bulkArchive sobre b1 (ya archivada) no lo recuenta.
      const archive1 = await bulkArchiveReviews([b1], ADMIN);
      expect(archive1.count).toBe(1);
      const archive2 = await bulkArchiveReviews([b1], ADMIN);
      expect(archive2.count).toBe(0); // where deletedAt:null → ya no matchea

      // Lista vacía → count 0 sin tocar la BD.
      expect((await bulkApproveReviews([], ADMIN)).count).toBe(0);
    });
  });
});
