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
import { getStorefrontVisibility } from "@/features/products/storefront-visibility";
import { StorefrontVisibilityChip } from "@/components/admin/storefront-visibility-chip";
import { parsePhysicalSpecs } from "@/features/products/shipping-schemas";
import { getStockEmoji, summarizeStock } from "@/features/products/stock-constants";
import { prisma } from "@/lib/db";
import { formatCOP } from "@/lib/format";
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

  // Indicador "Visible en tienda" del header — misma regla que el storefront
  // (storefront-visibility.ts): las opciones que cuenta la PDP son las no
  // archivadas Y activas. La razón se muestra en texto al lado del chip.
  const buyableVariants = product.variants.filter((v) => !v.deletedAt && v.isActive);
  const visibility = getStorefrontVisibility({
    productIsActive: product.isActive,
    productDeletedAt: product.deletedAt,
    categoryIsActive: product.category.isActive,
    categoryDeletedAt: product.category.deletedAt,
    activeVariantCount: buyableVariants.length,
    inStockAny: buyableVariants.some((v) => v.stock > 0),
  });
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
            <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <StorefrontVisibilityChip visibility={visibility} />
              {"reason" in visibility && (
                <span className="text-brand-muted text-xs">{visibility.reason}</span>
              )}
            </span>
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
            message={`¿Archivar "${product.name}"? Quedará oculto de tu tienda. Puedes restaurarlo cuando quieras desde el listado de productos (filtro «Archivados»).`}
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
                Producto creado. Ahora puedes ajustar el stock, subir imágenes y revisar el resto de
                los detalles.
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
              worstStatus={stockSummary.worstStatus}
              options={activeForPrice.map((v) => ({
                name: v.name === "Default" ? "Única" : v.name,
                stock: v.stock,
                price: v.price ?? product.basePrice,
              }))}
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
            productImageCount={product.images.length}
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
 * 3b: ahora muestra el DESGLOSE por opción (nombre · stock con emoji · precio),
 * no solo el total — para que de un vistazo Lucy vea cuál opción está roja.
 * El ajuste se hace en Opciones / Inventario (un solo lugar para editar).
 */
function ProductStockSummaryReadonly({
  productId,
  totalUnits,
  worstStatus,
  options,
}: {
  productId: string;
  totalUnits: number;
  worstStatus: "out" | "low" | "ok";
  options: Array<{ name: string; stock: number; price: number }>;
}) {
  const toneClass =
    worstStatus === "out"
      ? "border-red-200"
      : worstStatus === "low"
        ? "border-amber-200"
        : "border-brand-purple/15";
  const dot = (stock: number) => (stock <= 0 ? "🔴" : stock <= 5 ? "🟡" : "🟢");
  return (
    <section className={`space-y-3 rounded-xl border bg-white p-4 ${toneClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-brand-purple-dark flex items-center gap-2 text-sm font-semibold">
          <Boxes className="text-brand-muted h-5 w-5" />
          {getStockEmoji(worstStatus)} {totalUnits.toLocaleString("es-CO")} unidades en total
          <span className="text-brand-muted font-normal">
            · {options.length} {options.length === 1 ? "opción" : "opciones"}
          </span>
        </p>
        <Link
          href={`/admin/productos/${productId}?section=opciones`}
          className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-semibold"
        >
          Gestionar opciones y stock
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {/* Desglose por opción */}
      <ul className="divide-brand-purple/10 border-brand-purple/10 divide-y overflow-hidden rounded-lg border">
        {options.map((o, i) => (
          <li
            key={i}
            className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 text-sm"
          >
            <span className="text-brand-purple-dark font-medium">{o.name}</span>
            <span className="flex items-center gap-3">
              <span className="text-brand-purple-dark/70 text-xs tabular-nums">
                {formatCOP(o.price)}
              </span>
              <span className="text-brand-purple-dark inline-flex items-center gap-1 text-xs font-semibold tabular-nums">
                {dot(o.stock)} {o.stock.toLocaleString("es-CO")} u.
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
