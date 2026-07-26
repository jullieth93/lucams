/*
 * Admin > Reclamos de garantía — detalle de un WarrantyClaim.
 *
 * Muestra todo el contexto que Lucy necesita para decidir (pedido, producto,
 * cliente, descripción del defecto, fotos de evidencia) y, si el reclamo sigue
 * abierto, el formulario de cierre: remedio (reparación/cambio/devolución) +
 * nota → RESOLVED, o rechazo con motivo → REJECTED. Ambos sellan
 * resolvedAt + processedBy. Si ya está cerrado, el formulario se reemplaza
 * por el resumen de la resolución (incluye quién la hizo).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertCircle, ArrowLeft } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ResolveClaimForm } from "../resolve-claim-form";

export const metadata: Metadata = {
  title: "Detalle del reclamo",
  robots: { index: false, follow: false },
};

type RouteParams = Promise<{ id: string }>;

const ACTIVE_STATUSES = ["PENDING", "IN_REVIEW", "APPROVED"] as const;

const STATUS_TONE: Record<string, "amber" | "blue" | "purple" | "emerald" | "rose"> = {
  PENDING: "amber",
  IN_REVIEW: "blue",
  APPROVED: "purple",
  RESOLVED: "emerald",
  REJECTED: "rose",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  IN_REVIEW: "En diagnóstico",
  APPROVED: "Aprobado",
  RESOLVED: "Resuelto",
  REJECTED: "Rechazado",
};
const RESOLUTION_LABEL: Record<string, string> = {
  REPAIR: "Reparación",
  REPLACE: "Cambio",
  REFUND: "Devolución del dinero",
};

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminReclamoDetallePage({ params }: { params: RouteParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const { id } = await params;

  const claim = await prisma.warrantyClaim.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      description: true,
      evidenceUrls: true,
      resolutionType: true,
      resolutionNote: true,
      requestedAt: true,
      resolvedAt: true,
      processedBy: true,
      customer: { select: { email: true, firstName: true, lastName: true, phone: true } },
      orderItem: {
        select: {
          qty: true,
          order: { select: { number: true, deliveredAt: true } },
          variant: {
            select: { name: true, product: { select: { name: true, warrantyMonths: true } } },
          },
        },
      },
    },
  });
  if (!claim) notFound();

  // processedBy guarda el AdminUser.id; resolvemos el email para que el cierre
  // sea legible por personas (nadie recuerda un cuid).
  const processor = claim.processedBy
    ? await prisma.adminUser.findUnique({
        where: { id: claim.processedBy },
        select: { email: true },
      })
    : null;

  const isOpen = (ACTIVE_STATUSES as readonly string[]).includes(claim.status);
  const customerName =
    [claim.customer?.firstName, claim.customer?.lastName].filter(Boolean).join(" ") || "Cliente";

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<AlertCircle className="h-5 w-5" />}
        title={`Reclamo del pedido ${claim.orderItem.order.number}`}
        subtitle={`Solicitado el ${dateFmt.format(claim.requestedAt)}`}
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Ventas" },
          { label: "Reclamos", href: "/admin/reclamos" },
          { label: "Detalle" },
        ]}
        actions={
          <AdminButton href="/admin/reclamos" variant="secondary">
            <ArrowLeft className="h-4 w-4" />
            Volver a reclamos
          </AdminButton>
        }
      />

      <AdminPageBody>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Contexto del reclamo */}
          <AdminCard className="p-5 lg:col-span-2">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-brand-purple-dark font-display text-base font-bold">
                Qué reporta el cliente
              </h2>
              <AdminBadge tone={STATUS_TONE[claim.status] ?? "slate"}>
                {STATUS_LABEL[claim.status] ?? claim.status}
              </AdminBadge>
            </div>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-brand-muted text-xs font-semibold">Pedido</dt>
                <dd>
                  <Link
                    href={`/admin/pedidos/${encodeURIComponent(claim.orderItem.order.number)}`}
                    className="text-brand-purple-dark hover:text-brand-purple font-semibold underline"
                  >
                    {claim.orderItem.order.number}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-brand-muted text-xs font-semibold">Producto</dt>
                <dd className="text-brand-purple-dark">
                  {claim.orderItem.qty}× {claim.orderItem.variant.product.name}
                  <span className="text-brand-muted"> · {claim.orderItem.variant.name}</span>
                </dd>
              </div>
              <div>
                <dt className="text-brand-muted text-xs font-semibold">Cliente</dt>
                <dd className="text-brand-purple-dark">
                  {customerName}
                  {claim.customer?.email && (
                    <span className="text-brand-muted block text-xs">{claim.customer.email}</span>
                  )}
                  {claim.customer?.phone && (
                    <span className="text-brand-muted block text-xs">{claim.customer.phone}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-brand-muted text-xs font-semibold">Entregado</dt>
                <dd className="text-brand-purple-dark">
                  {claim.orderItem.order.deliveredAt
                    ? dateFmt.format(claim.orderItem.order.deliveredAt)
                    : "Sin fecha de entrega"}
                  <span className="text-brand-muted block text-xs">
                    Garantía de {claim.orderItem.variant.product.warrantyMonths}{" "}
                    {claim.orderItem.variant.product.warrantyMonths === 1 ? "mes" : "meses"}
                  </span>
                </dd>
              </div>
            </dl>

            <div className="border-brand-purple/10 mt-5 border-t pt-4">
              <p className="text-brand-muted mb-1 text-xs font-semibold">Descripción del defecto</p>
              <p className="text-brand-purple-dark text-sm whitespace-pre-wrap">
                “{claim.description}”
              </p>
            </div>

            {claim.evidenceUrls.length > 0 && (
              <div className="mt-4">
                <p className="text-brand-muted mb-1 text-xs font-semibold">Fotos de evidencia</p>
                <div className="flex flex-wrap gap-2">
                  {claim.evidenceUrls.map((u, i) => (
                    <a
                      key={i}
                      href={u}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-pink-ink text-xs underline"
                    >
                      Foto {i + 1}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </AdminCard>

          {/* Cierre o resumen de resolución */}
          <div className="lg:col-span-1">
            {isOpen ? (
              <AdminCard className="p-5">
                <h2 className="text-brand-purple-dark font-display mb-4 text-base font-bold">
                  Resolver el reclamo
                </h2>
                <ResolveClaimForm id={claim.id} />
              </AdminCard>
            ) : (
              <AdminCard className="p-5">
                <h2 className="text-brand-purple-dark font-display mb-4 text-base font-bold">
                  Cierre del reclamo
                </h2>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-brand-muted text-xs font-semibold">Resultado</dt>
                    <dd>
                      <AdminBadge tone={STATUS_TONE[claim.status] ?? "slate"}>
                        {STATUS_LABEL[claim.status] ?? claim.status}
                      </AdminBadge>
                      {claim.status === "RESOLVED" && claim.resolutionType && (
                        <span className="text-brand-purple-dark ml-1 text-xs">
                          · {RESOLUTION_LABEL[claim.resolutionType] ?? claim.resolutionType}
                        </span>
                      )}
                    </dd>
                  </div>
                  {claim.resolutionNote && (
                    <div>
                      <dt className="text-brand-muted text-xs font-semibold">Nota</dt>
                      <dd className="text-brand-purple-dark whitespace-pre-wrap">
                        {claim.resolutionNote}
                      </dd>
                    </div>
                  )}
                  {claim.resolvedAt && (
                    <div>
                      <dt className="text-brand-muted text-xs font-semibold">Cerrado</dt>
                      <dd className="text-brand-purple-dark">
                        {dateTimeFmt.format(claim.resolvedAt)}
                        {processor && (
                          <span className="text-brand-muted block text-xs">
                            por {processor.email}
                          </span>
                        )}
                      </dd>
                    </div>
                  )}
                </dl>
              </AdminCard>
            )}
          </div>
        </div>
      </AdminPageBody>
    </AdminPage>
  );
}
