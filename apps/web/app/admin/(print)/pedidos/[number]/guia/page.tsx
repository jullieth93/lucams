/*
 * Guía de entrega interna "Envío Lucam's" — remisión imprimible para el
 * transportador propio (mensajería interna, carrier "lucams").
 *
 * Formato: CUARTO DE CARTA portrait (4.25in × 5.5in — una carta dividida en
 * 4, estilo etiqueta/recibo de courier; decisión del owner 2026-09-29). El
 * layout está compactado para que TODO quepa en esa área sin desbordar a una
 * segunda página: tipografía 8-10px, items en una línea, firmas en líneas
 * simples. Prioridad del contenido: nº pedido + referencia INTERNO, cliente
 * + teléfono, dirección + zona + ciudad, «COBRAR AL ENTREGAR» si es COD y la
 * promesa (hoy/mañana). La URL de rastreo va en tamaño mínimo (es lo primero
 * que se sacrifica si algo no cabe).
 *
 * Ruta fuera del shell (panel): sin chrome admin. Sin QR (no hay lib de QR
 * en el repo): la URL pública de rastreo va en texto. El token
 * /pedido/<token> NO se puede reconstruir acá (F-11: en DB solo vive el
 * hash), así que el rastreo impreso es /rastrear (número + correo).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { getOrder } from "@/features/orders/service";
import { getLucamsShippingSettings } from "@/features/shipping/settings";
import { bogotaHour, LUCAMS_CARRIER } from "@/features/shipping/lucams-shipping";
import { getSettingValue } from "@/lib/cms";
import { formatCOP } from "@/lib/format";
import { PrintGuideButton } from "./print-button";

export const metadata: Metadata = {
  title: "Guía de entrega",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type ShippingAddrSnapshot = {
  fullName?: string;
  email?: string;
  phone?: string;
  documentNumber?: string;
  city?: string;
  department?: string;
  addressLine1?: string;
  addressLine2?: string;
  zip?: string;
  localityName?: string;
  notes?: string;
};

export default async function GuiaEntregaPage({ params }: { params: Promise<{ number: string }> }) {
  // Guard propio: esta ruta vive fuera del layout (panel) que aplica el RBAC
  // por ruta — cualquier admin activo puede imprimir guías de entrega (mismo
  // set que las acciones operativas del pedido).
  await requireRole(ADMIN_ROLE_SETS.ALL);

  const { number } = await params;
  const order = await getOrder(decodeURIComponent(number));
  if (!order) notFound();

  const ship = order.shippingAddress as ShippingAddrSnapshot;
  const isInternal = order.shippingCarrier === LUCAMS_CARRIER;

  const [settings, siteUrl] = await Promise.all([
    getLucamsShippingSettings(),
    getSettingValue("SITE_URL", process.env.NEXT_PUBLIC_SITE_URL ?? "https://lucamsshop.com"),
  ]);

  // Promesa calculada con la MISMA regla del checkout (buildLucamsOffer):
  // pedido creado antes del cutoff (hora Colombia) → entrega el mismo día.
  const sameDay = bogotaHour(order.createdAt) < settings.cutoffHour;
  const promiseText = sameDay
    ? `Entrega hoy — pedido antes de las ${String(settings.cutoffHour).padStart(2, "0")}:00`
    : "Entrega mañana";
  const isCod = order.paymentMethod === "COD";
  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });

  if (!isInternal) {
    return (
      <main className="mx-auto max-w-xl p-8 text-sm">
        <p className="font-semibold">
          Este pedido no es de entrega propia (carrier: {order.shippingCarrier ?? "—"}).
        </p>
        <p className="mt-2">
          <Link href={`/admin/pedidos/${encodeURIComponent(order.number)}`} className="underline">
            ← Volver al pedido
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[4.25in] p-4 text-black print:max-w-none print:p-0">
      {/* Cuarto de carta portrait (4.25 × 5.5 in), márgenes mínimos, B&W */}
      <style>{`@page { size: 4.25in 5.5in; margin: 4mm; } @media print { body { background: white; } }`}</style>

      {/* Toolbar (no se imprime) */}
      <div className="mb-3 flex items-center justify-between print:hidden">
        <Link
          href={`/admin/pedidos/${encodeURIComponent(order.number)}`}
          className="text-sm underline"
        >
          ← Volver al pedido
        </Link>
        <PrintGuideButton />
      </div>

      <article className="border-2 border-black p-2 text-[10px] leading-tight">
        {/* Encabezado */}
        <header className="flex items-start justify-between border-b-2 border-black pb-1">
          <div>
            <p className="text-[11px] font-bold tracking-wide">GUÍA DE ENTREGA INTERNA</p>
            <p className="text-[8px]">Lucam&apos;s — mensajería propia</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[11px] font-bold">{order.number}</p>
            <p className="text-[8px]">{dateFmt.format(order.createdAt)}</p>
          </div>
        </header>

        {/* Referencia + promesa */}
        <section className="flex items-center justify-between gap-2 border-b border-black py-1">
          <p className="text-[8px]">
            Ref:{" "}
            <span className="font-mono font-bold">
              {order.trackingNumber ?? `INTERNO-${order.number}`}
            </span>
          </p>
          <p className="border border-black px-1 py-0.5 text-[9px] font-bold whitespace-nowrap">
            {promiseText}
          </p>
        </section>

        {/* Destinatario */}
        <section className="border-b border-black py-1">
          <p className="text-[8px] font-bold tracking-wide uppercase">Entregar a</p>
          <p className="font-bold">
            {ship.fullName ?? "—"} · Tel {order.phone || ship.phone || "—"}
          </p>
          <p>{[ship.addressLine1, ship.addressLine2].filter(Boolean).join(" · ")}</p>
          <p>
            {ship.localityName ? `${ship.localityName}, ` : ""}
            {ship.city}
            {ship.zip ? ` · CP ${ship.zip}` : ""}
          </p>
          {ship.notes && (
            <p className="mt-1 border border-black px-1 py-0.5 text-[8px]">
              <strong>Nota:</strong> {ship.notes}
            </p>
          )}
        </section>

        {/* Items — una línea compacta por producto */}
        <section className="border-b border-black py-1">
          <p className="text-[8px] font-bold tracking-wide uppercase">Contenido</p>
          <ul className="mt-0.5 space-y-0.5">
            {order.items.map((it) => (
              <li key={it.id} className="truncate">
                <strong>{it.qty}×</strong> {it.variant.product.name} — {it.variant.name}
              </li>
            ))}
          </ul>
        </section>

        {/* Total + recaudo */}
        <section className="border-b border-black py-1">
          <div className="flex justify-between">
            <span>Total del pedido</span>
            <span className="font-bold">{formatCOP(order.total)}</span>
          </div>
          {isCod ? (
            <p className="mt-1 border-2 border-black px-1 py-1 text-center text-[11px] font-bold">
              COBRAR AL ENTREGAR: {formatCOP(order.total)}
            </p>
          ) : (
            <p className="mt-1 text-[8px]">PAGADO en línea — no cobrar al entregar.</p>
          )}
        </section>

        {/* Rastreo cliente (tamaño mínimo: lo primero que se sacrifica si no cabe) */}
        <section className="border-b border-black py-1">
          <p className="text-[7px]">
            Rastreo: {siteUrl.replace(/\/+$/, "")}/rastrear · pedido{" "}
            <span className="font-mono font-bold">{order.number}</span> + correo del cliente
          </p>
        </section>

        {/* Firmas — líneas simples */}
        <section className="space-y-3 pt-3 text-[8px]">
          <p>Entregó (Lucam&apos;s): ______________________ Firma: ______________</p>
          <p>Recibí a satisfacción: ______________________ CC: __________ Firma: __________</p>
        </section>
      </article>
    </main>
  );
}
