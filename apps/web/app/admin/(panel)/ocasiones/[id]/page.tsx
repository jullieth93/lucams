/*
 * Admin > Ocasiones > [id] — Edit detalle + gestión de productos asociados.
 *
 * PLAN_CATALOG_V2 1.5 + 2.10.
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Tag } from "lucide-react";
import { AdminPage, AdminPageHeader, AdminPageBody } from "@/components/admin-page";
import { getOcasionTag } from "@/features/ocasiones/service";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EditOcasionForm } from "./edit-ocasion-form";
import { ProductOcasionLinker } from "./product-ocasion-linker";

export const metadata: Metadata = {
  title: "Ocasión — Detalle",
};

export default async function AdminOcasionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const ocasion = await getOcasionTag(id);
  if (!ocasion) notFound();

  // Productos disponibles (todos los activos)
  const allProducts = await prisma.product.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, slug: true, name: true, categoryId: true },
    orderBy: { name: "asc" },
  });

  const linkedProductIds = new Set(ocasion.products.map((p) => p.product.id));
  const linkedProducts = ocasion.products.map((link) => ({
    productId: link.product.id,
    productSlug: link.product.slug,
    productName: link.product.name,
    rationale: link.rationale,
  }));
  const availableProducts = allProducts.filter((p) => !linkedProductIds.has(p.id));

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Tag className="h-5 w-5" />}
        title={ocasion.name}
        subtitle={`Slug: ${ocasion.slug}`}
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Ocasiones", href: "/admin/ocasiones" },
          { label: ocasion.name },
        ]}
      />

      <AdminPageBody>
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-base font-bold text-slate-900">Editar ocasión</h2>
          <EditOcasionForm
            ocasion={{
              id: ocasion.id,
              slug: ocasion.slug,
              name: ocasion.name,
              description: ocasion.description,
              monthHint: ocasion.monthHint,
              suggestedQuantityRange:
                (ocasion.suggestedQuantityRange as {
                  min: number;
                  ideal: number;
                  max: number;
                } | null) ?? null,
              order: ocasion.order,
              isActive: ocasion.isActive,
            }}
          />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-2 text-base font-bold text-slate-900">
            Productos asociados ({linkedProducts.length})
          </h2>
          <p className="mb-4 text-sm text-slate-600">
            Cada producto puede estar en varias ocasiones. El <strong>rationale</strong> es lo que
            el bot futuro responderá: &quot;Recomendamos este producto para [ocasión] porque
            [rationale]&quot;.
          </p>
          <ProductOcasionLinker
            ocasionTagId={ocasion.id}
            linkedProducts={linkedProducts}
            availableProducts={availableProducts}
          />
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
