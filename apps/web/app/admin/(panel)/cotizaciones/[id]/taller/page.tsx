/*
 * Hoja de taller — qué hay que fabricar exactamente para una cotización.
 *
 * Lucy, 2026-07-25: «es muy importante cómo le va a llegar al admin para fabricación, que cubriría
 * todo: el producto, su personalización, colores, etc. Es el producto final y lo que el cliente
 * desea recibir explícito.»
 *
 * Hasta hoy no había forma de llegar a los archivos de imprenta desde una cotización: la descarga
 * colgaba de `Order` y la tienda no tiene pedidos mientras opera por cotización. El detalle mostraba
 * una miniatura de 56 px y nada más.
 *
 * Se llama "hoja de taller" y no "ficha" a propósito: en esta tienda **ficha** ya significa una letra
 * del abecedario (`/admin/fichas`, `LetterTile`, "pinta cada ficha del color que quieras"). Meter un
 * segundo significado en el único vocabulario que Lucy ya tiene interiorizado sería confundirla justo
 * mientras produce.
 *
 * Lo que el PNG no dice, lo dice `resolveProductionSpec`: cuántas piezas físicas son de verdad, si
 * hay que recortar una lámina o unir segmentos o doblar una tira, el color exacto que eligió el
 * cliente, si la variante lleva imán y por dónde se corta.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Hammer } from "lucide-react";
import { AdminPage, AdminPageHeader } from "@/components/admin-page";
import { requireRole } from "@/lib/admin-rbac-guard";
import { getQuoteProductionBundle } from "@/features/quotes/admin-service";
import { resolveProductionSpec } from "@/features/personalization/production-spec";
import { getProductionAssetSignedUrls } from "@/lib/storage";
import { formatCOP } from "@/lib/format";

type Params = Promise<{ id: string }>;

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export default async function HojaDeTallerPage({ params }: { params: Params }) {
  await requireRole(["SUPERADMIN", "MANAGER"]);

  const { id } = await params;
  const quote = await getQuoteProductionBundle(id);
  if (!quote) notFound();

  // Una sola llamada firmada para TODOS los archivos de la cotización (TTL 1 h).
  const todasLasRutas = quote.items.flatMap((i) => i.design?.productionUrls ?? []);
  const firmadas = await getProductionAssetSignedUrls(todasLasRutas, 3600);

  const lineas = quote.items.map((item) => {
    const spec = resolveProductionSpec({
      personalizationKind: item.product?.personalizationKind ?? null,
      productSchema: asRecord(item.product?.personalizationSchema),
      variantAttrs: asRecord(item.variant?.attributes),
      physicalSpecs: asRecord(item.product?.physicalSpecs),
      canvasData: asRecord(item.design?.canvasData),
      designMetadata: asRecord(item.design?.metadata),
      productionUrls: item.design?.productionUrls ?? [],
      lineQty: item.quantity,
    });
    return { item, spec };
  });

  const sinAprobar = lineas.filter(
    ({ item }) => item.design && item.design.moderationStatus !== "APPROVED",
  ).length;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Hammer className="h-5 w-5" />}
        title={
          <span className="flex items-center gap-3">
            <span>Hoja de taller</span>
            <span className="font-mono text-base">{quote.number}</span>
          </span>
        }
        subtitle={`${quote.customerName} · ${quote.city}, ${quote.department} · ${dateFmt.format(quote.createdAt)}`}
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Ventas" },
          { label: "Cotizaciones", href: "/admin/cotizaciones" },
          { label: quote.number, href: `/admin/cotizaciones/${quote.id}` },
          { label: "Taller" },
        ]}
        actions={
          <Link
            href={`/admin/cotizaciones/${quote.id}`}
            className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-sm font-semibold transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a la cotización
          </Link>
        }
      />

      {sinAprobar > 0 && (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            ⚠️ {sinAprobar} diseño{sinAprobar > 1 ? "s" : ""} sin aprobar — no imprimas todavía
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Apruébalo en{" "}
            <Link href="/admin/moderacion" className="font-semibold underline">
              Moderación
            </Link>{" "}
            antes de producir. Es el paso que confirma que el contenido que subió el cliente se
            puede imprimir.
          </p>
        </div>
      )}

      {quote.notes && (
        <div className="border-brand-purple/15 bg-brand-cream/40 mb-5 rounded-xl border p-4">
          <p className="text-brand-purple-dark text-xs font-semibold tracking-wide uppercase">
            Nota que escribió el cliente
          </p>
          <p className="text-brand-purple-dark mt-1 text-sm">{quote.notes}</p>
        </div>
      )}

      <div className="space-y-5">
        {lineas.map(({ item, spec }) => {
          const archivos = item.design?.productionUrls ?? [];
          const sku = item.variant?.sku ?? item.product?.sku ?? null;
          return (
            <section
              key={item.id}
              className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-brand-purple-dark font-display text-lg font-bold">
                    {item.productName}
                  </h2>
                  <p className="text-brand-muted mt-0.5 text-sm">
                    {item.variantName && item.variantName !== "Default" ? item.variantName : "—"}
                    {sku && <span className="ml-2 font-mono text-xs">{sku}</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-brand-purple-dark font-display text-2xl font-bold">
                    {spec.unidadesFisicas}
                  </p>
                  <p className="text-brand-muted text-xs">
                    unidad{spec.unidadesFisicas > 1 ? "es" : ""} a entregar
                  </p>
                  {spec.copias > 1 && (
                    <p className="mt-0.5 text-xs font-semibold text-amber-700">
                      Imprime {spec.copias} copias de cada archivo
                    </p>
                  )}
                </div>
              </div>

              {item.design && item.design.moderationStatus !== "APPROVED" && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                  Moderación: {item.design.moderationStatus}
                  {item.design.moderationReason ? ` — ${item.design.moderationReason}` : ""}
                </p>
              )}

              {/* Lo primero que hay que entender: qué es cada archivo físicamente. */}
              <div className="border-brand-turquoise/40 bg-brand-turquoise/10 mt-4 rounded-xl border p-3">
                <p className="text-brand-purple-dark text-sm font-semibold">
                  {spec.queEsCadaArchivo}
                </p>
                <ol className="text-brand-purple-dark/85 mt-2 list-decimal space-y-1 pl-5 text-sm">
                  {spec.pasosArmado.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {spec.personalizacion.length > 0 && (
                  <div>
                    <p className="text-brand-purple-dark text-xs font-semibold tracking-wide uppercase">
                      Lo que eligió el cliente
                    </p>
                    <dl className="mt-1.5 space-y-1 text-sm">
                      {spec.personalizacion.map((d) => (
                        <div key={d.etiqueta} className="flex flex-wrap gap-x-2">
                          <dt className="text-brand-muted">{d.etiqueta}:</dt>
                          <dd className="text-brand-purple-dark inline-flex items-center gap-1.5 font-medium">
                            {d.color && (
                              <span
                                className="inline-block h-3.5 w-3.5 rounded-full border border-black/20"
                                style={{ backgroundColor: d.color }}
                                aria-hidden
                              />
                            )}
                            {d.valor}
                            {d.color && (
                              <span className="text-brand-muted font-mono text-xs">{d.color}</span>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                {spec.especificaciones.length > 0 && (
                  <div>
                    <p className="text-brand-purple-dark text-xs font-semibold tracking-wide uppercase">
                      Cómo se fabrica
                    </p>
                    <dl className="mt-1.5 space-y-1 text-sm">
                      {spec.especificaciones.map((d) => (
                        <div key={d.etiqueta} className="flex flex-wrap gap-x-2">
                          <dt className="text-brand-muted">{d.etiqueta}:</dt>
                          <dd className="text-brand-purple-dark font-medium">{d.valor}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <p className="text-brand-purple-dark text-xs font-semibold tracking-wide uppercase">
                  Archivos de imprenta ({archivos.length})
                </p>
                {archivos.length === 0 ? (
                  <p className="text-brand-muted mt-1.5 text-sm">
                    Esta línea no lleva diseño personalizado: se toma del inventario y se empaca.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {archivos.map((ruta, i) => {
                      const url = firmadas.get(ruta);
                      const nombre = ruta.split("/").pop() ?? `archivo-${i + 1}`;
                      return url ? (
                        <a
                          key={ruta}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
                        >
                          ⬇ {nombre}
                        </a>
                      ) : (
                        <span
                          key={ruta}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                        >
                          ✗ {nombre} — no está en Storage
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <p className="text-brand-muted mt-4 text-xs">
                {item.quantity} × {formatCOP(item.unitPrice)} ={" "}
                <span className="text-brand-purple-dark font-semibold">
                  {formatCOP(item.quantity * item.unitPrice)}
                </span>
              </p>
            </section>
          );
        })}
      </div>

      <p className="text-brand-muted mt-6 text-center text-sm">
        Total de la cotización:{" "}
        <span className="text-brand-purple-dark font-semibold">{formatCOP(quote.total)}</span>
      </p>
    </AdminPage>
  );
}
