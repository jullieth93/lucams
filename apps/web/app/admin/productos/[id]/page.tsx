import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentAdmin } from "@/lib/auth";
import {
  getProductById,
  listCategoriesForSelect,
} from "@/features/products/service";
import { deleteProductAction, updateProductAction } from "../actions";
import { ProductForm } from "../product-form";

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

  const [product, categories] = await Promise.all([
    getProductById(id),
    listCategoriesForSelect(),
  ]);

  if (!product) notFound();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/productos"
              className="text-slate-500 hover:text-slate-700"
              aria-label="Volver a productos"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">
                Admin · Productos
              </p>
              <h1 className="text-lg font-bold text-slate-900">
                {product.name}
              </h1>
            </div>
          </div>
          <form action={deleteProductAction}>
            <input type="hidden" name="id" value={product.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Archivar
            </Button>
          </form>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        {justCreated && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
            ✓ Producto creado. Ya podés editar más detalles o agregar variantes.
          </div>
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
          }}
          action={updateProductAction}
          submitLabel="Guardar cambios"
        />
      </main>
    </div>
  );
}
