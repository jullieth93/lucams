import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentAdmin } from "@/lib/auth";
import { listCategoriesForSelect } from "@/features/products/service";
import { ProductForm } from "../product-form";
import { createProductAction } from "../actions";

export const metadata: Metadata = {
  title: "Nuevo producto",
};

export default async function NuevoProductoPage() {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const categories = await listCategoriesForSelect();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
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
            <h1 className="text-lg font-bold text-slate-900">Nuevo producto</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <ProductForm
          categories={categories}
          action={createProductAction}
          submitLabel="Crear producto"
        />
      </main>
    </div>
  );
}
