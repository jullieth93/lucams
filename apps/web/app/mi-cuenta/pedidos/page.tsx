/*
 * /mi-cuenta/pedidos — Listado de pedidos del customer logueado.
 *
 * Muestra tabla con estado, total y fecha. Click → /mi-cuenta/pedidos/[number]
 * con detalle del pedido (tracking, etiqueta, items).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Package, ShoppingBag } from "lucide-react";
import { LucamsLogo } from "@/components/lucams-logo";
import { CmsText } from "@/components/cms/cms-text";
import { prisma } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth";
import { formatCOP } from "@/lib/format";
import { orderStatusBadgeClass, orderStatusLabel } from "@/features/orders/order-status-display";

export const metadata: Metadata = {
  title: "Mis pedidos",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MisPedidosPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta/pedidos");

  const orders = await prisma.order.findMany({
    where: { customerId: session.customer.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      shippingCarrier: true,
      trackingNumber: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  });

  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
          <CmsText blockKey="account.orders.heading" fallback="Mis pedidos" />
        </h1>
        {orders.length > 0 && (
          <p className="text-brand-muted mt-1 text-sm">
            {orders.length} {orders.length === 1 ? "pedido" : "pedidos"} en tu historial
          </p>
        )}
      </header>

      {orders.length === 0 ? (
        <div className="border-brand-purple/15 rounded-2xl border bg-white p-10 text-center">
          <LucamsLogo variant="full" size={110} className="mx-auto opacity-80" />
          <p className="text-brand-purple-dark mt-4 text-lg font-semibold">
            <CmsText blockKey="account.orders.empty.title" fallback="Aún no has hecho un pedido" />
          </p>
          <p className="text-brand-muted mt-2 text-sm">
            <CmsText
              blockKey="account.orders.empty.subtext"
              fallback="Cuando hagas tu primer pedido aparecerá aquí con todos los detalles ✨"
            />
          </p>
          <Link
            href="/productos"
            className="bg-brand-purple hover:bg-brand-purple-dark mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
          >
            <ShoppingBag className="h-4 w-4" />
            Ver catálogo
          </Link>
        </div>
      ) : (
        <div className="border-brand-purple/15 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <ul className="divide-brand-purple/10 divide-y">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/mi-cuenta/pedidos/${o.number}`}
                  className="hover:bg-brand-purple/[0.02] flex items-center gap-4 px-5 py-4 transition-colors"
                >
                  <div className="bg-brand-purple/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
                    <Package className="text-brand-purple h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-brand-purple-dark font-mono text-sm font-semibold">
                        {o.number}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${orderStatusBadgeClass(o.status)}`}
                      >
                        {orderStatusLabel(o.status)}
                      </span>
                    </div>
                    <div className="text-brand-muted mt-0.5 text-xs">
                      {dateFmt.format(o.createdAt)} · {o._count.items}{" "}
                      {o._count.items === 1 ? "producto" : "productos"}
                      {o.trackingNumber && (
                        <>
                          {" "}
                          · guía <span className="font-mono">{o.trackingNumber}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-brand-purple-dark text-right text-sm font-bold tabular-nums">
                    {formatCOP(o.total)}
                  </div>
                  <ChevronRight className="text-brand-muted h-4 w-4 flex-shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
