import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Layers, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { AdminPage, AdminPageHeader, AdminPageBody, AdminNotice } from "@/components/admin-page";
import { ProductStockPanel } from "@/components/admin/product-stock-panel";
import { getCurrentAdmin } from "@/lib/auth";
import { getProductById, listCategoriesForSelect } from "@/features/products/service";
import { parsePhysicalSpecs } from "@/features/products/shipping-schemas";
import {
  getStockEmoji,
  getStockLabel,
  summarizeStock,
} from "@/features/products/stock-constants";
import { deleteProductAction, updateProductAction } from "../actions";
import { ProductForm } from "../product-form";
import { ProductImages } from "../product-images";

export const metadata: Metadata = {
  title: "Editar producto",
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function EditarProductoPage({
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

  const [product, categories] = await Promise.all([getProductById(id), listCategoriesForSelect()]);

  if (!product) notFound();

  // PR C — parse physicalSpecs Json para extraer peso/dims y pasarlos a la form
  const physicalSpecs = parsePhysicalSpecs(product.physicalSpecs);

  // ADM-P0-004 — variants para ProductStockPanel + badge stock total en header.
  // Map a shape esperada por el panel (incluye deletedAt para filtrar inactivas).
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
  const variantsButtonClass =
    stockSummary.worstStatus === "out"
      ? "border-red-300 bg-red-50 text-red-800 hover:bg-red-100"
      : stockSummary.worstStatus === "low"
        ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
        : "border-brand-purple/25 bg-white text-brand-purple-dark hover:bg-brand-purple/10";

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Package className="h-5 w-5" />}
        title={product.name}
        subtitle={`SKU: ${product.sku} · slug: ${product.slug}`}
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Productos", href: "/admin/productos" },
          { label: product.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/productos/${product.id}/variants`}
              className={
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors " +
                variantsButtonClass
              }
              aria-label={`Variantes: ${stockSummary.variantsCount}, ${getStockLabel(stockSummary.worstStatus, stockSummary.totalUnits)}`}
            >
              <Layers className="h-4 w-4" />
              <span>Variantes</span>
              <span className="rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                {stockSummary.variantsCount}
              </span>
              <span aria-hidden className="ml-0.5">
                {getStockEmoji(stockSummary.worstStatus)}
              </span>
              <span className="hidden tabular-nums sm:inline">
                {stockSummary.totalUnits.toLocaleString("es-CO")} uds
              </span>
            </Link>
            <ConfirmAction
              action={deleteProductAction}
              message={`¿Archivar "${product.name}"? Quedará oculto del storefront. Puedes restaurarlo después editando el producto.`}
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
          </div>
        }
      />

      <AdminPageBody>
        {justCreated && (
          <AdminNotice tone="success">
            Producto creado. Ahora puedes ajustar el stock, subir imágenes y revisar el resto de los
            detalles.
          </AdminNotice>
        )}

        {/*
         * ADM-P0-004 — ProductStockPanel arriba del form. Stock es la
         * información más crítica del día a día; merece su propio panel
         * visible sin entrar a tabs ni a sub-páginas.
         */}
        <ProductStockPanel productId={product.id} variants={stockVariants} />

        <ProductForm
          categories={categories}
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
            // PLAN_CATALOG_V2 — campos enriquecidos
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
            // PR C — extraer peso/dims de physicalSpecs Json (nullable individual)
            weightGrams: physicalSpecs.weightGrams ?? null,
            widthCm: physicalSpecs.widthCm ?? null,
            heightCm: physicalSpecs.heightCm ?? null,
            depthCm: physicalSpecs.depthCm ?? null,
          }}
          action={updateProductAction}
          submitLabel="Guardar cambios"
        />
        <ProductImages productId={product.id} images={product.images} />
      </AdminPageBody>
    </AdminPage>
  );
}
