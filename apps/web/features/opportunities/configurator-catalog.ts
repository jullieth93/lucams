/*
 * Carga server-only del catálogo comercial para el Configurador B2B (`/empresas-y-eventos`)
 * y para el Constructor de Propuestas en `/admin/oportunidades/[id]` (`ADR-210`).
 *
 * Seguridad de confidencialidad comercial:
 *   - `getPublicB2bConfiguratorCatalog()` JAMÁS incluye `Product.cost` (costo BOM).
 *   - `getAdminProposalCatalog()` es exclusivo de roles con `opportunities:propose` y sí
 *     incluye `unitCostCents` (`Product.cost`) para calcular margen neto en vivo.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { STOREFRONT_PRODUCT_WHERE } from "@/features/products/storefront-visibility";
import { hasStockForSale, netAvailableStock } from "@/features/products/fulfillment";
import type { VolumeTierInput } from "@/features/cart/volume-pricing";
import {
  extractVariantMagnet,
  extractVariantSizeCm,
  piecesPerCommercialUnit,
  type ConfiguratorCatalogPayload,
  type ConfiguratorProductOption,
} from "./configurator-math";

export async function getPublicB2bConfiguratorCatalog(): Promise<ConfiguratorCatalogPayload> {
  const [productsRaw, tiersRaw] = await Promise.all([
    prisma.product.findMany({
      where: STOREFRONT_PRODUCT_WHERE,
      orderBy: [{ isFeatured: "desc" }, { name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        basePrice: true,
        images: true,
        productionDays: true,
        fulfillmentMode: true,
        category: { select: { name: true } },
        variants: {
          where: { isActive: true, deletedAt: null },
          orderBy: [{ createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            sku: true,
            price: true,
            stock: true,
            safetyStock: true,
            isActive: true,
            deletedAt: true,
            attributes: true,
          },
        },
      },
    }),
    prisma.wholesaleTier.findMany({
      where: { isActive: true, deletedAt: null, minQty: { gte: 2 } },
      select: {
        productId: true,
        variantId: true,
        minQty: true,
        unitPrice: true,
        isActive: true,
        deletedAt: true,
      },
    }),
  ]);

  const products: ConfiguratorProductOption[] = [];
  for (const p of productsRaw) {
    const validVariants = p.variants
      .filter(
        (v) =>
          v.isActive &&
          v.deletedAt === null &&
          hasStockForSale(p.fulfillmentMode, v.stock, v.safetyStock),
      )
      .map((v) => ({
        id: v.id,
        name: v.name,
        sku: v.sku,
        unitPriceCents: v.price ?? p.basePrice,
        piecesPerUnit: piecesPerCommercialUnit(v.attributes),
        magnet: extractVariantMagnet(v.attributes),
        sizeCm: extractVariantSizeCm(v.attributes),
      }));

    if (validVariants.length === 0) continue;

    products.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      categoryName: p.category.name,
      imageUrl: p.images[0] ?? null,
      productionDays: p.productionDays,
      variants: validVariants,
    });
  }

  const tiers: VolumeTierInput[] = tiersRaw.map((t) => ({
    productId: t.productId,
    variantId: t.variantId,
    minQty: t.minQty,
    unitPrice: t.unitPrice,
    isActive: t.isActive,
    deletedAt: t.deletedAt,
  }));

  return { products, tiers };
}

export interface AdminProposalVariantOption {
  id: string;
  productId: string;
  productSlug: string;
  productName: string;
  productionDays: number;
  fulfillmentMode: "MADE_TO_ORDER" | "PHYSICAL_STOCK";
  stock: number;
  name: string;
  sku: string;
  baseUnitPriceCents: number;
  unitCostCents: number | null;
  piecesPerUnit: number;
  magnet: boolean | null;
}

export interface AdminProposalCatalogPayload {
  variants: AdminProposalVariantOption[];
  tiers: VolumeTierInput[];
}

export async function getAdminProposalCatalog(): Promise<AdminProposalCatalogPayload> {
  const [productsRaw, tiersRaw] = await Promise.all([
    prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        basePrice: true,
        cost: true,
        productionDays: true,
        fulfillmentMode: true,
        variants: {
          where: { isActive: true, deletedAt: null },
          orderBy: [{ createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            sku: true,
            price: true,
            stock: true,
            safetyStock: true,
            attributes: true,
          },
        },
      },
    }),
    prisma.wholesaleTier.findMany({
      where: { isActive: true, deletedAt: null, minQty: { gte: 2 } },
      select: {
        productId: true,
        variantId: true,
        minQty: true,
        unitPrice: true,
        isActive: true,
        deletedAt: true,
      },
    }),
  ]);

  const variants: AdminProposalVariantOption[] = [];
  for (const p of productsRaw) {
    for (const v of p.variants) {
      variants.push({
        id: v.id,
        productId: p.id,
        productSlug: p.slug,
        productName: p.name,
        productionDays: p.productionDays,
        fulfillmentMode: p.fulfillmentMode,
        stock: netAvailableStock(v.stock, v.safetyStock),
        name: v.name,
        sku: v.sku,
        baseUnitPriceCents: v.price ?? p.basePrice,
        unitCostCents: p.cost,
        piecesPerUnit: piecesPerCommercialUnit(v.attributes),
        magnet: extractVariantMagnet(v.attributes),
      });
    }
  }

  return {
    variants,
    tiers: tiersRaw,
  };
}
