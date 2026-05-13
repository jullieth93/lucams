/*
 * /mi-cuenta/pedidos — Listado de pedidos del customer logueado.
 *
 * Hoy es PLACEHOLDER: el checkout productivo entra en Fase 4. Si el
 * customer tiene 0 órdenes (caso día 1), muestra empty state kawaii.
 * Cuando llegue Fase 4, este page se llena con la tabla real de orders.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Package, ShoppingBag } from "lucide-react";
import { LucamsLogo } from "@/components/lucams-logo";
import { CmsText } from "@/components/cms/cms-text";
import { prisma } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Mis pedidos",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MisPedidosPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?redirectTo=/mi-cuenta/pedidos");

  const orders = await prisma.order.findMany({
    where: { customerId: session.customer.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      createdAt: true,
    },
  });

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <main className="flex-1 px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <header className="mb-8">
            <Link
              href="/mi-cuenta"
              className="text-brand-purple-dark/60 hover:text-brand-purple mb-2 inline-block text-xs"
            >
              ← Mi cuenta
            </Link>
            <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
              <CmsText blockKey="account.orders.heading" fallback="Mis pedidos" />
            </h1>
          </header>

          {orders.length === 0 ? (
            <div className="border-brand-purple/15 rounded-2xl border bg-white p-10 text-center">
              <LucamsLogo variant="full" size={110} className="mx-auto opacity-80" />
              <p className="text-brand-purple-dark mt-4 text-lg font-semibold">
                <CmsText
                  blockKey="account.orders.empty.title"
                  fallback="Aún no has hecho un pedido"
                />
              </p>
              <p className="text-brand-purple-dark/65 mt-2 text-sm">
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
            <div className="border-brand-purple/15 overflow-hidden rounded-2xl border bg-white">
              <ul className="divide-y">
                {orders.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 px-5 py-3">
                    <Package className="text-brand-purple h-4 w-4 flex-shrink-0" />
                    <div className="flex-1 text-sm">
                      <p className="text-brand-purple-dark font-semibold">Pedido #{o.number}</p>
                      <p className="text-brand-purple-dark/60 text-xs">
                        {o.createdAt.toLocaleDateString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <span className="bg-brand-purple/10 text-brand-purple-dark rounded-full px-2 py-0.5 text-xs font-medium">
                      {o.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
