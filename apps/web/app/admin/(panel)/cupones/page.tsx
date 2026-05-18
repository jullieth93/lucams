/*
 * Admin > Cupones — PLAN_CATALOG_V2 3.9 + brand palette 2026-05-18.
 *
 * Tipos PERCENT / FIXED / FREE_SHIPPING. Restricciones por cat/producto/min/uso.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Pause, Play, Ticket } from "lucide-react";
import { listCoupons } from "@/features/coupons/service";
import { getCurrentAdmin } from "@/lib/auth";
import { formatCOP } from "@/lib/format";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminNotice,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminBadge,
  AdminEmpty,
  AdminCard,
} from "@/components/admin-page";
import { CreateCouponForm } from "./create-coupon-form";
import { pauseCouponAction, resumeCouponAction } from "./actions";

export const metadata: Metadata = {
  title: "Cupones",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function AdminCuponesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const coupons = await listCoupons();
  const now = new Date();

  type CouponBadge = {
    label: string;
    tone: "emerald" | "amber" | "slate" | "blue" | "rose";
  };

  function couponStatus(c: (typeof coupons)[number]): CouponBadge {
    if (c.deletedAt) return { label: "Archivado", tone: "slate" };
    if (!c.isActive) return { label: "Pausado", tone: "amber" };
    if (c.validTo < now) return { label: "Expirado", tone: "slate" };
    if (c.validFrom > now) return { label: "Programado", tone: "blue" };
    if (c.maxUses && c.usedCount >= c.maxUses) return { label: "Agotado", tone: "rose" };
    return { label: "Activo", tone: "emerald" };
  }

  function formatValue(c: (typeof coupons)[number]) {
    if (c.type === "PERCENT") return `${c.value}%`;
    if (c.type === "FREE_SHIPPING") return "Envío gratis";
    return formatCOP(c.value);
  }

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Ticket className="h-5 w-5" />}
        title="Cupones"
        subtitle="Códigos de descuento con restricciones por categoría / producto / mínimos / vigencia."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Comercial" },
          { label: "Cupones" },
        ]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Cómo funcionan?</strong> Crea códigos de descuento que el cliente ingresa en el
          carrito o se aplican vía URL <code>?promo=CODIGO</code>. Los marcados{" "}
          <strong>Públicos</strong> son consumidos por <code>/api/coupons/public</code> y el bot
          WhatsApp futuro los puede informar.
        </AdminNotice>

        {sp.created === "1" && <AdminNotice tone="success">Cupón creado.</AdminNotice>}
        {sp.updated === "1" && <AdminNotice tone="success">Cupón actualizado.</AdminNotice>}
        {sp.paused === "1" && (
          <AdminNotice tone="warning">Cupón pausado (no visible al cliente).</AdminNotice>
        )}
        {sp.resumed === "1" && <AdminNotice tone="success">Cupón reactivado.</AdminNotice>}
        {sp.archived === "1" && <AdminNotice tone="warning">Cupón archivado.</AdminNotice>}

        {coupons.length === 0 ? (
          <AdminEmpty
            icon={<Ticket className="h-5 w-5" />}
            title="Todavía no hay cupones"
            description="Crea el primero abajo para empezar a otorgar descuentos."
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Código</th>
                <th className="px-4 py-3 text-left font-semibold">Tipo</th>
                <th className="px-4 py-3 text-left font-semibold">Valor</th>
                <th className="px-4 py-3 text-left font-semibold">Estado</th>
                <th className="px-4 py-3 text-left font-semibold">Vigencia</th>
                <th className="px-4 py-3 text-left font-semibold">Usos</th>
                <th className="px-4 py-3 text-right font-semibold">Acción</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {coupons.map((c) => {
                const status = couponStatus(c);
                return (
                  <AdminTableRow key={c.id}>
                    <td className="px-4 py-3 text-sm">
                      <code className="bg-brand-purple/10 text-brand-purple-dark rounded px-2 py-1 font-mono text-xs font-bold">
                        {c.code}
                      </code>
                      {c.isPublic && (
                        <span className="ml-2 inline-block">
                          <AdminBadge tone="blue">Público</AdminBadge>
                        </span>
                      )}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-sm">{c.type}</td>
                    <td className="text-brand-purple-dark px-4 py-3 text-sm font-semibold">
                      {formatValue(c)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
                    </td>
                    <td className="text-brand-purple-dark/55 px-4 py-3 text-xs">
                      {c.validFrom.toLocaleDateString("es-CO")} →{" "}
                      {c.validTo.toLocaleDateString("es-CO")}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-sm tabular-nums">
                      {c.usedCount}
                      {c.maxUses ? ` / ${c.maxUses}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!c.deletedAt && (
                        <form
                          action={c.isActive ? pauseCouponAction : resumeCouponAction}
                          className="inline"
                        >
                          <input type="hidden" name="id" value={c.id} />
                          <button
                            type="submit"
                            className="text-brand-purple/65 hover:text-brand-purple-dark"
                            title={c.isActive ? "Pausar" : "Reactivar"}
                          >
                            {c.isActive ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </button>
                        </form>
                      )}
                    </td>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        )}

        <AdminCard className="p-5">
          <h3 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
            Crear cupón nuevo
          </h3>
          <CreateCouponForm />
        </AdminCard>
      </AdminPageBody>
    </AdminPage>
  );
}
