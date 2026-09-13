/*
 * Admin > Cupones > [id] — Edición de un cupón existente.
 *
 * La lista (/admin/cupones) queda como hub; el form de edición tiene demasiados
 * campos para vivir inline en la fila (patrón ocasiones/[id]). Guardar llama
 * updateCouponAction (RBAC SUPER + auditoría) y vuelve a la lista con ?updated=1.
 * Un cupón archivado (soft-delete) no se edita: 404 — se administra desde la
 * vista "Archivados" del listado, en solo lectura.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Ticket } from "lucide-react";
import { AdminPage, AdminPageHeader, AdminPageBody } from "@/components/admin-page";
import { getCoupon } from "@/features/coupons/service";
import { requireRole } from "@/lib/admin-rbac-guard";
import { EditCouponForm } from "./edit-coupon-form";

export const metadata: Metadata = {
  title: "Cupón — Editar",
};

export default async function AdminCuponEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["SUPERADMIN"]);

  const { id } = await params;
  const coupon = await getCoupon(id);
  if (!coupon || coupon.deletedAt) notFound();

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Ticket className="h-5 w-5" />}
        title={`Editar ${coupon.code}`}
        subtitle={`${coupon.usedCount} ${coupon.usedCount === 1 ? "uso" : "usos"} registrados`}
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Cupones", href: "/admin/cupones" },
          { label: coupon.code },
        ]}
      />

      <AdminPageBody>
        <section className="border-brand-purple/15 rounded-xl border bg-white p-5 sm:p-6">
          <EditCouponForm
            coupon={{
              id: coupon.id,
              code: coupon.code,
              type: coupon.type,
              value: coupon.value,
              description: coupon.description,
              isPublic: coupon.isPublic,
              isActive: coupon.isActive,
              validFrom: coupon.validFrom,
              validTo: coupon.validTo,
              minOrder: coupon.minOrder,
              maxUses: coupon.maxUses,
              maxUsesPerCustomer: coupon.maxUsesPerCustomer,
              requiresMinQuantity: coupon.requiresMinQuantity,
              appliesToCategories: coupon.appliesToCategories,
              appliesToProductSlugs: coupon.appliesToProductSlugs,
            }}
          />
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
