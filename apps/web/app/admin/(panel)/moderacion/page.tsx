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
import { getProductionAssetSignedUrls } from "@/lib/storage";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminNotice,
  AdminEmpty,
} from "@/components/admin-page";
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
  // ADR-063 T2 — firmar los PNGs de producción por-slot para revisar cada pieza real (no un
  // thumbnail de 40px a ciegas). Antes solo se veía previewUrl compositado.
  const signed = await getProductionAssetSignedUrls(rows.flatMap((r) => r.productionUrls));

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
          <AdminEmpty
            icon={<ShieldAlert className="h-5 w-5" />}
            title="No hay diseños pendientes de revisar"
            description="¡Todo al día! Cuando un pedido pago traiga un diseño personalizado, aparecerá acá para tu aprobación."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((d) => (
              <li
                key={d.designId}
                className="border-brand-purple/10 flex flex-col gap-4 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-start"
              >
                <div className="sm:w-64 sm:flex-shrink-0">
                  {d.productionUrls.length > 0 ? (
                    <>
                      <div className="grid grid-cols-3 gap-1.5">
                        {d.productionUrls.map((path, i) => {
                          const url = signed.get(path);
                          return url ? (
                            <a
                              key={path}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Pieza ${i + 1} — abrir en grande`}
                              className="bg-brand-cream/40 border-brand-purple/10 hover:ring-brand-purple/40 relative block aspect-square overflow-hidden rounded-md border hover:ring-2"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt={`Pieza ${i + 1}`}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                              <span className="bg-brand-purple-dark/80 absolute right-0 bottom-0 px-1 text-[9px] font-bold text-white">
                                {i + 1}
                              </span>
                            </a>
                          ) : (
                            <div
                              key={path}
                              className="bg-brand-cream/40 text-brand-muted flex aspect-square items-center justify-center rounded-md text-[9px]"
                            >
                              {i + 1}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-brand-muted mt-1 text-[10px]">
                        Toca una pieza para verla en grande
                      </p>
                    </>
                  ) : d.previewUrl ? (
                    <div className="bg-brand-cream/40 border-brand-purple/10 relative aspect-square w-40 overflow-hidden rounded-lg border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={d.previewUrl}
                        alt={`Diseño de ${d.productName}`}
                        className="h-full w-full object-contain p-1"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="text-brand-muted border-brand-purple/10 flex aspect-square w-40 items-center justify-center rounded-lg border text-xs">
                      Sin vista previa
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-brand-purple-dark font-semibold">{d.productName}</p>
                  {/* Un diseño puede esperar por un PEDIDO o por una COTIZACIÓN. Mientras la tienda
                      opera por cotización son todas de ese tipo, así que rotularlas "Pedido" sería
                      mentir sobre lo que Lucy está a punto de aprobar. */}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {d.sources.map((s) => (
                      <Link
                        key={s.numero}
                        href={
                          s.tipo === "pedido"
                            ? `/admin/pedidos/${encodeURIComponent(s.numero)}`
                            : `/admin/cotizaciones?q=${encodeURIComponent(s.numero)}`
                        }
                        className="text-brand-purple-dark hover:text-brand-purple text-xs font-semibold underline"
                      >
                        {s.tipo === "pedido" ? "Pedido" : "Cotización"} {s.numero}
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
