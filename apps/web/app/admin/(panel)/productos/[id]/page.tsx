/*
 * /admin/productos/[id] — vista detalle del producto con 3 secciones:
 *
 *   ?section=editar (default) → ProductForm + StockPanel + CouponsWidget + Images
 *   ?section=opciones        → ProductVariantsPanel (movido de /variants)
 *   ?section=resenas          → ProductReviewsPanel (nuevo)
 *
 * Lucy 2026-06-26 — Opción C Sprint 2: el sub-nav <ProductSectionNav> arriba
 * del contenido reemplaza el botón "Variantes (N)" enterrado en el header.
 * Las reseñas pasan de página propia escondida a tab contextual + el módulo
 * global /admin/resenas sigue existiendo para moderación batch cross-product.
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Package, Trash2, Boxes, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { AdminPage, AdminPageHeader, AdminPageBody, AdminNotice } from "@/components/admin-page";
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

const VALID_SECTIONS: ProductSection[] = ["editar", "opciones", "resenas"];

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

  // "Desde $X" = el precio más barato entre las opciones activas (cada opción
  // hereda basePrice si no define el suyo). Solo para mostrar en el form (edit).
  const activeForPrice = product.variants.filter((v) => !v.deletedAt);
  const priceFrom =
    activeForPrice.length > 0
      ? Math.min(...activeForPrice.map((v) => v.price ?? product.basePrice))
      : product.basePrice;

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

            {/*
             * Resumen de stock SOLO LECTURA (Lucy 2026-06-27). El editor de stock
             * vive en la pestaña Opciones (y en Inventario), no acá — para no
             * tener "lo mismo en 3 lados". Acá solo se ve + un botón para ir a
             * gestionarlo donde corresponde.
             */}
            <ProductStockSummaryReadonly
              productId={product.id}
              totalUnits={stockSummary.totalUnits}
              variantsCount={stockSummary.variantsCount}
              outCount={stockSummary.outCount}
              lowCount={stockSummary.lowCount}
              worstStatus={stockSummary.worstStatus}
            />

            <ProductCouponsWidget
              productSlug={product.slug}
              categorySlug={product.category?.slug ?? null}
            />

            <ProductForm
              categories={await listCategoriesForSelect()}
              priceFrom={priceFrom}
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
        {section === "opciones" && (
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

/**
 * Resumen de stock SOLO LECTURA para la pestaña Editar (Lucy 2026-06-27).
 * Muestra el estado del inventario del producto de un vistazo, pero el ajuste
 * se hace en Opciones / Inventario (un solo lugar para editar, no tres).
 */
function ProductStockSummaryReadonly({
  productId,
  totalUnits,
  variantsCount,
  outCount,
  lowCount,
  worstStatus,
}: {
  productId: string;
  totalUnits: number;
  variantsCount: number;
  outCount: number;
  lowCount: number;
  worstStatus: "out" | "low" | "ok";
}) {
  const toneClass =
    worstStatus === "out"
      ? "border-red-200 bg-red-50"
      : worstStatus === "low"
        ? "border-amber-200 bg-amber-50"
        : "border-brand-purple/15 bg-white";
  return (
    <section className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-center gap-3">
        <Boxes className="text-brand-purple-dark/60 h-5 w-5 shrink-0" />
        <div>
          <p className="text-brand-purple-dark text-sm font-semibold">
            {getStockEmoji(worstStatus)} {totalUnits.toLocaleString("es-CO")} unidades en total
            <span className="text-brand-purple-dark/55 font-normal">
              {" · "}
              {variantsCount} {variantsCount === 1 ? "opción" : "opciones"}
            </span>
          </p>
          {(outCount > 0 || lowCount > 0) && (
            <p className="text-brand-purple-dark/65 mt-0.5 text-xs">
              {outCount > 0 && `🔴 ${outCount} agotada${outCount === 1 ? "" : "s"}`}
              {outCount > 0 && lowCount > 0 && " · "}
              {lowCount > 0 && `🟡 ${lowCount} con stock bajo`}
            </p>
          )}
        </div>
      </div>
      <Link
        href={`/admin/productos/${productId}?section=opciones`}
        className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-semibold"
      >
        Gestionar stock
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
