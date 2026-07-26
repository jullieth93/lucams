/*
 * Admin > Costos y márgenes — análisis de costo de fabricación vs precio de venta.
 *
 * No hay modelo de costeo propio (Fase 5 traerá costeo por materiales): el costo
 * unitario vive en Product.cost (centavos COP) y el precio de venta se deriva de
 * las variantes — ProductVariant.price con fallback a Product.basePrice cuando la
 * opción no tiene precio propio (misma regla de herencia que aplica el PDP).
 *
 * El margen se calcula sobre el precio MÍNIMO de variantes (peor escenario de
 * venta) y la tabla ordena ascendente: los productos que menos dejan aparecen
 * primero, para que Lucy sepa dónde subir precio o negociar insumos. Los
 * productos sin costo cargado van al final con badge gris — sin costo no hay
 * margen que analizar.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Calculator } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
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
import { Input } from "@/components/ui/input";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatCOP } from "@/lib/format";
import { updateProductCostAction } from "./actions";

export const metadata: Metadata = {
  title: "Costos y márgenes",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type Row = {
  id: string;
  name: string;
  sku: string;
  cost: number | null;
  minPrice: number;
  maxPrice: number;
  margin: number | null;
  marginPct: number | null;
};

function marginTone(pct: number): "rose" | "amber" | "emerald" {
  // Umbrales de bolsillo para Lucy: negativo = se pierde plata; <20% = queda
  // muy justo frente a envío/comisiones; el resto es sano.
  if (pct < 0) return "rose";
  if (pct < 20) return "amber";
  return "emerald";
}

export default async function AdminCostosPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;

  const products = await prisma.product.findMany({
    where: { deletedAt: null, isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      basePrice: true,
      cost: true,
      variants: {
        where: { deletedAt: null, isActive: true },
        select: { price: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows: Row[] = products.map((p) => {
    // Variante sin precio propio hereda basePrice; producto sin variantes
    // cotiza directo al basePrice.
    const prices =
      p.variants.length > 0 ? p.variants.map((v) => v.price ?? p.basePrice) : [p.basePrice];
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const margin = p.cost != null ? minPrice - p.cost : null;
    const marginPct = margin != null && minPrice > 0 ? (margin / minPrice) * 100 : null;
    return { id: p.id, name: p.name, sku: p.sku, cost: p.cost, minPrice, maxPrice, margin, marginPct };
  });

  // Peores primero; sin costo al final (no tienen margen calculable).
  rows.sort((a, b) => {
    if (a.margin == null && b.margin == null) return a.name.localeCompare(b.name, "es");
    if (a.margin == null) return 1;
    if (b.margin == null) return -1;
    return a.margin - b.margin;
  });

  const sinCosto = rows.filter((r) => r.cost == null).length;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Calculator className="h-5 w-5" />}
        title="Costos y márgenes"
        subtitle={
          <>
            {rows.length} {rows.length === 1 ? "producto activo" : "productos activos"} · ordenados
            por margen (menor primero)
            {sinCosto > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-amber-700">
                  {sinCosto} sin costo cargado
                </span>
              </>
            )}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Producción" },
          { label: "Costos" },
        ]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Cómo leer esta tabla?</strong> Escribe el <strong>costo de fabricación por
          unidad</strong> (materiales + mano de obra, en pesos) y la tabla calcula el margen contra
          el <strong>precio mínimo de venta</strong> del producto (su opción más barata). Los
          productos con peor margen aparecen primero: ahí es donde conviene subir precio o bajar
          costo.
        </AdminNotice>

        {sp.updated === "1" && <AdminNotice tone="success">Costo actualizado.</AdminNotice>}
        {typeof sp.error === "string" && <AdminNotice tone="error">{sp.error}</AdminNotice>}

        {rows.length === 0 ? (
          <AdminEmpty
            icon={<Calculator className="h-5 w-5" />}
            title="No hay productos activos"
            description="Cuando tengas productos activos en el catálogo, acá verás su costo y margen."
          />
        ) : (
          <AdminTable minWidth={800}>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Producto</th>
                <th className="px-4 py-3 text-left font-semibold">Costo unitario</th>
                <th className="px-4 py-3 text-right font-semibold">Precio mín.</th>
                <th className="px-4 py-3 text-right font-semibold">Precio máx.</th>
                <th className="px-4 py-3 text-right font-semibold">Margen $</th>
                <th className="px-4 py-3 text-center font-semibold">Margen %</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {rows.map((r) => (
                <AdminTableRow key={r.id}>
                  <td className="px-4 py-3 align-top">
                    <p className="text-brand-purple-dark font-semibold">{r.name}</p>
                    <p className="text-brand-muted font-mono text-[11px]">{r.sku}</p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {/* Input en PESOS (lo que Lucy conoce); la action convierte a centavos.
                        Vacío = quitar el costo. */}
                    <form action={updateProductCostAction} className="flex items-center gap-2">
                      <input type="hidden" name="productId" value={r.id} />
                      <Input
                        name="costPesos"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        placeholder="—"
                        defaultValue={r.cost != null ? Math.round(r.cost / 100) : ""}
                        aria-label={`Costo unitario de ${r.name} en pesos`}
                        className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-8 w-28"
                      />
                      <AdminButton type="submit" size="sm" variant="secondary" pendingLabel="…">
                        Guardar
                      </AdminButton>
                    </form>
                    {r.cost != null ? (
                      <p className="text-brand-muted mt-1 text-[11px]">{formatCOP(r.cost)}</p>
                    ) : (
                      <p className="mt-1 text-[11px] text-slate-400">sin costo</p>
                    )}
                  </td>
                  <td className="text-brand-purple-dark/85 px-4 py-3 text-right align-top tabular-nums">
                    {formatCOP(r.minPrice)}
                  </td>
                  <td className="text-brand-purple-dark/85 px-4 py-3 text-right align-top tabular-nums">
                    {formatCOP(r.maxPrice)}
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    {r.margin != null ? (
                      <span
                        className={
                          r.margin < 0
                            ? "font-semibold text-rose-600"
                            : "text-brand-purple-dark/85"
                        }
                      >
                        {formatCOP(r.margin)}
                      </span>
                    ) : (
                      <AdminBadge tone="slate">sin costo</AdminBadge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center align-top">
                    {r.marginPct != null ? (
                      <AdminBadge tone={marginTone(r.marginPct)}>
                        {r.marginPct.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%
                      </AdminBadge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
