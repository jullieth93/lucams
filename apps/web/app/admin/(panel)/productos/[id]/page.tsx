/*
 * /admin/productos/[id] — vista detalle del producto con 3 secciones:
 *
 *   ?section=editar (default) → ProductForm + StockPanel + CouponsWidget + Images
 *   ?section=versiones        → ProductVariantsPanel (movido de /variants)
 *   ?section=resenas          → ProductReviewsPanel (nuevo)
 *
 * Lucy 2026-06-26 — Opción C Sprint 2: el sub-nav <ProductSectionNav> arriba
 * del contenido reemplaza el botón "Variantes (N)" enterrado en el header.
 * Las reseñas pasan de página propia escondida a tab contextual + el módulo
 * global /admin/resenas sigue existiendo para moderación batch cross-product.
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { AdminPage, AdminPageHeader, AdminPageBody, AdminNotice } from "@/components/admin-page";
import { ProductStockPanel } from "@/components/admin/product-stock-panel";
import { ProductSectionNav, type ProductSection } from "@/components/admin/product-section-nav";
import { ProductVariantsPanel } from "@/components/admin/product-variants-panel";
import { ProductReviewsPanel } from "@/components/admin/product-reviews-panel";
import { ProductCouponsWidget } from "@/components/admin/product-coupons-widget";
import { getCurrentAdmin } from "@/lib/auth";
import { getProductById, listCategoriesForSelect } from "@/features/products/service";
import { parsePhysicalSpecs } from "@/features/products/shipping-schemas";
import {
  getStockEmoji,
  summarizeStock,
} from "@/features/products/stock-constants";
import { prisma } from "@/lib/db";
import { deleteProductAction, updateProductAction } from "../actions";
import { ProductForm } from "../product-form";
import { ProductImages } from "../product-images";

export const metadata: Metadata = {
  title: "Editar producto",
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const VALID_SECTIONS: ProductSection[] = ["editar", "versiones", "resenas"];

export default async function ProductoDetallePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const sp = await searchParams;
  const justCreated = sp.created === "1";

  // Resolver section actual (default "editar").
  const sectionRaw = typeof sp.section === "string" ? sp.section : "editar";
  const section: ProductSection = VALID_SECTIONS.includes(sectionRaw as ProductSection)
    ? (sectionRaw as ProductSection)
    : "editar";

  const product = await getProductById(id);
  if (!product) notFound();

  // Counts para los badges del sub-nav (en paralelo con resto).
  const activeVariants = product.variants.filter((v) => !v.deletedAt);
  const pendingReviewsCount = await prisma.review.count({
    where: {
      productId: id,
      isApproved: false,
      deletedAt: null,
    },
  });

  const stockVariants = product.variants.map((v) => ({
    id: v.id,
    name: v.name,
    sku: v.sku,
    stock: v.stock,
    isActive: v.isActive,
    deletedAt: v.deletedAt,
    attributes: v.attributes,
  }));
  const stockSummary = summarizeStock(stockVariants);

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Package className="h-5 w-5" />}
        title={product.name}
        subtitle={
          <>
            Código: <code className="font-mono text-xs">{product.sku}</code> · URL:{" "}
            <code className="font-mono text-xs">/productos/{product.slug}</code> ·{" "}
            <span aria-hidden>{getStockEmoji(stockSummary.worstStatus)}</span>{" "}
            {stockSummary.totalUnits.toLocaleString("es-CO")} unidades
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Productos", href: "/admin/productos" },
          { label: product.name },
        ]}
        actions={
          <ConfirmAction
            action={deleteProductAction}
            message={`¿Archivar "${product.name}"? Quedará oculto de tu tienda. Puedes restaurarlo después editando el producto.`}
          >
            <input type="hidden" name="id" value={product.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-red-700 hover:bg-red-50"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Archivar
            </Button>
          </ConfirmAction>
        }
      />

      <AdminPageBody>
        {/* Sub-nav del producto — siempre visible */}
        <ProductSectionNav
          productId={product.id}
          currentSection={section}
          variantsCount={activeVariants.length}
          pendingReviewsCount={pendingReviewsCount}
        />

        {/* ── Section: EDITAR (default) ── */}
        {section === "editar" && (
          <>
            {justCreated && (
              <AdminNotice tone="success">
                Producto creado. Ahora puedes ajustar el stock, subir imágenes y revisar el resto
                de los detalles.
              </AdminNotice>
            )}

            <ProductStockPanel productId={product.id} variants={stockVariants} />

            <ProductCouponsWidget
              productSlug={product.slug}
              categorySlug={product.category?.slug ?? null}
            />

            <ProductForm
              categories={await listCategoriesForSelect()}
              initialProduct={{
                id: product.id,
                name: product.name,
                slug: product.slug,
                description: product.description,
                basePrice: product.basePrice,
                compareAtPrice: product.compareAtPrice,
                cost: product.cost,
                sku: product.sku,
                categoryId: product.categoryId,
                isPersonalizable: product.isPersonalizable,
                isActive: product.isActive,
                isFeatured: product.isFeatured,
                seoTitle: product.seoTitle,
                seoDescription: product.seoDescription,
                richDescription: product.richDescription,
                whyChooseThis: product.whyChooseThis,
                idealFor: product.idealFor,
                warrantyMonths: product.warrantyMonths,
                productionDays: product.productionDays,
                shippingDaysMin: product.shippingDaysMin,
                shippingDaysMax: product.shippingDaysMax,
                minimumQuantity: product.minimumQuantity,
                maximumQuantity: product.maximumQuantity,
                premadeSurcharge: product.premadeSurcharge,
                weightGrams: parsePhysicalSpecs(product.physicalSpecs).weightGrams ?? null,
                widthCm: parsePhysicalSpecs(product.physicalSpecs).widthCm ?? null,
                heightCm: parsePhysicalSpecs(product.physicalSpecs).heightCm ?? null,
                depthCm: parsePhysicalSpecs(product.physicalSpecs).depthCm ?? null,
              }}
              action={updateProductAction}
              submitLabel="Guardar cambios"
            />
            <ProductImages productId={product.id} images={product.images} />
          </>
        )}

        {/* ── Section: VERSIONES ── */}
        {section === "versiones" && (
          <ProductVariantsPanel
            productId={product.id}
            basePrice={product.basePrice}
            searchParams={sp}
          />
        )}

        {/* ── Section: RESEÑAS ── */}
        {section === "resenas" && (
          <ProductReviewsPanel
            productId={product.id}
            productSlug={product.slug}
            searchParams={sp}
          />
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
