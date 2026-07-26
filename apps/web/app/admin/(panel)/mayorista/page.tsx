/*
 * Admin > Mayorista B2B — niveles de precio por volumen (WholesaleTier).
 *
 * Cada nivel define: a partir de `minQty` unidades, el precio por unidad baja
 * a `unitPrice` (centavos COP). Un nivel con productId NULL es global ("Todo
 * el catálogo") y aplica a cualquier producto; uno con producto solo a ese.
 * La lista se agrupa por alcance para que Lucy vea de un vistazo la escala
 * de precios de cada producto sin filtrar.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
} from "@/components/admin-page";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatCOP } from "@/lib/format";
import { deleteWholesaleTierAction, toggleWholesaleTierAction } from "./actions";
import { CreateTierForm } from "./create-tier-form";

export const metadata: Metadata = {
  title: "Precios mayoristas (B2B)",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function AdminMayoristaPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;

  const [tiers, products] = await Promise.all([
    prisma.wholesaleTier.findMany({
      where: { deletedAt: null },
      include: { product: { select: { id: true, name: true } } },
      orderBy: { minQty: "asc" },
    }),
    prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, basePrice: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Agrupa por alcance: primero los niveles globales (catálogo completo),
  // luego un grupo por producto en orden alfabético.
  const groups = new Map<string, { label: string; tiers: typeof tiers }>();
  for (const tier of tiers) {
    const key = tier.productId ?? "__catalogo__";
    const label = tier.product?.name ?? "Todo el catálogo";
    const group = groups.get(key) ?? { label, tiers: [] };
    group.tiers.push(tier);
    groups.set(key, group);
  }
  const sortedGroups = [...groups.entries()].sort(([aKey, a], [bKey, b]) => {
    if (aKey === "__catalogo__") return -1;
    if (bKey === "__catalogo__") return 1;
    return a.label.localeCompare(b.label, "es");
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Building2 className="h-5 w-5" />}
        title="Precios mayoristas (B2B)"
        subtitle={
          <>
            {tiers.length} {tiers.length === 1 ? "nivel de precio" : "niveles de precio"} · precios
            especiales por volumen para compras al por mayor
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Promociones" },
          { label: "Mayorista B2B" },
        ]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Cómo funciona?</strong> Cada nivel dice: “a partir de <strong>X unidades</strong>,
          la unidad cuesta <strong>$Y</strong>”. Un nivel de <strong>Todo el catálogo</strong> aplica
          a cualquier producto; uno de un producto específico solo a ese. Si un nivel está{" "}
          <strong>desactivado</strong>, simplemente no se aplica.
        </AdminNotice>

        {sp.created === "1" && <AdminNotice tone="success">Nivel mayorista creado.</AdminNotice>}
        {sp.activated === "1" && <AdminNotice tone="success">Nivel activado.</AdminNotice>}
        {sp.deactivated === "1" && (
          <AdminNotice tone="warning">Nivel desactivado (no se aplica).</AdminNotice>
        )}
        {sp.deleted === "1" && <AdminNotice tone="warning">Nivel eliminado.</AdminNotice>}
        {typeof sp.error === "string" && <AdminNotice tone="error">{sp.error}</AdminNotice>}

        <AdminCard className="p-5">
          <h2 className="text-brand-purple-dark font-display mb-4 flex items-center gap-2 text-base font-bold">
            <Plus className="h-5 w-5" />
            Crear nivel de precio
          </h2>
          <CreateTierForm products={products} />
        </AdminCard>

        {tiers.length === 0 ? (
          <AdminEmpty
            icon={<Building2 className="h-5 w-5" />}
            title="No hay niveles mayoristas todavía"
            description="Usa el formulario de arriba para crear el primero: elige el producto (o todo el catálogo), la cantidad mínima y el precio por unidad."
          />
        ) : (
          sortedGroups.map(([key, group]) => (
            <section key={key} className="space-y-2">
              <h2 className="text-brand-purple-dark font-display flex items-center gap-2 text-base font-bold">
                {group.label}
                <AdminBadge tone={key === "__catalogo__" ? "turquoise" : "purple"}>
                  {key === "__catalogo__" ? "Global" : `${group.tiers.length} niveles`}
                </AdminBadge>
              </h2>
              <AdminTable>
                <AdminTableHead>
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Cantidad mínima</th>
                    <th className="px-4 py-3 text-right font-semibold">Precio por unidad</th>
                    <th className="px-4 py-3 text-left font-semibold">Nota</th>
                    <th className="px-4 py-3 text-center font-semibold">Estado</th>
                    <th className="px-4 py-3 text-left font-semibold">Creado</th>
                    <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </AdminTableHead>
                <AdminTableBody>
                  {group.tiers.map((t) => (
                    <AdminTableRow key={t.id}>
                      <td className="text-brand-purple-dark px-4 py-3 align-top font-semibold tabular-nums">
                        {t.minQty.toLocaleString("es-CO")}+ unidades
                      </td>
                      <td className="text-brand-purple-dark px-4 py-3 text-right align-top font-semibold tabular-nums">
                        {formatCOP(t.unitPrice)}
                      </td>
                      <td className="text-brand-muted px-4 py-3 align-top text-xs">
                        {t.note ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center align-top">
                        {t.isActive ? (
                          <AdminBadge tone="emerald">Activo</AdminBadge>
                        ) : (
                          <AdminBadge tone="amber">Desactivado</AdminBadge>
                        )}
                      </td>
                      <td className="text-brand-muted px-4 py-3 align-top text-xs">
                        {dateFmt.format(t.createdAt)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <form action={toggleWholesaleTierAction}>
                            <input type="hidden" name="id" value={t.id} />
                            <button
                              type="submit"
                              className={
                                t.isActive
                                  ? "text-[11px] font-medium text-amber-700 hover:text-amber-900"
                                  : "text-[11px] font-medium text-emerald-700 hover:text-emerald-900"
                              }
                            >
                              {t.isActive ? "Desactivar" : "Activar"}
                            </button>
                          </form>
                          <ConfirmAction
                            action={deleteWholesaleTierAction}
                            message="¿Eliminar este nivel de precio? Dejará de aplicar de inmediato."
                          >
                            <input type="hidden" name="id" value={t.id} />
                            <button
                              type="submit"
                              className="text-brand-muted text-[11px] font-medium hover:text-rose-600"
                            >
                              Eliminar
                            </button>
                          </ConfirmAction>
                        </div>
                      </td>
                    </AdminTableRow>
                  ))}
                </AdminTableBody>
              </AdminTable>
            </section>
          ))
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
