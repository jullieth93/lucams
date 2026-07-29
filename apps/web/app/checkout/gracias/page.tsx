/*
 * Step 4 — Confirmación post-pago.
 *
 * Wompi redirige a /checkout/gracias?id=TX_ID&env=test&status=...
 * NO confiar en el query "status" del redirect — siempre verificar
 * con getTransaction(id) contra la API de Wompi.
 *
 * Casos:
 *  - APPROVED: mostrar success + número de orden + tracking futuro
 *    + limpiar cookie checkout.
 *  - PENDING (raro, ej. PSE async): mostrar mensaje "estamos verificando"
 *  - DECLINED/VOIDED/ERROR: mostrar error + CTA "Reintentar pago" → /carrito
 *  - Sin query id (acceso directo): redirect a home.
 *
 * P0-012 (Lucy 2026-06-26) — Fallback idempotente processPaidOrder.
 * Si Wompi devuelve APPROVED Y la Order sigue en PENDING_PAYMENT (caso
 * típico: webhook Wompi sandbox URL no configurada en dashboard, o el
 * webhook está demorado), disparamos processPaidOrder acá como red de
 * seguridad. processPaidOrder es idempotente (3 capas: WebhookEvent
 * unique, status guard, InventoryLog ledger), así que si el webhook
 * SÍ llega después no genera doble-decremento ni doble-guía.
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, XCircle, MapPin, Mail, Package, Sparkles } from "lucide-react";
import { LucamsLogo } from "@/components/lucams-logo";
import { Button } from "@/components/ui/button";
import { getTransaction } from "@/lib/wompi";
import { logger } from "@/lib/logger";
import { ClearCheckoutSession } from "./clear-checkout-session";
import { processPaidOrder } from "@/features/orders/saga";
import { prisma } from "@/lib/db";
import { formatCOP } from "@/lib/format";
import { getCurrentCustomer } from "@/lib/auth";

export const metadata: Metadata = {
  title: "¡Gracias! · Checkout",
  robots: { index: false, follow: false },
};

// Esta page corre el FALLBACK processPaidOrder (getTransaction ~16s + createShipment
// 20s no-idempotente) cuando el webhook se demoró. Igual que el webhook, la función
// debe poder contener ese presupuesto para no matar createShipment a mitad → guía
// huérfana. 60s (default Vercel 300s; ver ADR-049).
export const maxDuration = 60;

type SearchParams = Promise<{ id?: string; env?: string; status?: string }>;

export default async function CheckoutGraciasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const txId = sp.id;

  if (!txId) {
    // Acceso directo sin TX_ID → al inicio
    redirect("/");
  }

  // Verificar estado REAL contra Wompi
  let tx;
  try {
    tx = await getTransaction(txId);
  } catch (err) {
    logger.error({
      event: "checkout.gracias.tx_lookup_fail",
      txId,
      err: err instanceof Error ? err.message : String(err),
    });
    return <FailedPage reason="No pudimos confirmar tu pago. Si te cobraron, contáctanos." />;
  }

  // Lookup Order por reference (= Order.number)
  let order = await prisma.order.findFirst({
    where: { number: tx.reference, deletedAt: null },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      email: true,
      shippingCarrier: true,
      shippingAddress: true,
      publicAccessToken: true, // #24 — link a /pedido/<token> para invitados (sin login)
      // ADR-070 (pieza #1) — miniaturas de lo que pediste; el diseño usa su snapshot autocontenido.
      items: {
        select: {
          id: true,
          qty: true,
          designAssetUrl: true,
          variant: { select: { product: { select: { name: true, images: true } } } },
          design: { select: { previewUrl: true } },
        },
      },
    },
  });

  if (tx.status === "APPROVED") {
    // P0-012 — Fallback idempotente: si la Order sigue en PENDING_PAYMENT,
    // el webhook Wompi no llegó (o se demoró). Disparamos processPaidOrder
    // acá. Si ya pasó por el webhook, processPaidOrder retorna
    // "already_processed" y no hace nada.
    // #14 (post-launch Bloque A) — simetrizar la validación de monto con el
    // webhook (route.ts valida amount_in_cents === order.total). Antes el
    // fallback disparaba processPaidOrder sin re-chequear el monto. Inexplotable
    // hoy (el monto va atado a la firma de integridad de Wompi y order.total es
    // inmutable), pero mantener ambas rutas simétricas evita una asimetría
    // defensiva si en el futuro se permite editar el total.
    const amountOk = order ? tx.amount_in_cents === order.total : false;
    if (order && order.status === "PENDING_PAYMENT" && !amountOk) {
      logger.error({
        event: "checkout.gracias.amount_mismatch",
        orderId: order.id,
        orderNumber: order.number,
        expected: order.total,
        received: tx.amount_in_cents,
        txId: tx.id,
      });
      // No procesamos: el webhook (con la misma validación) lo marcará para
      // revisión. Mostramos página honesta de "verificando" en vez de confirmar.
      return <PaymentReceivedPage orderNumber={order.number} txId={tx.id} />;
    }

    if (order && order.status === "PENDING_PAYMENT") {
      const orderId = order.id;
      const orderNumber = order.number;
      logger.info({
        event: "checkout.gracias.fallback_saga",
        orderId,
        orderNumber,
        txId: tx.id,
      });
      try {
        const result = await processPaidOrder({
          orderId,
          wompiTransactionId: tx.id,
        });
        logger.info({
          event: "checkout.gracias.fallback_result",
          orderId,
          status: result.status,
          trackingNumber: result.trackingNumber ?? null,
        });
        // Re-leer order para mostrar tracking/status actualizado al cliente.
        order = await prisma.order.findFirst({
          where: { id: orderId, deletedAt: null },
          select: {
            id: true,
            number: true,
            status: true,
            total: true,
            email: true,
            shippingCarrier: true,
            shippingAddress: true,
            publicAccessToken: true, // #24
            items: {
              select: {
                id: true,
                qty: true,
                designAssetUrl: true,
                variant: { select: { product: { select: { name: true, images: true } } } },
                design: { select: { previewUrl: true } },
              },
            },
          },
        });
      } catch (err) {
        logger.error({
          event: "checkout.gracias.fallback_fail",
          orderId,
          err: err instanceof Error ? err.message : String(err),
        });
        // Mostramos ApprovedPage igual — el pago sí fue aprobado por Wompi.
        // Si la saga falló, admin reconcilia manualmente desde /admin/pedidos.
      }
    }
    // Limpiar cookie del checkout (ya cumplió su propósito): la borra
    // <ClearCheckoutSession /> al montar en el cliente — en render RSC
    // `cookies().delete()` es ilegal y tumbaba esta página entera.

    // #8 (certificación Bloque A) — NO mentir. Wompi aprobó el cobro, pero la
    // Order solo está realmente confirmada si la saga la llevó a PAID/FULFILLING.
    // Si quedó en PENDING_PAYMENT (stock agotado, fallo de saga), mostrar una
    // página honesta de "recibimos tu pago, lo estamos verificando" en vez de
    // "¡pedido confirmado!" — el cliente no debe creer que está listo cuando
    // hay una reconciliación pendiente.
    const confirmed =
      order?.status === "PAID" ||
      order?.status === "FULFILLING" ||
      order?.status === "SHIPPED" ||
      order?.status === "DELIVERED";
    if (confirmed) {
      // #24 — el invitado no tiene cuenta; su CTA debe ir a la vista pública por token, no a
      // /mi-cuenta (muro de login). getCurrentCustomer está memoizado (cache()).
      const session = await getCurrentCustomer();
      return <ApprovedPage order={order} txId={tx.id} isGuest={!session} />;
    }
    return <PaymentReceivedPage orderNumber={order?.number ?? tx.reference} txId={tx.id} />;
  }
  if (tx.status === "PENDING") {
    return <PendingPage orderNumber={tx.reference} txId={tx.id} />;
  }
  // DECLINED, VOIDED, ERROR
  return <FailedPage reason={tx.status_message ?? `Estado Wompi: ${tx.status}`} />;
}

// ─────────────────────────────────────────────────────────────────────

function ApprovedPage({
  order,
  txId,
  isGuest,
}: {
  order: {
    id: string;
    number: string;
    status: string;
    total: number;
    email: string;
    shippingCarrier: string | null;
    shippingAddress: unknown;
    publicAccessToken: string | null;
    // ADR-070 (pieza #1) — miniaturas del pedido (snapshot del diseño autocontenido).
    items: {
      id: string;
      qty: number;
      designAssetUrl: string | null;
      variant: { product: { name: string; images: string[] } };
      design: { previewUrl: string | null } | null;
    }[];
  } | null;
  txId: string;
  isGuest: boolean;
}) {
  // #24 — invitado con token → vista pública del pedido; con cuenta → histórico.
  const orderUrl =
    isGuest && order?.publicAccessToken
      ? `/pedido/${order.publicAccessToken}`
      : "/mi-cuenta/pedidos";
  const orderCtaLabel = isGuest && order?.publicAccessToken ? "Ver mi pedido" : "Ver mis pedidos";
  const addr = order?.shippingAddress as
    { fullName?: string; addressLine1?: string; city?: string; department?: string } | undefined;

  return (
    <div className="mx-auto max-w-2xl py-8 text-center">
      <ClearCheckoutSession />
      <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-100">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" />
      </div>
      <h1 className="font-display text-brand-purple-dark mt-6 text-3xl font-bold sm:text-4xl">
        ¡Listo, tu pedido está confirmado! ✨
      </h1>
      <p className="text-brand-purple-dark/75 mx-auto mt-3 max-w-md text-sm sm:text-base">
        Tu pago fue aprobado. Te enviamos la confirmación por email y ya empezamos a preparar tu
        pedido.
      </p>

      <div className="from-brand-purple/10 to-brand-pink/10 mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r px-5 py-2.5">
        <LucamsLogo className="h-6 w-6" />
        <span className="text-brand-purple-dark text-sm font-medium">Pedido</span>
        <code className="text-brand-purple-dark rounded bg-white/60 px-2 py-0.5 font-mono text-sm font-bold">
          {order?.number ?? "—"}
        </code>
      </div>

      {/* ADR-070 (pieza #1) — miniaturas de lo que pediste; el diseño personalizado se ve con su
        snapshot autocontenido (sobrevive aunque el diseño original se borre luego). */}
      {order?.items && order.items.length > 0 && (
        <div className="mt-7">
          <p className="text-brand-muted mb-2 text-xs font-medium">Esto es lo que pediste</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {order.items.map((it) => {
              const img =
                it.designAssetUrl ?? it.design?.previewUrl ?? it.variant.product.images[0] ?? null;
              const personalized = Boolean(it.designAssetUrl ?? it.design?.previewUrl);
              return (
                <div
                  key={it.id}
                  className="border-brand-purple/10 relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border bg-white"
                  title={it.variant.product.name}
                >
                  {img ? (
                    <Image
                      src={img}
                      alt={it.variant.product.name}
                      fill
                      sizes="64px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Sparkles className="text-brand-muted h-6 w-6" />
                    </div>
                  )}
                  {it.qty > 1 && (
                    <span className="bg-brand-purple-dark/85 absolute top-0 right-0 inline-flex h-4 min-w-4 items-center justify-center rounded-bl-md px-1 text-[9px] font-bold text-white">
                      {it.qty}
                    </span>
                  )}
                  {personalized && (
                    <span className="bg-brand-purple/90 absolute inset-x-0 bottom-0 text-center text-[8px] font-bold tracking-wide text-white">
                      Tu diseño
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mx-auto mt-8 max-w-md space-y-3 text-left">
        <DetailRow icon={<Mail className="h-4 w-4" />} label="Confirmación enviada a">
          {order?.email ?? "—"}
        </DetailRow>
        {addr && (
          <DetailRow icon={<MapPin className="h-4 w-4" />} label="Enviamos a">
            <span className="block">{addr.fullName}</span>
            <span className="text-brand-muted block text-xs">
              {addr.addressLine1}
              {addr.city && `, ${addr.city}`}
              {addr.department && `, ${addr.department}`}
            </span>
          </DetailRow>
        )}
        {order?.shippingCarrier && (
          <DetailRow icon={<Package className="h-4 w-4" />} label="Transportadora">
            {order.shippingCarrier
              .split("-")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ")}
          </DetailRow>
        )}
        <DetailRow
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          label="Total pagado"
        >
          <strong className="text-brand-purple-dark">{formatCOP(order?.total ?? 0)}</strong>
        </DetailRow>
      </div>

      <div className="text-brand-muted mt-8 text-xs">
        Comprobante Wompi: <code className="font-mono">{txId.slice(0, 16)}…</code>
      </div>

      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/productos">
          <Button
            size="lg"
            variant="outline"
            className="border-brand-purple/30 text-brand-purple-dark"
          >
            Seguir comprando
          </Button>
        </Link>
        <Button asChild size="lg" className="bg-gradient-brand text-white hover:brightness-110">
          <Link href={orderUrl}>{orderCtaLabel}</Link>
        </Button>
      </div>
    </div>
  );
}

function PendingPage({ orderNumber, txId }: { orderNumber: string; txId: string }) {
  return (
    <div className="mx-auto max-w-2xl py-8 text-center">
      <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 ring-8 ring-amber-100">
        <Clock className="h-12 w-12 text-amber-600" />
      </div>
      <h1 className="font-display text-brand-purple-dark mt-6 text-3xl font-bold sm:text-4xl">
        Estamos verificando tu pago ⏳
      </h1>
      <p className="text-brand-purple-dark/75 mx-auto mt-3 max-w-md text-sm sm:text-base">
        Algunos métodos (PSE / transferencia) tardan unos minutos en confirmarse. Te enviamos un
        email cuando esté todo OK.
      </p>
      <p className="text-brand-muted mt-4 text-xs">
        Pedido <code className="font-mono font-bold">{orderNumber}</code> · Wompi{" "}
        <code className="font-mono">{txId.slice(0, 16)}…</code>
      </p>
      <Link href="/" className="mt-8 inline-block">
        <Button size="lg" variant="outline" className="border-brand-purple/30">
          Volver al inicio
        </Button>
      </Link>
    </div>
  );
}

/**
 * #8 (certificación Bloque A) — Wompi aprobó el cobro pero la Order NO llegó a
 * PAID (stock agotado en la carrera, o fallo de saga). Página HONESTA: el dinero
 * se recibió, lo estamos verificando — NO "pedido confirmado". Evita que el
 * cliente crea que está listo cuando hay reconciliación admin pendiente.
 */
function PaymentReceivedPage({ orderNumber, txId }: { orderNumber: string; txId: string }) {
  return (
    <div className="mx-auto max-w-2xl py-8 text-center">
      <ClearCheckoutSession />
      <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 ring-8 ring-amber-100">
        <Clock className="h-12 w-12 text-amber-600" />
      </div>
      <h1 className="font-display text-brand-purple-dark mt-6 text-3xl font-bold sm:text-4xl">
        Recibimos tu pago, lo estamos confirmando ⏳
      </h1>
      <p className="text-brand-purple-dark/75 mx-auto mt-3 max-w-md text-sm sm:text-base">
        Tu pago fue aprobado y lo estamos verificando para preparar tu pedido. En cuanto esté todo
        listo te llega un correo con los detalles. Si en unas horas no recibes nada, escríbenos y lo
        revisamos enseguida.
      </p>
      <p className="text-brand-muted mt-4 text-xs">
        Pedido <code className="font-mono font-bold">{orderNumber}</code> · Wompi{" "}
        <code className="font-mono">{txId.slice(0, 16)}…</code>
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/contacto">
          <Button
            size="lg"
            variant="outline"
            className="border-brand-purple/30 text-brand-purple-dark"
          >
            Contactar soporte
          </Button>
        </Link>
        <Link href="/">
          <Button size="lg" className="bg-gradient-brand text-white hover:brightness-110">
            Volver al inicio
          </Button>
        </Link>
      </div>
    </div>
  );
}

function FailedPage({ reason }: { reason: string }) {
  return (
    <div className="mx-auto max-w-2xl py-8 text-center">
      <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 ring-8 ring-rose-100">
        <XCircle className="h-12 w-12 text-rose-600" />
      </div>
      <h1 className="font-display text-brand-purple-dark mt-6 text-3xl font-bold sm:text-4xl">
        El pago no se completó
      </h1>
      <p className="text-brand-purple-dark/75 mx-auto mt-3 max-w-md text-sm sm:text-base">
        {reason}
      </p>
      <p className="text-brand-muted mx-auto mt-4 max-w-md text-sm">
        Tu carrito sigue intacto. Puedes reintentar con otro método de pago o contactarnos si
        necesitas ayuda.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/contacto">
          <Button
            size="lg"
            variant="outline"
            className="border-brand-purple/30 text-brand-purple-dark"
          >
            Contactar soporte
          </Button>
        </Link>
        <Link href="/carrito">
          <Button size="lg" className="bg-gradient-brand text-white hover:brightness-110">
            Volver al carrito
          </Button>
        </Link>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-brand-purple/10 flex items-start gap-3 rounded-xl border bg-white p-3.5 text-left">
      <div className="text-brand-muted mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-brand-muted text-[10px] font-semibold tracking-wider uppercase">
          {label}
        </div>
        <div className="text-brand-purple-dark mt-0.5 text-sm">{children}</div>
      </div>
    </div>
  );
}
