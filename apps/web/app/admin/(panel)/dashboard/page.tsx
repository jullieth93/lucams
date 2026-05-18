/*
 * Panel admin — Dashboard (rediseño brand 2026-05-18).
 *
 * Inspirado en commerce-ops dashboard (tabs Operaciones/Negocio + OpsCards
 * + QuickLinks + glow-brand). Adaptado a paleta Lucams.
 *
 * Estructura:
 *   - Hero: saludo con name + tagline + chip alerta si hay reseñas pendientes
 *   - Operaciones: 4 OpsCards (Pedidos pendientes, Reclamos abiertos,
 *     Bajo stock, Reseñas pendientes) — algunos urgentes (>0)
 *   - Negocio: 4 KpiCards (Clientes, Productos, Ocasiones activas, Cupones vigentes)
 *   - Acceso rápido: 6 QuickLinks a las pantallas operativas
 *   - Sección "Próximamente" colapsada con módulos placeholder Fase 4/5
 *
 * Datos: Prisma queries en paralelo. Soft-delete filtrado.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Sparkles,
  Zap,
  ShoppingBag,
  Layers,
  Tag,
  Ticket,
  BookOpen,
  Activity,
  Settings,
  Cog,
  Box,
  AlertCircle,
  AlertTriangle,
  Star,
} from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  OpsCard,
  KpiCard,
  QuickLink,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AdminDashboardPage() {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const [
    customerCount,
    orderCount,
    productCount,
    pendingReviews,
    ocasionCount,
    activeCouponCount,
    subCategoryCount,
  ] = await Promise.all([
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.order.count({ where: { deletedAt: null } }),
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.review.count({ where: { isApproved: false, deletedAt: null } }),
    prisma.ocasionTag.count({ where: { deletedAt: null, isActive: true } }),
    prisma.coupon.count({
      where: {
        deletedAt: null,
        isActive: true,
        validFrom: { lte: new Date() },
        validTo: { gte: new Date() },
      },
    }),
    prisma.category.count({ where: { deletedAt: null, parentId: { not: null } } }),
  ]);

  const firstName = session.admin.email.split("@")[0];

  // Operaciones urgentes (placeholder hasta Fase 4 — orders / reclamos / stock real)
  const opsAlerts = pendingReviews; // por ahora solo reseñas
  const hasAlerts = opsAlerts > 0;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Sparkles className="h-5 w-5" />}
        title={
          <>
            Hola, <span className="text-gradient-brand">{firstName}</span>{" "}
            <span className="inline-block">👋</span>
          </>
        }
        subtitle={
          <>
            Bienvenida al panel. Aquí puedes gestionar todo el negocio:{" "}
            <strong className="text-brand-purple">{productCount}</strong> productos,{" "}
            <strong className="text-brand-purple">{ocasionCount}</strong> ocasiones,{" "}
            <strong className="text-brand-purple">{activeCouponCount}</strong> cupones vigentes.
          </>
        }
        actions={
          hasAlerts ? (
            <div className="bg-brand-coral/10 text-brand-coral ring-brand-coral/30 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ring-1">
              <Zap className="h-4 w-4" />
              {opsAlerts} {opsAlerts === 1 ? "alerta" : "alertas"}
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Todo al día
            </div>
          )
        }
      />

      <AdminPageBody>
        {/* ─────────────── Operaciones ─────────────── */}
        <section>
          <h2 className="text-brand-purple-dark/55 mb-3 text-xs font-bold tracking-widest uppercase">
            Operaciones del día
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <OpsCard
              href="/admin/pedidos"
              icon={Box}
              label="Pedidos pendientes"
              value={orderCount}
              description="Por confirmar"
              tone="purple"
            />
            <OpsCard
              href="/admin/reclamos"
              icon={AlertCircle}
              label="Reclamos abiertos"
              value={0}
              description="Sin gestionar"
              tone="coral"
            />
            <OpsCard
              href="/admin/productos"
              icon={AlertTriangle}
              label="Productos sin stock"
              value={0}
              description="Variantes críticas"
              tone="amber"
            />
            <OpsCard
              href="/admin/resenas"
              icon={Star}
              label="Reseñas por moderar"
              value={pendingReviews}
              description={pendingReviews > 0 ? "Requieren tu visto bueno" : "Todo aprobado"}
              tone="pink"
              urgent={pendingReviews > 0}
            />
          </div>
        </section>

        {/* ─────────────── Negocio (KPIs) ─────────────── */}
        <section>
          <h2 className="text-brand-purple-dark/55 mb-3 text-xs font-bold tracking-widest uppercase">
            Estado del negocio
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="Clientes" value={customerCount} />
            <KpiCard label="Productos" value={productCount} />
            <KpiCard label="Sub-categorías" value={subCategoryCount} />
            <KpiCard label="Cupones vigentes" value={activeCouponCount} />
          </div>
        </section>

        {/* ─────────────── Acceso rápido ─────────────── */}
        <section>
          <h2 className="text-brand-purple-dark/55 mb-3 text-xs font-bold tracking-widest uppercase">
            Acceso rápido
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <QuickLink
              href="/admin/productos"
              icon={ShoppingBag}
              label="Productos"
              description="Crear, editar y archivar el catálogo."
            />
            <QuickLink
              href="/admin/categorias"
              icon={Layers}
              label="Categorías"
              description="Agrupar productos por tipo. Sub-categorías incluidas."
            />
            <QuickLink
              href="/admin/ocasiones"
              icon={Tag}
              label="Ocasiones"
              description="Tags transversales para que el cliente filtre por momento."
            />
            <QuickLink
              href="/admin/cupones"
              icon={Ticket}
              label="Cupones"
              description="Códigos de descuento: porcentaje, monto fijo, envío gratis."
            />
            <QuickLink
              href="/admin/contenido/bloques"
              icon={BookOpen}
              label="Base de conocimiento"
              description="Edita los textos del sitio (legales, FAQ, hero) y prepara el bot futuro."
            />
            <QuickLink
              href="/admin/contenido/configuracion"
              icon={Cog}
              label="Configuración general"
              description="Email, WhatsApp, horario, redes y datos del negocio."
            />
          </div>
        </section>

        {/* ─────────────── Auditoría ─────────────── */}
        <section>
          <h2 className="text-brand-purple-dark/55 mb-3 text-xs font-bold tracking-widest uppercase">
            Trazabilidad
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <QuickLink
              href="/admin/auditoria"
              icon={Activity}
              label="Auditoría"
              description="Quién cambió qué y cuándo. Registro inmutable de acciones admin."
            />
            <QuickLink
              href="/admin/contenido/configuracion"
              icon={Settings}
              label="Ajustes del sitio"
              description="Banners legales, plazos, contacto, copyrights y subprocesadores."
            />
          </div>
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
