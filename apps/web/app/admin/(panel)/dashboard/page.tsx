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
  LifeBuoy,
  ShieldCheck,
  Shapes,
  LayoutTemplate,
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
import { getInventorySummary } from "@/features/products/inventory-service";
import { countOpenSupportTickets } from "@/features/support/admin-service";
import { countOpenWarrantyClaims } from "@/features/warranty/service";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AdminDashboardPage() {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  // Pedidos pendientes = Orders en PENDING_PAYMENT (esperando pago Wompi).
  // No incluyo PAID/FULFILLING porque esos ya están en producción.
  // Lucy 2026-06-26 — antes orderCount era count total, mostraba ruido en KPI.
  const pendingOrdersWhere = {
    deletedAt: null,
    status: "PENDING_PAYMENT" as const,
  };

  const [
    customerCount,
    pendingOrderCount,
    productCount,
    pendingReviews,
    ocasionCount,
    activeCouponCount,
    subCategoryCount,
    inventorySummary,
    openTickets,
    openWarranty,
  ] = await Promise.all([
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.order.count({ where: pendingOrdersWhere }),
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
    // Lucy 2026-06-26 — Opción C Sprint 1: KPI real de inventario reemplaza
    // los hardcoded `0` que mentían sobre stock y reclamos.
    getInventorySummary(),
    countOpenSupportTickets(),
    countOpenWarrantyClaims(),
  ]);

  // Lucy 2026-06-26 hotfix #2 P0-12: el saludo antes mostraba "Hola, crittan01"
  // (username del email) — violaba el mandato admin no-técnico. Ahora derivamos
  // un nombre legible quitando dígitos trailing y separadores; si queda algo
  // raro o muy corto, fallback "Hola 👋" sin nombre.
  const displayName = deriveAdminDisplayName(session.admin.email);

  // Operaciones urgentes — combinamos señales reales:
  // pedidos pendientes pago + variants agotadas + reseñas sin moderar.
  // hasAlerts dispara el chip "Atención" en el hero.
  const opsAlerts =
    pendingOrderCount + inventorySummary.outCount + pendingReviews + openTickets + openWarranty;
  const hasAlerts = opsAlerts > 0;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Sparkles className="h-5 w-5" />}
        title={
          displayName ? (
            <>
              Hola, <span className="text-gradient-brand">{displayName}</span>{" "}
              <span className="inline-block">👋</span>
            </>
          ) : (
            <>
              <span className="text-gradient-brand">Hola</span>{" "}
              <span className="inline-block">👋</span>
            </>
          )
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
          <h2 className="text-brand-muted mb-3 text-xs font-bold tracking-widest uppercase">
            Operaciones del día
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <OpsCard
              href="/admin/pedidos?estado=PENDING_PAYMENT"
              icon={Box}
              label="Pedidos pendientes pago"
              value={pendingOrderCount}
              description={
                pendingOrderCount > 0 ? "Esperan completar pago" : "Sin pendientes"
              }
              tone="purple"
              urgent={pendingOrderCount > 0}
            />
            <OpsCard
              href="/admin/inventario?estado=out"
              icon={AlertTriangle}
              label="Opciones agotadas"
              value={inventorySummary.outCount}
              description={
                inventorySummary.outCount > 0
                  ? "No se pueden vender hasta reponer"
                  : "Todo con stock"
              }
              tone="amber"
              urgent={inventorySummary.outCount > 0}
            />
            <OpsCard
              href="/admin/inventario?estado=low"
              icon={AlertCircle}
              label="Stock bajo"
              value={inventorySummary.lowCount}
              description={
                inventorySummary.lowCount > 0
                  ? "5 unidades o menos"
                  : "Sin alertas de stock bajo"
              }
              tone="coral"
              urgent={inventorySummary.lowCount > 0}
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
            <OpsCard
              href="/admin/soporte"
              icon={LifeBuoy}
              label="Tickets de soporte"
              value={openTickets}
              description={openTickets > 0 ? "Clientes esperan respuesta" : "Sin tickets abiertos"}
              tone="turquoise"
              urgent={openTickets > 0}
            />
            <OpsCard
              href="/admin/garantias"
              icon={ShieldCheck}
              label="Reclamos de garantía"
              value={openWarranty}
              description={openWarranty > 0 ? "Requieren diagnóstico" : "Sin reclamos activos"}
              tone="purple"
              urgent={openWarranty > 0}
            />
          </div>
        </section>

        {/* ─────────────── Negocio (KPIs) ─────────────── */}
        <section>
          <h2 className="text-brand-muted mb-3 text-xs font-bold tracking-widest uppercase">
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
          <h2 className="text-brand-muted mb-3 text-xs font-bold tracking-widest uppercase">
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

        {/* ─────────────── Diseños del Estudio ─────────────── */}
        <section>
          <h2 className="text-brand-muted mb-3 text-xs font-bold tracking-widest uppercase">
            Diseños del Estudio
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <QuickLink
              href="/admin/plantillas"
              icon={LayoutTemplate}
              label="Plantillas"
              description="Diseños base que el cliente personaliza en el Estudio (fotoimanes, marcos…)."
            />
            <QuickLink
              href="/admin/fichas"
              icon={Shapes}
              label="Fichas del abecedario"
              description="Los dibujos de cada letra (A de Avión…). Alimentan el editor de nombres y los sets."
            />
            <QuickLink
              href="/admin/disenos"
              icon={LayoutTemplate}
              label="Diseños prediseñados"
              description="Imágenes listas que el cliente aplica con un toque en el editor (separadores, fotoimanes)."
            />
          </div>
        </section>

        {/* ─────────────── Auditoría ─────────────── */}
        <section>
          <h2 className="text-brand-muted mb-3 text-xs font-bold tracking-widest uppercase">
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

/**
 * Deriva un nombre legible del email del admin (mientras AdminUser no tenga
 * un campo displayName explícito).
 *
 *  crittan01@gmail.com  → "Crittan"
 *  lucy@lucamsshop.co   → "Lucy"
 *  r.julliethhr@...     → "R Julliethhr"
 *  abc@…                → null  (muy corto → fallback "Hola 👋")
 *
 * Si quieres tu nombre exacto en el dashboard, agregalo a AdminUser
 * cuando hagamos el form de perfil admin (backlog).
 */
function deriveAdminDisplayName(email: string): string | null {
  if (!email) return null;
  const local = email.split("@")[0];
  if (!local) return null;
  const clean = local
    .replace(/\d+$/, "") // dígitos al final ("crittan01" → "crittan")
    .replace(/[._-]+/g, " ") // separadores → espacio
    .trim();
  if (clean.length < 2) return null;
  // Capitaliza la primera letra de cada palabra.
  return clean.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
