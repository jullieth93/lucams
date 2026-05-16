import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AdminPage, AdminPageHeader, AdminPageBody } from "@/components/admin-page";
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
    <AdminPage>
      <AdminPageHeader
        icon={<Plus className="h-5 w-5" />}
        title="Nuevo producto"
        subtitle="Crea un producto en el catálogo + variante por defecto."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Productos", href: "/admin/productos" },
          { label: "Nuevo" },
        ]}
      />

      <AdminPageBody>
        <ProductForm
          categories={categories}
          action={createProductAction}
          submitLabel="Crear producto"
        />
      </AdminPageBody>
    </AdminPage>
  );
}
