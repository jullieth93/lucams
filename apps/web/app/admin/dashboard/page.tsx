/*
 * Panel admin — Dashboard.
 *
 * Protegido por: proxy.ts redirige `/admin/*` (excepto `/admin/login`)
 * a `/admin/login` si no hay sesión Y AdminUser. Acá hacemos doble check
 * defensivo con `getCurrentAdmin()` por si proxy.ts cambia su gate.
 *
 * Versión Phase 1.b — métricas básicas (Customers / Orders / Products
 * / Reviews pendientes), placeholders de acciones rápidas que se
 * implementarán en Phase 2 (CRUD productos) y Phase 4 (gestión de
 * órdenes).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, Users, ShoppingBag, Package, MessageSquare, ExternalLink } from "lucide-react";
import { logoutAction } from "@/app/auth/logout/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AdminDashboardPage() {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  // Métricas básicas. En Phase 2/4 esto se va a expandir con queries
  // más ricas (ventas del mes, conversiones, top productos, etc.).
  const [customerCount, orderCount, productCount, pendingReviews] = await Promise.all([
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.order.count({ where: { deletedAt: null } }),
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.review.count({
      where: { isApproved: false, deletedAt: null },
    }),
  ]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs tracking-wider text-slate-500 uppercase">Panel admin</p>
            <h1 className="text-lg font-bold text-slate-900">
              {session.admin.email}{" "}
              <span className="text-sm font-normal text-slate-500">· {session.admin.role}</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ExternalLink className="h-4 w-4" />
              Ir al sitio
            </Link>
            <form action={logoutAction}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-slate-700 hover:bg-slate-100"
              >
                <LogOut className="mr-1.5 h-4 w-4" />
                Cerrar sesión
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wider text-slate-500 uppercase">
            Estado del negocio
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard
              icon={<Users className="h-5 w-5" />}
              label="Clientes"
              value={customerCount}
              accent="text-blue-700 bg-blue-50"
            />
            <MetricCard
              icon={<ShoppingBag className="h-5 w-5" />}
              label="Órdenes"
              value={orderCount}
              accent="text-emerald-700 bg-emerald-50"
            />
            <MetricCard
              icon={<Package className="h-5 w-5" />}
              label="Productos"
              value={productCount}
              accent="text-amber-700 bg-amber-50"
            />
            <MetricCard
              icon={<MessageSquare className="h-5 w-5" />}
              label="Reseñas pendientes"
              value={pendingReviews}
              accent="text-rose-700 bg-rose-50"
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wider text-slate-500 uppercase">
            Acciones rápidas
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Link
              href="/admin/categorias"
              className="block rounded-lg transition-shadow hover:shadow-md"
            >
              <Card className="h-full border-slate-200 hover:border-slate-300">
                <CardHeader>
                  <CardTitle className="text-base text-slate-900">Categorías →</CardTitle>
                  <CardDescription className="text-slate-600">
                    Agrupar productos por tipo. Necesario antes de crear productos.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Disponible
                  </span>
                </CardContent>
              </Card>
            </Link>

            <Link
              href="/admin/productos"
              className="block rounded-lg transition-shadow hover:shadow-md"
            >
              <Card className="h-full border-slate-200 hover:border-slate-300">
                <CardHeader>
                  <CardTitle className="text-base text-slate-900">Productos →</CardTitle>
                  <CardDescription className="text-slate-600">
                    Crear, editar, archivar productos del catálogo.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Disponible
                  </span>
                </CardContent>
              </Card>
            </Link>

            <Link
              href="/admin/contenido"
              className="block rounded-lg transition-shadow hover:shadow-md"
            >
              <Card className="h-full border-slate-200 hover:border-slate-300">
                <CardHeader>
                  <CardTitle className="text-base text-slate-900">
                    Contenido del sitio (avanzado) →
                  </CardTitle>
                  <CardDescription className="text-slate-600">
                    Para cambios rápidos del día a día, usa el botón{" "}
                    <span className="bg-brand-purple/10 text-brand-purple inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium">
                      ✏ Editar este sitio
                    </span>{" "}
                    abajo a la derecha del sitio público. Acá adentro: historial de cambios,
                    revertir versiones, crear bloques nuevos manualmente y gestión avanzada.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Disponible
                  </span>
                </CardContent>
              </Card>
            </Link>

            <Link
              href="/admin/auditoria"
              className="block rounded-lg transition-shadow hover:shadow-md"
            >
              <Card className="h-full border-slate-200 hover:border-slate-300">
                <CardHeader>
                  <CardTitle className="text-base text-slate-900">Auditoría →</CardTitle>
                  <CardDescription className="text-slate-600">
                    Quién cambió qué cuándo. Registro inmutable de todas las acciones admin
                    (crear/editar/borrar productos, contenido CMS, settings, logins).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Disponible
                  </span>
                </CardContent>
              </Card>
            </Link>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-base text-slate-900">Órdenes</CardTitle>
                <CardDescription className="text-slate-600">
                  Ver pedidos, cambiar estado, generar envío Venndelo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  Próximamente · Fase 4
                </span>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-base text-slate-900">Reseñas</CardTitle>
                <CardDescription className="text-slate-600">
                  Aprobar o rechazar reseñas pendientes de moderación.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  Próximamente · Fase 2
                </span>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className={`inline-flex items-center justify-center rounded-md p-2 ${accent}`}>
        {icon}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-slate-900 tabular-nums">{value.toLocaleString()}</p>
        <p className="text-sm text-slate-600">{label}</p>
      </div>
    </div>
  );
}
