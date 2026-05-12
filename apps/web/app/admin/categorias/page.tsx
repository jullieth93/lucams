/*
 * Admin > Categorías — Listado simple + crear inline.
 *
 * Las categorías son menos numerosas que los productos (típicamente
 * <20 en un e-commerce). Un solo screen con tabla + form de crear
 * abajo basta. Edición inline (cada row tiene su form). No paginación.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listCategories } from "@/features/categories/service";
import { getCurrentAdmin } from "@/lib/auth";
import { CreateCategoryForm } from "./create-category-form";
import { deleteCategoryAction } from "./actions";

export const metadata: Metadata = {
  title: "Categorías",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function AdminCategoriasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const categories = await listCategories();
  const justCreated = sp.created === "1";
  const justDeleted = sp.deleted === "1";
  const errorMsg = typeof sp.error === "string" ? sp.error : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-4">
          <Link
            href="/admin/dashboard"
            className="text-slate-500 hover:text-slate-700"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-xs tracking-wider text-slate-500 uppercase">Admin</p>
            <h1 className="text-lg font-bold text-slate-900">Categorías</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        {justCreated && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            ✓ Categoría creada.
          </div>
        )}
        {justDeleted && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Categoría archivada.
          </div>
        )}
        {errorMsg && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {categories.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="font-medium text-slate-700">Todavía no hay categorías.</p>
              <p className="mt-1 text-sm text-slate-500">
                Crea la primera abajo para empezar a categorizar productos.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs tracking-wider text-slate-600 uppercase">
                <tr>
                  <th className="w-16 px-4 py-3 text-left font-medium">Orden</th>
                  <th className="px-4 py-3 text-left font-medium">Nombre</th>
                  <th className="px-4 py-3 text-left font-medium">Slug</th>
                  <th className="px-4 py-3 text-center font-medium">Productos</th>
                  <th className="px-4 py-3 text-center font-medium">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500 tabular-nums">{c.order}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{c.name}</div>
                      {c.description && (
                        <div className="line-clamp-1 text-xs text-slate-500">{c.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">/{c.slug}</td>
                    <td className="px-4 py-3 text-center text-slate-700 tabular-nums">
                      {c._count.products}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.isActive ? (
                        <span className="inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Activa
                        </span>
                      ) : (
                        <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          Inactiva
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={deleteCategoryAction} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-red-700 hover:bg-red-50"
                          aria-label={`Archivar ${c.name}`}
                          disabled={c._count.products > 0}
                          title={
                            c._count.products > 0
                              ? "Tiene productos asociados — moverlos primero"
                              : "Archivar"
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base text-slate-900">Crear categoría</CardTitle>
            <CardDescription className="text-slate-600">
              Las categorías agrupan productos por tipo (ej. Magnéticos foto, Personalizados marca,
              Decorativos, Pack).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateCategoryForm />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
