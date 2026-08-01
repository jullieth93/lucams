/*
 * Admin > Contenido > Puerta por key (roadmap C1 paso 2 — modo edición).
 *
 * El overlay del modo edición navega acá con la key del campo clickeado en
 * el storefront; resolvemos el id real y redirigimos a su editor. Una key
 * desconocida (campo archivado, typo) vuelve al índice de contenido.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { getCmsFieldByKey } from "@/features/cms/service";

export const metadata: Metadata = {
  title: "Ir al campo",
};

export default async function CmsFieldByKeyPage({ params }: { params: Promise<{ key: string }> }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const { key } = await params;
  const field = await getCmsFieldByKey(decodeURIComponent(key));
  if (!field) redirect("/admin/contenido");
  redirect(`/admin/contenido/campos/${field.id}`);
}
