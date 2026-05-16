/*
 * Admin > Contenido > Bloque nuevo.
 *
 * Form de creación. Lo normal es que los bloques estén pre-cargados
 * en seed; esto sirve para que el admin agregue nuevos bloques
 * personalizados (banners promocionales temporales, FAQ extra, etc).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentAdmin } from "@/lib/auth";
import { CreateBlockForm } from "./create-block-form";

export const metadata: Metadata = {
  title: "Crear bloque",
};

export default async function NuevoBloquePage() {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Link
          href="/admin/contenido/bloques"
          className="mt-1 text-slate-500 hover:text-slate-700"
          aria-label="Volver"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Crear bloque nuevo</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Un bloque es un texto largo editable del sitio (página, banner, FAQ, mensaje).
          </p>
        </div>
      </div>

      <CreateBlockForm />
    </div>
  );
}
