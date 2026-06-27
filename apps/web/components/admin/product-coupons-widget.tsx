/*
 * <ProductCouponsWidget> — cupones vigentes que aplican a este producto.
 *
 * Lucy 2026-06-26 — Opción C Sprint 2: en lugar de mover cupones del módulo
 * Promociones (donde están bien), agregamos un widget read-only en la página
 * del producto que muestra qué cupones vigentes le aplican AHORA. Para crear
 * o editar, link directo al módulo /admin/cupones.
 *
 * Reglas de aplicabilidad (matchea con CouponSchema y service public):
 *  1. Cupón debe estar isActive=true, deletedAt=null
 *  2. validFrom <= now() <= validTo
 *  3. maxUses null o usedCount < maxUses
 *  4. Aplicabilidad por scope:
 *     - appliesToProductSlugs vacío Y appliesToCategories vacío => aplica a TODOS
 *     - appliesToProductSlugs contiene productSlug => aplica
 *     - appliesToCategories contiene categorySlug => aplica
 *     - sino => NO aplica
 */

import Link from "next/link";
import { Ticket, ExternalLink } from "lucide-react";
import { AdminCard } from "@/components/admin-page";
import { prisma } from "@/lib/db";
import { formatCOP } from "@/lib/format";

export async function ProductCouponsWidget({
  productSlug,
  categorySlug,
}: {
  productSlug: string;
  categorySlug: string | null;
}) {
  const now = new Date();
  const candidates = await prisma.coupon.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      validFrom: { lte: now },
      validTo: { gte: now },
    },
    select: {
      id: true,
      code: true,
      type: true,
      value: true,
      validTo: true,
      maxUses: true,
      usedCount: true,
      appliesToProductSlugs: true,
      appliesToCategories: true,
      description: true,
    },
    orderBy: { validTo: "asc" },
  });

  // Filtro aplicabilidad en aplicación (no SQL — array contains queries
  // requieren raw o lateral filter complicado, y el set de cupones activos
  // es muy chico: <50 típico).
  const applicable = candidates.filter((c) => {
    // Cupón sin restricciones aplica a todos.
    if (c.appliesToProductSlugs.length === 0 && c.appliesToCategories.length === 0) {
      return true;
    }
    if (c.appliesToProductSlugs.includes(productSlug)) return true;
    if (categorySlug && c.appliesToCategories.includes(categorySlug)) return true;
    return false;
  }).filter((c) => {
    // Filtrar agotados por maxUses.
    if (c.maxUses === null) return true;
    return c.usedCount < c.maxUses;
  });

  if (applicable.length === 0) {
    return (
      <AdminCard className="border-brand-purple/10 bg-brand-purple/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Ticket className="text-brand-purple-dark/55 h-4 w-4" />
            <div>
              <p className="text-brand-purple-dark/80 text-sm font-medium">
                Sin promociones activas para este producto
              </p>
              <p className="text-brand-purple-dark/55 text-xs">
                Crea un cupón desde Promociones para ofrecer descuentos.
              </p>
            </div>
          </div>
          <Link
            href="/admin/cupones"
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex h-9 items-center gap-1 rounded-md border bg-white px-3 text-xs font-semibold"
          >
            <Ticket className="h-3.5 w-3.5" />
            Crear cupón
          </Link>
        </div>
      </AdminCard>
    );
  }

  return (
    <AdminCard className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        {/* 6c: título honesto — algunos cupones aplican a TODA la tienda, no
            solo a este producto. El badge "General" lo aclara por fila. */}
        <h3 className="text-brand-purple-dark flex items-center gap-2 text-sm font-semibold">
          <Ticket className="h-4 w-4" />
          {applicable.length} promoción{applicable.length === 1 ? "" : "es"} que aplica
          {applicable.length === 1 ? "" : "n"} aquí
        </h3>
        <Link
          href="/admin/cupones"
          className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 text-xs font-semibold"
        >
          Editar promociones
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <ul className="space-y-2">
        {applicable.map((c) => (
          <CouponRow key={c.id} coupon={c} />
        ))}
      </ul>
    </AdminCard>
  );
}

function CouponRow({
  coupon,
}: {
  coupon: {
    id: string;
    code: string;
    type: "PERCENT" | "FIXED" | "FREE_SHIPPING";
    value: number;
    validTo: Date;
    maxUses: number | null;
    usedCount: number;
    appliesToProductSlugs: string[];
    appliesToCategories: string[];
    description: string | null;
  };
}) {
  const dateFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
  const isStoreWide =
    coupon.appliesToProductSlugs.length === 0 && coupon.appliesToCategories.length === 0;
  const scope = (() => {
    if (isStoreWide) return "Aplica a toda la tienda";
    if (coupon.appliesToProductSlugs.length > 0) return "Aplica a productos específicos";
    return "Aplica a categorías específicas";
  })();
  const value = (() => {
    switch (coupon.type) {
      case "PERCENT":
        return `-${coupon.value}%`;
      case "FIXED":
        return `-${formatCOP(coupon.value)}`;
      case "FREE_SHIPPING":
        return "Envío gratis";
    }
  })();

  return (
    <li className="border-brand-purple/10 bg-brand-cream/30 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="text-brand-purple-dark rounded bg-white px-2 py-0.5 font-mono text-xs font-bold">
            {coupon.code}
          </code>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
            {value}
          </span>
          {isStoreWide && (
            <span
              className="bg-brand-purple/10 text-brand-purple-dark rounded-full px-2 py-0.5 text-[10px] font-semibold"
              title="Este cupón aplica a toda la tienda, no solo a este producto"
            >
              🏪 General
            </span>
          )}
        </div>
        {coupon.description && (
          <p className="text-brand-purple-dark/65 mt-1 text-xs">{coupon.description}</p>
        )}
        <p className="text-brand-purple-dark/55 mt-0.5 text-[11px]">
          {scope} · Vence el {dateFmt.format(coupon.validTo)}
          {coupon.maxUses !== null && (
            <>
              {" · "}
              {coupon.usedCount}/{coupon.maxUses} usos
            </>
          )}
        </p>
      </div>
    </li>
  );
}
