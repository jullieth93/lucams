/*
 * Admin > Cupones > [id] — Detalle 360°, edición e historial de redenciones.
 *
 * Seguridad y RBAC (Bloque 3 — N-21 estricto):
 *   - Acceso de lectura: `ADMIN_ROLE_SETS.CUPONES_READ` (`SUPERADMIN`,
 *     `OPERATIONS_MANAGER`, `MANAGER`, `FINANCE_ANALYST`).
 *   - Mutaciones (editar, pausar, archivar): exclusivo `SUPERADMIN`.
 *   - Los cupones archivados (`deletedAt != null`) NO devuelven 404: se muestran
 *     en modo solo lectura para preservar trazabilidad desde `/admin/auditoria`
 *     y auditoría financiera histórica.
 *   - Enmascaramiento PII server-side obligatorio para roles sin `orders:read_pii`
 *     (ej. `FINANCE_ANALYST`).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, Award, DollarSign, Eye, Lock, Receipt, Ticket, Users } from "lucide-react";
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
import { CountUp } from "@/components/admin/count-up";
import { ReauthForm } from "@/components/admin/mfa-reauth";
import { Button } from "@/components/ui/button";
import { getCoupon } from "@/features/coupons/service";
import { ADMIN_ROLE_SETS, canAccessAdminPath, hasCapability } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { formatDateCO, formatDateTimeCO } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import { formatCOP } from "@/lib/format";
import { maskEmail, maskEmailsInText, maskPersonName } from "@/lib/pii-mask";
import { archiveCouponAction, pauseCouponAction, resumeCouponAction } from "../actions";
import { EditCouponForm } from "./edit-coupon-form";

export const metadata: Metadata = {
  title: "Detalle de cupón",
  robots: { index: false, follow: false },
};

export default async function AdminCuponEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ADMIN_ROLE_SETS.CUPONES_READ);
  const role = session.admin.role;
  const canManage = role === "SUPERADMIN";
  const canReadPii = hasCapability(role, "orders:read_pii");
  const canViewOrders = canAccessAdminPath(role, "/admin/pedidos");
  const canViewContacts = canAccessAdminPath(role, "/admin/clientes");
  const canViewFidelizacion = canAccessAdminPath(role, "/admin/fidelizacion");

  const { id } = await params;
  const coupon = await getCoupon(id);
  if (!coupon) notFound();

  const isArchived = Boolean(coupon.deletedAt);
  const isReadOnly = !canManage || isArchived;
  const isPersonal = coupon.customerId !== null;

  const [categories, products, usageTotals] = await Promise.all([
    prisma.category.findMany({
      where: { deletedAt: null },
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { isActive: true, deletedAt: null },
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.couponUsage.aggregate({
      where: { couponId: coupon.id },
      _sum: { amount: true },
    }),
  ]);

  const totalDiscountCents = usageTotals._sum.amount ?? 0;
  const safeDescription = canReadPii ? coupon.description : maskEmailsInText(coupon.description);

  const ownerFullName = coupon.customer
    ? [coupon.customer.firstName, coupon.customer.lastName].filter(Boolean).join(" ").trim() || null
    : null;
  const displayOwnerName = ownerFullName
    ? canReadPii
      ? ownerFullName
      : maskPersonName(ownerFullName)
    : null;
  const displayOwnerEmail = coupon.customer?.email
    ? canReadPii
      ? coupon.customer.email
      : maskEmail(coupon.customer.email)
    : null;

  const now = new Date();
  const statusBadge = (() => {
    if (coupon.deletedAt) return { label: "Archivado", tone: "slate" as const };
    if (!coupon.isActive) return { label: "Pausado", tone: "amber" as const };
    if (coupon.validTo < now) return { label: "Expirado", tone: "slate" as const };
    if (coupon.validFrom > now) return { label: "Programado", tone: "blue" as const };
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return { label: "Agotado", tone: "rose" as const };
    }
    return { label: "Activo", tone: "emerald" as const };
  })();

  const quotaPct =
    coupon.maxUses && coupon.maxUses > 0
      ? Math.min(100, Math.round((coupon.usedCount / coupon.maxUses) * 100))
      : null;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Ticket className="h-5 w-5" />}
        title={`${isReadOnly ? "Cupón" : "Editar"} ${coupon.code}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <AdminBadge tone={statusBadge.tone}>{statusBadge.label}</AdminBadge>
            {isPersonal ? (
              <AdminBadge tone="purple">Personal · Invita y gana</AdminBadge>
            ) : coupon.isPublic ? (
              <AdminBadge tone="blue">Campaña pública</AdminBadge>
            ) : (
              <AdminBadge tone="slate">Campaña por código</AdminBadge>
            )}
            <span>
              · Vigencia {formatDateCO(coupon.validFrom)} → {formatDateCO(coupon.validTo)}
            </span>
          </span>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Cupones", href: "/admin/cupones" },
          { label: coupon.code },
        ]}
        actions={
          canManage && !isArchived ? (
            <div className="flex flex-wrap items-center gap-2">
              <form action={coupon.isActive ? pauseCouponAction : resumeCouponAction}>
                <input type="hidden" name="id" value={coupon.id} />
                <Button type="submit" variant="outline" size="sm">
                  {coupon.isActive ? "Pausar cupón" : "Reactivar cupón"}
                </Button>
              </form>
              <ReauthForm
                action={archiveCouponAction}
                confirmMessage={`¿Archivar definitivamente el cupón ${coupon.code}? Dejará de funcionar de inmediato en el checkout y conservará su historial de redenciones en solo lectura.`}
              >
                <input type="hidden" name="id" value={coupon.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="text-rose-700 hover:bg-rose-50"
                >
                  <Archive className="mr-1.5 h-4 w-4" />
                  Archivar
                </Button>
              </ReauthForm>
            </div>
          ) : undefined
        }
      />

      <AdminPageBody>
        {isArchived && coupon.deletedAt && (
          <AdminNotice tone="warning">
            <strong>Cupón archivado el {formatDateTimeCO(coupon.deletedAt)}:</strong> ya no puede
            redimirse ni modificarse. Esta ficha permanece disponible en solo lectura para auditoría
            y conciliación histórica.
          </AdminNotice>
        )}

        {!canManage && !isArchived && (
          <AdminNotice tone="info">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Eye className="h-4 w-4" />
              Modo solo lectura:
            </span>{" "}
            Consulta las reglas comerciales y el historial de redenciones de este cupón. Solo
            Superadmin puede crear, editar o archivar cupones.
          </AdminNotice>
        )}

        {/* KPIs del cupón */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-brand-muted text-xs font-medium">Redenciones confirmadas</p>
                <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
                  <CountUp value={coupon._count.usages} />
                  {coupon.maxUses !== null && (
                    <span className="text-brand-muted text-sm font-normal">
                      {" "}
                      / {coupon.maxUses.toLocaleString("es-CO")}
                    </span>
                  )}
                </p>
                {quotaPct !== null ? (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="admin-bar-grow-x bg-brand-purple h-full rounded-full"
                      style={{ width: `${Math.max(4, quotaPct)}%` }}
                    />
                  </div>
                ) : (
                  <p className="text-brand-muted mt-1 text-[11px]">Sin tope global de usos</p>
                )}
              </div>
              <span className="bg-brand-purple/10 text-brand-purple rounded-lg p-2">
                <Receipt className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-brand-muted text-xs font-medium">Descuento total otorgado</p>
                <p className="font-display mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
                  $<CountUp value={Math.round(totalDiscountCents / 100)} />
                </p>
                <p className="text-brand-muted mt-1 text-[11px]">
                  en pedidos pagados ({formatCOP(totalDiscountCents)})
                </p>
              </div>
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                <DollarSign className="h-4 w-4" />
              </span>
            </div>
          </AdminCard>

          <AdminCard className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-brand-muted text-xs font-medium">Titularidad y origen</p>
                {isPersonal ? (
                  <>
                    <p className="text-brand-purple-dark mt-1 truncate text-sm font-bold">
                      {displayOwnerName ?? displayOwnerEmail ?? "Cliente registrado"}
                    </p>
                    <p className="text-brand-muted truncate text-xs">
                      {displayOwnerEmail}
                      {coupon.customer?.contactId && canViewContacts && (
                        <>
                          {" · "}
                          <Link
                            href={`/admin/clientes/${coupon.customer.contactId}`}
                            className="text-brand-purple font-semibold hover:underline"
                          >
                            Ficha 360 →
                          </Link>
                        </>
                      )}
                    </p>
                    {canViewFidelizacion && (
                      <Link
                        href="/admin/fidelizacion"
                        className="text-brand-purple mt-1 inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
                      >
                        <Award className="h-3 w-3" />
                        Reglas Invita y gana
                      </Link>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-brand-purple-dark mt-1 text-sm font-bold">
                      Campaña comercial
                    </p>
                    <p className="text-brand-muted mt-0.5 text-xs">
                      Abierto a cualquier cliente que cumpla las restricciones configuradas.
                    </p>
                  </>
                )}
              </div>
              <span className="bg-brand-purple/10 text-brand-purple rounded-lg p-2">
                {isPersonal ? <Lock className="h-4 w-4" /> : <Users className="h-4 w-4" />}
              </span>
            </div>
          </AdminCard>
        </section>

        {/* Formulario de configuración / detalle */}
        <AdminCard className="p-5 sm:p-6">
          <h2 className="text-brand-purple-dark font-display mb-4 text-base font-bold">
            {isReadOnly ? "Configuración del cupón" : "Editar condiciones del cupón"}
          </h2>
          <EditCouponForm
            coupon={{
              id: coupon.id,
              code: coupon.code,
              type: coupon.type,
              value: coupon.value,
              description: safeDescription,
              isPublic: coupon.isPublic,
              isActive: coupon.isActive,
              validFrom: coupon.validFrom,
              validTo: coupon.validTo,
              minOrder: coupon.minOrder,
              maxUses: coupon.maxUses,
              maxUsesPerCustomer: coupon.maxUsesPerCustomer,
              requiresMinQuantity: coupon.requiresMinQuantity,
              appliesToCategories: coupon.appliesToCategories,
              appliesToProductSlugs: coupon.appliesToProductSlugs,
              isPersonal,
            }}
            categories={categories}
            products={products}
            readOnly={isReadOnly}
          />
        </AdminCard>

        {/* Historial 360° de redenciones */}
        <section className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-brand-purple-dark font-display text-base font-bold">
                Historial de redenciones
              </h2>
              <p className="text-brand-muted text-xs">
                Últimas {coupon.usages.length} redenciones registradas al confirmarse el pago del
                pedido.
              </p>
            </div>
          </div>

          {coupon.usages.length === 0 ? (
            <AdminEmpty
              icon={<Receipt className="h-5 w-5" />}
              title="Sin redenciones registradas todavía"
              description="Cuando un comprador pague un pedido usando este código, el uso aparecerá acá enlazado al pedido y al contacto."
            />
          ) : (
            <AdminTable>
              <AdminTableHead>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold">Pedido</th>
                  <th className="px-4 py-3 text-left font-semibold">Comprador</th>
                  <th className="px-4 py-3 text-right font-semibold">Total pedido</th>
                  <th className="px-4 py-3 text-right font-semibold">Descuento otorgado</th>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {coupon.usages.map((u) => {
                  const rawEmail = u.email ?? u.customer?.email ?? null;
                  const safeEmail = rawEmail ? (canReadPii ? rawEmail : maskEmail(rawEmail)) : "—";
                  const rawName = u.customer
                    ? [u.customer.firstName, u.customer.lastName].filter(Boolean).join(" ").trim()
                    : "";
                  const safeName = rawName
                    ? canReadPii
                      ? rawName
                      : maskPersonName(rawName)
                    : null;
                  const contactId = u.order?.contactId ?? u.customer?.contactId ?? null;

                  return (
                    <AdminTableRow key={u.id}>
                      <td className="text-brand-muted px-4 py-3 text-xs tabular-nums">
                        {formatDateTimeCO(u.appliedAt)}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold">
                        {u.order ? (
                          canViewOrders ? (
                            <Link
                              href={`/admin/pedidos/${encodeURIComponent(u.order.number)}`}
                              className="text-brand-purple-dark hover:text-brand-purple font-mono hover:underline"
                            >
                              {u.order.number}
                            </Link>
                          ) : (
                            <code className="text-brand-purple-dark font-mono">
                              {u.order.number}
                            </code>
                          )
                        ) : (
                          <span className="text-brand-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {contactId && canViewContacts ? (
                          <Link
                            href={`/admin/clientes/${encodeURIComponent(contactId)}`}
                            className="text-brand-purple-dark hover:text-brand-purple font-medium hover:underline"
                          >
                            {safeName ? `${safeName} · ${safeEmail}` : safeEmail}
                          </Link>
                        ) : (
                          <span className="text-brand-purple-dark/85">
                            {safeName ? `${safeName} · ${safeEmail}` : safeEmail}
                          </span>
                        )}
                      </td>
                      <td className="text-brand-purple-dark px-4 py-3 text-right text-xs font-medium tabular-nums">
                        {u.order ? formatCOP(u.order.total) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-bold text-emerald-700 tabular-nums">
                        −{formatCOP(u.amount)}
                      </td>
                    </AdminTableRow>
                  );
                })}
              </AdminTableBody>
            </AdminTable>
          )}
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
