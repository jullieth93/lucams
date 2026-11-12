/*
 * admin-service (moderación de reseñas) — unit tests con prisma mockeado
 * (patrón review-request-service.test.ts: mocks en el borde con vi.hoisted).
 *
 * Cubre Fase 3 · 3.5:
 *  - status "featured": filtra featured=true + aprobadas + no archivadas
 *    (mismo criterio que el carousel de la home — listFeaturedReviews).
 *  - listReviewProductOptions: productos con al menos una reseña no archivada,
 *    orden alfabético (selector visible de /admin/resenas).
 *  - Reglas conservadas: solo aprobadas pueden destacarse; archivar limpia
 *    featured (y desaprueba); archivar en bulk igual.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const reviewFindMany = vi.hoisted(() =>
  vi.fn(async (_opts?: { where?: Record<string, unknown> }) => [] as unknown[]),
);
const reviewCount = vi.hoisted(() => vi.fn(async () => 0));
const reviewFindUnique = vi.hoisted(() => vi.fn());
const reviewUpdate = vi.hoisted(() => vi.fn(async () => ({})));
const reviewUpdateMany = vi.hoisted(() => vi.fn(async () => ({ count: 0 })));
const productFindMany = vi.hoisted(() =>
  vi.fn(async () => [] as { id: string; name: string; slug: string }[]),
);

vi.mock("@/lib/db", () => ({
  prisma: {
    review: {
      findMany: reviewFindMany,
      count: reviewCount,
      findUnique: reviewFindUnique,
      update: reviewUpdate,
      updateMany: reviewUpdateMany,
    },
    product: { findMany: productFindMany },
  },
}));

import {
  archiveReview,
  bulkArchiveReviews,
  listReviewProductOptions,
  listReviewsAdmin,
  sanitizeReviewReturnPath,
  toggleFeaturedReview,
} from "./admin-service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listReviewsAdmin — status", () => {
  it('"featured" filtra destacadas aprobadas y no archivadas', async () => {
    await listReviewsAdmin({ status: "featured" });
    const where = reviewFindMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ featured: true, isApproved: true, deletedAt: null });
  });

  it('"pending" (default) filtra no aprobadas y no archivadas', async () => {
    await listReviewsAdmin({});
    const where = reviewFindMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ isApproved: false, deletedAt: null });
  });

  it('"featured" convive con el filtro por producto', async () => {
    await listReviewsAdmin({ status: "featured", productId: "cprod00000000000000000001" });
    const where = reviewFindMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      featured: true,
      isApproved: true,
      deletedAt: null,
      productId: "cprod00000000000000000001",
    });
  });
});

describe("listReviewProductOptions", () => {
  it("consulta productos con al menos una reseña no archivada, en orden alfabético", async () => {
    productFindMany.mockResolvedValueOnce([
      { id: "cprod00000000000000000001", name: "Imán Abecedario", slug: "iman-abecedario" },
    ]);
    const options = await listReviewProductOptions();
    expect(productFindMany).toHaveBeenCalledWith({
      where: { reviews: { some: { deletedAt: null } } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    });
    expect(options).toEqual([
      { id: "cprod00000000000000000001", name: "Imán Abecedario", slug: "iman-abecedario" },
    ]);
  });
});

describe("reglas de destacar/archivar (conservadas)", () => {
  it("no permite destacar una reseña NO aprobada", async () => {
    reviewFindUnique.mockResolvedValueOnce({ featured: false, isApproved: false });
    await expect(toggleFeaturedReview("crev000000000000000000001", "admin-1")).rejects.toThrow(
      /aprobadas/,
    );
    expect(reviewUpdate).not.toHaveBeenCalled();
  });

  it("archivar limpia featured y desaprueba", async () => {
    await archiveReview("crev000000000000000000001", "admin-1");
    expect(reviewUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ featured: false, isApproved: false }),
      }),
    );
  });

  it("archivar en bulk limpia featured y desaprueba", async () => {
    await bulkArchiveReviews(["crev000000000000000000001"], "admin-1");
    expect(reviewUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ featured: false, isApproved: false }),
      }),
    );
  });
});

describe("Bloque 6 — búsqueda por #id y sanitización anti open-redirect", () => {
  it("listReviewsAdmin limpia '#' inicial y busca también por id de reseña", async () => {
    await listReviewsAdmin({ status: "all", q: "#crev000000000000000000001" });
    const where = reviewFindMany.mock.calls[0]?.[0]?.where as { OR?: unknown[] } | undefined;
    expect(where?.OR).toEqual(
      expect.arrayContaining([
        { id: { contains: "crev000000000000000000001", mode: "insensitive" } },
      ]),
    );
  });

  it("sanitizeReviewReturnPath acepta rutas internas de reseñas y ficha producto y bloquea open-redirects", () => {
    expect(sanitizeReviewReturnPath("/admin/resenas?status=pending&rating=1")).toBe(
      "/admin/resenas?status=pending&rating=1",
    );
    expect(sanitizeReviewReturnPath("/admin/productos/cm9abc1234567890123456789")).toBe(
      "/admin/productos/cm9abc1234567890123456789",
    );
    expect(sanitizeReviewReturnPath("https://evil.example/phish")).toBe("/admin/resenas");
    expect(sanitizeReviewReturnPath("//evil.example/phish")).toBe("/admin/resenas");
    expect(sanitizeReviewReturnPath("/admin/resenas/../../login")).toBe("/admin/resenas");
    expect(sanitizeReviewReturnPath("javascript:alert(1)")).toBe("/admin/resenas");
    expect(sanitizeReviewReturnPath(null)).toBe("/admin/resenas");
  });
});
