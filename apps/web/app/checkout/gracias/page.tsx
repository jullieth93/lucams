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
 * El cambio de Order.status a PAID NO se hace acá — eso es trabajo del
 * webhook /api/webhooks/wompi (F2.2). Este page solo MUESTRA estado.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, XCircle, MapPin, Mail, Package } from "lucide-react";
import { LucamsLogo } from "@/components/lucams-logo";
import { Button } from "@/components/ui/button";
import { getTransaction } from "@/lib/wompi";
import { logger } from "@/lib/logger";
import { finishCheckoutSession } from "@/features/checkout/service";
import { prisma } from "@/lib/db";
import { formatCOP } from "@/lib/format";

export const metadata: Metadata = {
  title: "¡Gracias! · Checkout",
  robots: { index: false, follow: false },
};

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
    return <FailedPage reason="No pudimos confirmar tu pago. Si te cobraron, contactanos." />;
  }

  // Lookup Order por reference (= Order.number)
  const order = await prisma.order.findFirst({
    where: { number: tx.reference, deletedAt: null },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      email: true,
      shippingCarrier: true,
      shippingAddress: true,
    },
  });

  if (tx.status === "APPROVED") {
    // Limpiar cookie del checkout (ya cumplió su propósito).
    await finishCheckoutSession();
    return <ApprovedPage order={order} txId={tx.id} />;
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
}: {
  order: {
    id: string;
    number: string;
    status: string;
    total: number;
    email: string;
    shippingCarrier: string | null;
    shippingAddress: unknown;
  } | null;
  txId: string;
}) {
  const addr = order?.shippingAddress as
    | { fullName?: string; addressLine1?: string; city?: string; department?: string }
    | undefined;

  return (
    <div className="mx-auto max-w-2xl py-8 text-center">
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

      <div className="mx-auto mt-8 max-w-md space-y-3 text-left">
        <DetailRow icon={<Mail className="h-4 w-4" />} label="Confirmación enviada a">
          {order?.email ?? "—"}
        </DetailRow>
        {addr && (
          <DetailRow icon={<MapPin className="h-4 w-4" />} label="Enviamos a">
            <span className="block">{addr.fullName}</span>
            <span className="text-brand-purple-dark/65 block text-xs">
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

      <div className="text-brand-purple-dark/55 mt-8 text-xs">
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
        <Link href="/mi-cuenta/pedidos">
          <Button size="lg" className="bg-gradient-brand text-white hover:brightness-110">
            Ver mis pedidos
          </Button>
        </Link>
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
      <p className="text-brand-purple-dark/55 mt-4 text-xs">
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
      <p className="text-brand-purple-dark/65 mx-auto mt-4 max-w-md text-sm">
        Tu carrito sigue intacto. Podés reintentar con otro método de pago o contactarnos si querés
        ayuda.
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
      <div className="text-brand-purple/70 mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-brand-purple-dark/55 text-[10px] font-semibold tracking-wider uppercase">
          {label}
        </div>
        <div className="text-brand-purple-dark mt-0.5 text-sm">{children}</div>
      </div>
    </div>
  );
}
