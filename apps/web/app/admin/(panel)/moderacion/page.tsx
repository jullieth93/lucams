/*
 * Admin — cola de moderación de contenido (ADR-062 P0-2).
 * Print-on-demand: Lucy revisa el contenido de cada diseño personalizado ANTES de imprimirlo.
 * Aprobar → habilita producción/envío. Rechazar → avisa al cliente con el motivo y bloquea el
 * envío del pedido. Solo diseños de pedidos activos (PAID/FULFILLING) pendientes de revisar.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { requireRole } from "@/lib/admin-rbac-guard";
import { listPendingModeration } from "@/features/moderation/service";
import { AdminPage, AdminPageHeader, AdminPageBody, AdminNotice } from "@/components/admin-page";
import { ModerationActions } from "./moderation-actions";

export const metadata: Metadata = { title: "Moderación" };

type SearchParams = Promise<{ approved?: string; rejected?: string; error?: string }>;

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function AdminModeracionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole(["SUPERADMIN", "MANAGER"]);
  const sp = await searchParams;
  const rows = await listPendingModeration();

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<ShieldAlert className="h-5 w-5" />}
        title="Moderación de contenido"
        subtitle="Revisa cada diseño personalizado ANTES de imprimirlo. Aprueba para producir, o rechaza (le avisamos al cliente con el motivo). Un pedido no se puede marcar como enviado si tiene diseños sin aprobar."
      />
      <AdminPageBody>
        {sp.approved && (
          <div className="mb-3">
            <AdminNotice tone="success">Diseño aprobado para producción.</AdminNotice>
          </div>
        )}
        {sp.rejected && (
          <div className="mb-3">
            <AdminNotice tone="warning">
              Diseño rechazado. Le avisamos al cliente por correo.
            </AdminNotice>
          </div>
        )}
        {sp.error && (
          <div className="mb-3">
            <AdminNotice tone="error">{sp.error}</AdminNotice>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-brand-muted border-brand-purple/10 rounded-xl border bg-white p-8 text-center text-sm">
            No hay diseños pendientes de revisar. ¡Todo al día! 🦝
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((d) => (
              <li
                key={d.designId}
                className="border-brand-purple/10 flex flex-col gap-4 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-start"
              >
                <div className="bg-brand-cream/40 border-brand-purple/10 relative aspect-square overflow-hidden rounded-lg border sm:w-40 sm:flex-shrink-0">
                  {d.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={d.previewUrl}
                      alt={`Diseño de ${d.productName}`}
                      className="h-full w-full object-contain p-1"
                      loading="lazy"
                    />
                  ) : (
                    <div className="text-brand-muted flex h-full items-center justify-center text-xs">
                      Sin vista previa
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-brand-purple-dark font-semibold">{d.productName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-brand-muted text-xs">
                      Pedido{d.orders.length > 1 ? "s" : ""}:
                    </span>
                    {d.orders.map((o) => (
                      <Link
                        key={o.number}
                        href={`/admin/pedidos/${encodeURIComponent(o.number)}`}
                        className="text-brand-purple-dark hover:text-brand-purple text-xs font-semibold underline"
                      >
                        {o.number}
                      </Link>
                    ))}
                  </div>
                  <p className="text-brand-muted mt-1 text-xs">
                    En cola desde {dateFmt.format(d.createdAt)}
                  </p>
                </div>

                <div className="sm:w-52 sm:flex-shrink-0">
                  <ModerationActions designId={d.designId} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
