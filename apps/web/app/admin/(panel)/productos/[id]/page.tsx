import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Layers, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPage, AdminPageHeader, AdminPageBody, AdminNotice } from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { getProductById, listCategoriesForSelect } from "@/features/products/service";
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
              className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm font-semibold transition-colors"
            >
              <Layers className="h-4 w-4" />
              Variantes
              <span className="bg-brand-purple/15 text-brand-purple-dark rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                {product.variants.filter((v) => !v.deletedAt).length}
              </span>
            </Link>
            <form action={deleteProductAction}>
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
            </form>
          </div>
        }
      />

      <AdminPageBody>
        {justCreated && (
          <AdminNotice tone="success">
            Producto creado. Ya puedes editar más detalles o agregar variantes.
          </AdminNotice>
        )}
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
          }}
          action={updateProductAction}
          submitLabel="Guardar cambios"
        />
        <ProductImages productId={product.id} images={product.images} />
      </AdminPageBody>
    </AdminPage>
  );
}
