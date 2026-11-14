/*
 * Admin > Ocasiones > [id] — Edit detalle + gestión de productos asociados.
 *
 * PLAN_CATALOG_V2 1.5 + 2.10.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, ExternalLink, Package, Tag } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { Button } from "@/components/ui/button";
import { getOcasionTag } from "@/features/ocasiones/service";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import { requireCapability } from "@/lib/admin-rbac-guard";
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
  const session = await requireCapability("catalog:write");
  const canViewRedirects = canAccessAdminPath(session.admin.role, "/admin/redirects");

  const { id } = await params;
  const ocasion = await getOcasionTag(id);
  if (!ocasion) notFound();

  // Productos disponibles (todos los no eliminados)
  const allProducts = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, slug: true, name: true, isActive: true, categoryId: true },
    orderBy: { name: "asc" },
  });

  const liveOcasionProducts = ocasion.products.filter((link) => link.product.deletedAt === null);
  const linkedProductIds = new Set(liveOcasionProducts.map((p) => p.product.id));
  const linkedProducts = liveOcasionProducts.map((link) => ({
    productId: link.product.id,
    productSlug: link.product.slug,
    productName: link.product.name,
    isActive: link.product.isActive,
    rationale: link.rationale,
  }));
  const availableProducts = allProducts
    .filter((p) => p.isActive && !linkedProductIds.has(p.id))
    .map((p) => ({ id: p.id, slug: p.slug, name: p.name }));

  const isArchived = Boolean(ocasion.deletedAt);

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Tag className="h-5 w-5" />}
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{ocasion.name}</span>
            {isArchived ? (
              <AdminBadge tone="slate">Archivada</AdminBadge>
            ) : ocasion.isActive ? (
              <AdminBadge tone="emerald">Activa</AdminBadge>
            ) : (
              <AdminBadge tone="amber">Inactiva</AdminBadge>
            )}
          </span>
        }
        subtitle={`URL pública: /ocasion/${ocasion.slug} · ${linkedProducts.length} ${linkedProducts.length === 1 ? "producto asociado" : "productos asociados"}`}
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Catálogo", href: "/admin/productos" },
          { label: "Ocasiones", href: "/admin/ocasiones" },
          { label: ocasion.name },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/ocasiones">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Volver
              </Link>
            </Button>
            {ocasion.isActive && !isArchived && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/ocasion/${ocasion.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Ver en tienda
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/productos">
                <Package className="mr-1.5 h-4 w-4" />
                Catálogo
              </Link>
            </Button>
            {canViewRedirects && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/redirects">
                  <ArrowRightLeft className="mr-1.5 h-4 w-4" />
                  Redirects 301
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <AdminPageBody>
        <AdminCard className="p-6">
          <h2 className="text-brand-purple-dark font-display mb-4 text-base font-bold">
            Configuración de la ocasión
          </h2>
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
              deletedAt: ocasion.deletedAt?.toISOString() ?? null,
            }}
          />
        </AdminCard>

        <div id="productos">
          <AdminCard className="p-6">
            <h2 className="text-brand-purple-dark font-display mb-1.5 text-base font-bold">
              Productos asociados ({linkedProducts.length})
            </h2>
            <p className="text-brand-muted mb-4 text-sm">
              Cada producto puede pertenecer a varias ocasiones. El <strong>motivo sugerido</strong>{" "}
              enriquece la vitrina <code>/ocasion/{ocasion.slug}</code> y ayuda al recomendador del
              catálogo a priorizar la mejor opción para el cliente.
            </p>
            <ProductOcasionLinker
              ocasionTagId={ocasion.id}
              linkedProducts={linkedProducts}
              availableProducts={availableProducts}
            />
          </AdminCard>
        </div>
      </AdminPageBody>
    </AdminPage>
  );
}
