/*
 * Service layer para OcasionTag — PLAN_CATALOG_V2 1.5 + 2.10 + 3.4.
 *
 * CRUD + asociación con Product. Cumple principio AI-ready: cada update
 * invalida cache `catalog` para que API + storefront vean el cambio
 * inmediatamente.
 */

import { prisma, Prisma } from "@/lib/db";
import { updateTag } from "next/cache";
import type { OcasionCreateInput, OcasionUpdateInput } from "./schemas";

export class OcasionValidationError extends Error {
  constructor(
    public field: "slug" | "name" | "description" | "monthHint",
    message: string,
  ) {
    super(message);
    this.name = "OcasionValidationError";
  }
}

export type OcasionListOpts = {
  q?: string;
  status?: "all" | "active" | "inactive";
  sort?: "order" | "name" | "recent";
};

export async function listOcasionTags(opts: OcasionListOpts = {}) {
  const q = opts.q?.trim();
  const orderBy = (() => {
    switch (opts.sort) {
      case "name":
        return [{ name: "asc" as const }];
      case "recent":
        return [{ createdAt: "desc" as const }];
      case "order":
      default:
        return [{ order: "asc" as const }];
    }
  })();
  return prisma.ocasionTag.findMany({
    where: {
      deletedAt: null,
      ...(opts.status === "active" ? { isActive: true } : {}),
      ...(opts.status === "inactive" ? { isActive: false } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { slug: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy,
    include: { _count: { select: { products: true } } },
  });
}

export async function getOcasionTag(id: string) {
  return prisma.ocasionTag.findUnique({
    where: { id },
    include: {
      products: {
        include: {
          product: {
            select: { id: true, slug: true, name: true, isActive: true, deletedAt: true },
          },
        },
      },
    },
  });
}

export async function createOcasionTag(input: OcasionCreateInput, actorId: string) {
  const existing = await prisma.ocasionTag.findUnique({ where: { slug: input.slug } });
  if (existing) {
    throw new OcasionValidationError("slug", "Ya existe una ocasión con ese slug.");
  }
  const { suggestedQuantityRange, ...rest } = input;
  const created = await prisma.ocasionTag.create({
    data: {
      ...rest,
      suggestedQuantityRange:
        suggestedQuantityRange === null || suggestedQuantityRange === undefined
          ? Prisma.JsonNull
          : suggestedQuantityRange,
      createdBy: actorId,
    },
  });
  updateTag("catalog");
  return created;
}

export async function updateOcasionTag(input: OcasionUpdateInput, actorId: string) {
  const { id, suggestedQuantityRange, ...data } = input;
  const updated = await prisma.ocasionTag.update({
    where: { id },
    data: {
      ...data,
      ...(suggestedQuantityRange !== undefined && {
        suggestedQuantityRange:
          suggestedQuantityRange === null ? Prisma.JsonNull : suggestedQuantityRange,
      }),
      updatedBy: actorId,
    },
  });
  updateTag("catalog");
  return updated;
}

export async function softDeleteOcasionTag(id: string, actorId: string) {
  await prisma.ocasionTag.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: actorId, isActive: false },
  });
  updateTag("catalog");
}

// ─────────── Asociación Product ↔ Ocasión ───────────

export async function linkProductToOcasion(
  productId: string,
  ocasionTagId: string,
  rationale: string | null,
) {
  await prisma.productOcasionTag.upsert({
    where: {
      productId_ocasionTagId: { productId, ocasionTagId },
    },
    update: { rationale },
    create: { productId, ocasionTagId, rationale },
  });
  updateTag("catalog");
}

export async function unlinkProductFromOcasion(productId: string, ocasionTagId: string) {
  await prisma.productOcasionTag.delete({
    where: {
      productId_ocasionTagId: { productId, ocasionTagId },
    },
  });
  updateTag("catalog");
}

export async function getProductsForOcasion(ocasionTagId: string) {
  return prisma.productOcasionTag.findMany({
    where: { ocasionTagId },
    include: {
      product: { select: { id: true, slug: true, name: true, isActive: true } },
    },
  });
}
