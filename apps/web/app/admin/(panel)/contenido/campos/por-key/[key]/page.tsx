/*
 * Admin > Contenido > Puerta por key (roadmap C1 paso 2 — modo edición).
 *
 * El overlay del modo edición navega acá con la key del campo clickeado en
 * el storefront; resolvemos el id real y redirigimos a su editor. Una key
 * desconocida (campo archivado, typo) vuelve al índice de contenido.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_ROLE_SETS, adminHomePath, canAccessAdminPath } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { prisma } from "@/lib/db";
import { MODULE_MANAGED_SETTING_KEYS, ownerModuleHrefForSettingKey } from "../../../page-icons";

export const metadata: Metadata = {
  title: "Ir al campo",
};

export default async function CmsFieldByKeyPage({ params }: { params: Promise<{ key: string }> }) {
  const session = await requireRole(ADMIN_ROLE_SETS.CONTENT);

  const { key } = await params;
  const decodedKey = decodeURIComponent(key);

  if (MODULE_MANAGED_SETTING_KEYS.has(decodedKey)) {
    const ownerHref = ownerModuleHrefForSettingKey(decodedKey) ?? "/admin/contenido/paginas/global";
    if (canAccessAdminPath(session.admin.role, ownerHref)) {
      redirect(ownerHref);
    }
    redirect(`${adminHomePath(session.admin.role)}?denied=1`);
  }

  const field = await prisma.cmsField.findFirst({
    where: { key: decodedKey, deletedAt: null },
    select: {
      id: true,
      section: { select: { page: { select: { slug: true } } } },
    },
  });
  if (!field) redirect("/admin/contenido");

  if (field.section.page.slug === "global" && session.admin.role !== "SUPERADMIN") {
    redirect(`${adminHomePath(session.admin.role)}?denied=1`);
  }

  redirect(`/admin/contenido/campos/${field.id}`);
}
