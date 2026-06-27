/*
 * Admin > Categorías > [id] — Página de edición.
 *
 * Form con todos los campos editables (name, slug, description, isActive,
 * order). Auditoría via recordAdminAction (en actions.ts). Soft-delete
 * desde la lista o desde un botón en este page.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Layers, Trash2, ArrowLeft } from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminCard,
  AdminNotice,
} from "@/components/admin-page";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listParentCategoryOptions } from "@/features/categories/service";
import { CategoryForm } from "../category-form";
import { deleteCategoryAction } from "../actions";

export const metadata: Metadata = {
  title: "Editar categoría",
};

type RouteParams = Promise<{ id: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function EditCategoryPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: SearchParams;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const sp = await searchParams;

  const category = await prisma.category.findFirst({
    where: { id, deletedAt: null },
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      _count: { select: { products: true, children: true } },
    },
  });
  if (!category) notFound();

  // Opciones de madre: top-level menos la propia. Si esta categoría ya tiene
  // sub-categorías, no puede volverse hija (depth máx 1) → no ofrecemos madres.
  const parentOptions =
    category._count.children > 0 ? [] : await listParentCategoryOptions(category.id);

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Layers className="h-5 w-5" />}
        title={
          <>
            Editar: <span className="text-brand-purple">{category.name}</span>
          </>
        }
        subtitle={
          <>
            /{category.slug}
            {category.parent && (
              <>
                {" "}
                · sub-categoría de{" "}
                <Link
                  href={`/admin/categorias/${category.parent.id}`}
                  className="text-brand-purple hover:underline"
                >
                  {category.parent.name}
                </Link>
              </>
            )}{" "}
            · {category._count.products} {category._count.products === 1 ? "producto" : "productos"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Catálogo" },
          { label: "Categorías", href: "/admin/categorias" },
          { label: category.name },
        ]}
        actions={
          <Link
            href="/admin/categorias"
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm font-semibold transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        }
      />

      <AdminPageBody>
        {sp.updated === "1" && <AdminNotice tone="success">Categoría actualizada.</AdminNotice>}

        <AdminCard className="p-5">
          <CategoryForm
            parentOptions={parentOptions}
            initialCategory={{
              id: category.id,
              name: category.name,
              slug: category.slug,
              description: category.description,
              isActive: category.isActive,
              order: category.order,
              parentId: category.parentId,
            }}
          />
          {category._count.children > 0 && (
            <p className="text-brand-purple-dark/55 mt-3 text-xs">
              Esta categoría tiene {category._count.children} sub-categoría
              {category._count.children === 1 ? "" : "s"}, por eso no puede convertirse en
              sub-categoría de otra.
            </p>
          )}
        </AdminCard>

        {/* Archivar (peligro). Bloqueado si tiene productos. */}
        <AdminCard className="border-rose-200/40 p-5">
          <h3 className="text-brand-purple-dark font-display mb-2 text-sm font-bold">
            Zona de peligro
          </h3>
          <p className="text-brand-purple-dark/65 mb-3 text-xs">
            Archivar oculta la categoría de tu tienda y del menú. Las categorías con productos
            asociados no pueden archivarse — primero hay que mover esos productos a otra categoría.
          </p>
          <ConfirmAction
            action={deleteCategoryAction}
            message={`¿Archivar la categoría "${category.name}"? Quedará oculta de tu tienda. Esta acción es reversible (puedes traerla de vuelta después).`}
          >
            <input type="hidden" name="id" value={category.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="border border-rose-200 text-rose-600 hover:bg-rose-50"
              disabled={category._count.products > 0}
              title={
                category._count.products > 0
                  ? "Tiene productos asociados — moverlos primero"
                  : "Archivar categoría"
              }
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Archivar categoría
            </Button>
          </ConfirmAction>
        </AdminCard>
      </AdminPageBody>
    </AdminPage>
  );
}
