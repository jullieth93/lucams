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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link
            href="/admin/dashboard"
            className="text-slate-500 hover:text-slate-700"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">
              Admin
            </p>
            <h1 className="text-lg font-bold text-slate-900">Categorías</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {justCreated && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
            ✓ Categoría creada.
          </div>
        )}
        {justDeleted && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
            Categoría archivada.
          </div>
        )}
        {errorMsg && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          {categories.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-slate-700 font-medium">
                Todavía no hay categorías.
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Crea la primera abajo para empezar a categorizar productos.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-medium w-16">Orden</th>
                  <th className="text-left px-4 py-3 font-medium">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium">Slug</th>
                  <th className="text-center px-4 py-3 font-medium">Productos</th>
                  <th className="text-center px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 tabular-nums text-slate-500">
                      {c.order}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{c.name}</div>
                      {c.description && (
                        <div className="text-xs text-slate-500 line-clamp-1">
                          {c.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      /{c.slug}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-700">
                      {c._count.products}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.isActive ? (
                        <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700">
                          Activa
                        </span>
                      ) : (
                        <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600">
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
                          className="text-red-700 hover:bg-red-50 h-7 px-2"
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
            <CardTitle className="text-base text-slate-900">
              Crear categoría
            </CardTitle>
            <CardDescription className="text-slate-600">
              Las categorías agrupan productos por tipo (ej. Magnéticos foto,
              Personalizados marca, Decorativos, Pack).
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
