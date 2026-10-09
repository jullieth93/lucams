/*
 * Admin — cola de moderación de contenido (ADR-062 P0-2).
 * Print-on-demand: Lucy revisa el contenido de cada diseño personalizado ANTES de imprimirlo.
 * Aprobar → habilita producción/envío. Rechazar → avisa al cliente con el motivo y bloquea el
 * envío del pedido. Diseños de pedidos activos (PAID/FULFILLING), cotizaciones activas y
 * diseños compartidos por link público (/d/<token>) pendientes de revisar (A4-01).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert, Search } from "lucide-react";
import { requireRole } from "@/lib/admin-rbac-guard";
import {
  listPendingModeration,
  type ModerationSource,
  type PendingModerationDesign,
} from "@/features/moderation/service";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminNotice,
  AdminEmpty,
} from "@/components/admin-page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ModerationActions } from "./moderation-actions";
import { ProductionPiecesButton } from "./production-pieces-button";
import { ModerationPreviewZoom } from "./preview-zoom";

export const metadata: Metadata = { title: "Moderación" };

type SearchParams = Promise<{
  approved?: string;
  rejected?: string;
  error?: string;
  pedido?: string;
}>;

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function sourceHref(s: ModerationSource): string {
  return s.tipo === "pedido"
    ? `/admin/pedidos/${encodeURIComponent(s.numero)}`
    : `/admin/cotizaciones?q=${encodeURIComponent(s.numero)}`;
}

/*
 * Tarjeta de UN diseño de la cola. `pedidoFilter` se propaga a las acciones
 * (aprobar/rechazar) para que el redirect conserve el filtro activo — si no,
 * moderar un item dentro de una búsqueda te sacaba de ella.
 */
function ModerationItem({ d, pedidoFilter }: { d: PendingModerationDesign; pedidoFilter: string }) {
  return (
    <li className="border-brand-purple/10 flex flex-col gap-4 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-start">
      <div className="sm:w-64 sm:flex-shrink-0">
        {d.previewUrl ? (
          // Paquete D (2026-10-02 — WYSIWYG): el preview se muestra con su
          // ASPECTO NATURAL (una tira 2×12 alta ya no queda diminuta en un
          // cuadrado fijo) + zoom al click — el moderador compara contra
          // lo que aprobó el cliente (misma idea que la Vista Previa del
          // Estudio, que capa por alto y nunca letterboxea).
          <ModerationPreviewZoom src={d.previewUrl} alt={`Diseño de ${d.productName}`} />
        ) : (
          <div className="text-brand-muted border-brand-purple/10 flex aspect-square w-40 items-center justify-center rounded-lg border text-xs">
            Sin vista previa
          </div>
        )}
        {d.productionUrls.length > 0 && (
          <ProductionPiecesButton
            designId={d.designId}
            pieceCount={d.productionUrls.length}
            productName={d.productName}
          />
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
              href={sourceHref(s)}
              className="text-brand-purple-dark hover:text-brand-purple text-xs font-semibold underline"
            >
              {s.tipo === "pedido" ? "Pedido" : "Cotización"} {s.numero}
            </Link>
          ))}
          {/* A4-01 — un diseño solo-compartido no tiene pedido/cotización:
              el badge explica por qué está en la cola (contenido público /d/<token>). */}
          {d.shared && (
            <span className="bg-brand-cream/60 text-brand-purple-dark rounded-full px-2 py-0.5 text-[10px] font-semibold">
              Link público compartido
            </span>
          )}
        </div>
        <p className="text-brand-muted mt-1 text-xs">En cola desde {dateFmt.format(d.createdAt)}</p>
        {/* Paquete C (2026-10-02) — traza de la aceptación explícita de
            calidad de fotos (checkbox de la Vista Previa): si el cliente
            reclama una garantía por "llegó pixelada", acá está la
            evidencia de que fue informado y aceptó. */}
        {d.qualityAcknowledgedAt && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            ⚠️ Aceptó calidad de fotos el {dateFmt.format(d.qualityAcknowledgedAt)}
          </p>
        )}
      </div>

      <div className="sm:w-52 sm:flex-shrink-0">
        <ModerationActions designId={d.designId} pedidoFilter={pedidoFilter} />
      </div>
    </li>
  );
}

export default async function AdminModeracionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole(["SUPERADMIN", "MANAGER"]);
  const sp = await searchParams;
  const rows = await listPendingModeration();
  // T4 (ADR-063 T2 revisitado) — la grilla muestra el previewUrl (mosaico público webp ~50-150 KB,
  // bucket design-previews cubierto por remotePatterns de next/image). Los PNGs reales de
  // producción (2-5 MB c/u, hasta 24 por diseño) ya NO se firman en lote acá: el modal
  // "Ver piezas reales" los firma bajo demanda, solo del diseño abierto (ProductionPiecesButton).

  // Filtro por número (2026-10-05): match parcial case-insensitive contra CUALQUIER
  // fuente del diseño (pedido o cotización — en Etapa 1 casi todo es cotización, y el
  // moderador busca "el número que le escribió el cliente" sin distinguir el tipo).
  const pedidoFilter = (sp.pedido ?? "").trim();
  const q = pedidoFilter.toLowerCase();
  const filtered = q
    ? rows.filter((d) => d.sources.some((s) => s.numero.toLowerCase().includes(q)))
    : rows;

  // Agrupación visual por pedido/cotización: la clave es la PRIMERA fuente del
  // diseño (un diseño con 2 pedidos aparece en el grupo del primero; sus links
  // dentro del item siguen mostrando todas las fuentes). Los diseños solo-
  // compartidos (sin fuente) van a un grupo aparte AL FINAL. El orden de los
  // grupos es el de primera aparición (la cola ya viene createdAt asc) y dentro
  // de cada grupo se conserva ese orden cronológico.
  const withSource = filtered.filter((d) => d.sources.length > 0);
  const withoutSource = filtered.filter((d) => d.sources.length === 0);
  const groups: { source: ModerationSource | null; items: PendingModerationDesign[] }[] = [];
  const groupIndex = new Map<string, number>();
  for (const d of withSource) {
    const source = d.sources[0];
    const key = `${source.tipo}:${source.numero}`;
    let idx = groupIndex.get(key);
    if (idx === undefined) {
      idx = groups.length;
      groupIndex.set(key, idx);
      groups.push({ source, items: [] });
    }
    groups[idx].items.push(d);
  }
  if (withoutSource.length > 0) groups.push({ source: null, items: withoutSource });

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

        {rows.length > 0 && (
          <form
            method="GET"
            className="border-brand-purple/10 mb-4 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
          >
            <div className="sm:col-span-6">
              <label
                htmlFor="f-pedido"
                className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
              >
                Filtrar por pedido o cotización
              </label>
              <div className="relative">
                <Search className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="f-pedido"
                  name="pedido"
                  type="search"
                  defaultValue={pedidoFilter}
                  placeholder="Número, ej. LCM-2026-0010 o COT-…"
                  className="border-brand-purple/20 focus-visible:ring-brand-purple/30 pl-9"
                />
              </div>
            </div>
            <div className="flex items-end gap-3 sm:col-span-6">
              <Button
                type="submit"
                size="sm"
                className="bg-gradient-brand h-9 text-white hover:brightness-110"
              >
                Filtrar
              </Button>
              {pedidoFilter && (
                <Link
                  href="/admin/moderacion"
                  className="text-brand-muted hover:text-brand-purple-dark pb-2 text-xs font-semibold"
                >
                  Quitar filtro
                </Link>
              )}
            </div>
          </form>
        )}

        {rows.length === 0 ? (
          <AdminEmpty
            icon={<ShieldAlert className="h-5 w-5" />}
            title="No hay diseños pendientes de revisar"
            description="¡Todo al día! Cuando un pedido pago traiga un diseño personalizado, aparecerá acá para tu aprobación."
          />
        ) : filtered.length === 0 ? (
          <AdminEmpty
            icon={<Search className="h-5 w-5" />}
            title={`Ningún diseño coincide con «${pedidoFilter}»`}
            description="Revisa el número (se busca por coincidencia parcial) o quita el filtro para ver toda la cola."
          />
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.source ? `${g.source.tipo}:${g.source.numero}` : "__shared__"}>
                <h2 className="text-brand-purple-dark mb-2 flex flex-wrap items-center gap-2 text-sm font-bold">
                  {g.source ? (
                    <Link href={sourceHref(g.source)} className="hover:text-brand-purple underline">
                      {g.source.tipo === "pedido" ? "Pedido" : "Cotización"} {g.source.numero}
                    </Link>
                  ) : (
                    <span>Sin pedido ni cotización — solo link público</span>
                  )}
                  <span className="text-brand-muted text-xs font-semibold">
                    · {g.items.length} {g.items.length === 1 ? "diseño" : "diseños"}
                  </span>
                </h2>
                <ul className="space-y-3">
                  {g.items.map((d) => (
                    <ModerationItem key={d.designId} d={d} pedidoFilter={pedidoFilter} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
