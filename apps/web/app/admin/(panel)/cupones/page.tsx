/*
 * Admin > Cupones — PLAN_CATALOG_V2 3.9.
 *
 * Lista todos los cupones con métricas básicas + crear inline.
 * Tipos PERCENT / FIXED / FREE_SHIPPING. Restricciones por cat/producto/min/uso.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Pause, Play, Ticket } from "lucide-react";
import { listCoupons } from "@/features/coupons/service";
import { getCurrentAdmin } from "@/lib/auth";
import { formatCOP } from "@/lib/format";
import { AdminPage, AdminPageHeader, AdminPageBody, AdminNotice } from "@/components/admin-page";
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

  function couponStatus(c: (typeof coupons)[number]) {
    if (c.deletedAt) return { label: "Archivado", color: "bg-slate-200 text-slate-700" };
    if (!c.isActive) return { label: "Pausado", color: "bg-amber-100 text-amber-800" };
    if (c.validTo < now) return { label: "Expirado", color: "bg-slate-200 text-slate-700" };
    if (c.validFrom > now) return { label: "Programado", color: "bg-blue-100 text-blue-800" };
    if (c.maxUses && c.usedCount >= c.maxUses) {
      return { label: "Agotado", color: "bg-orange-100 text-orange-800" };
    }
    return { label: "Activo", color: "bg-emerald-100 text-emerald-800" };
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
        breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Cupones" }]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Cómo funcionan?</strong> Crea códigos de descuento que el cliente ingresa en el
          carrito o se aplican vía URL <code>?promo=CODIGO</code>. Los cupones marcados{" "}
          <strong>Públicos</strong> son consumidos por <code>/api/coupons/public</code> y el bot
          WhatsApp futuro los puede informar.
        </AdminNotice>

        {sp.created === "1" && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            🟢 Cupón creado.
          </div>
        )}
        {sp.updated === "1" && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            🟢 Cupón actualizado.
          </div>
        )}
        {sp.paused === "1" && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            🟡 Cupón pausado (no visible al cliente).
          </div>
        )}
        {sp.resumed === "1" && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            🟢 Cupón reactivado.
          </div>
        )}
        {sp.archived === "1" && (
          <div className="rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700">
            ⚫ Cupón archivado.
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {coupons.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <Ticket className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-2 font-medium text-slate-700">Todavía no hay cupones.</p>
              <p className="mt-1 text-sm text-slate-500">Crea el primero abajo.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Valor</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Vigencia</th>
                  <th className="px-4 py-3">Usos</th>
                  <th className="px-4 py-3">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {coupons.map((c) => {
                  const status = couponStatus(c);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm">
                        <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs font-bold">
                          {c.code}
                        </code>
                        {c.isPublic && (
                          <span className="ml-2 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                            Público
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.type}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {formatValue(c)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {c.validFrom.toLocaleDateString("es-CO")} →{" "}
                        {c.validTo.toLocaleDateString("es-CO")}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
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
                              className="text-slate-500 hover:text-slate-700"
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-base font-bold text-slate-900">Crear cupón nuevo</h2>
          <CreateCouponForm />
        </div>
      </AdminPageBody>
    </AdminPage>
  );
}
