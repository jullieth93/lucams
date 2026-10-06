/*
 * /mi-cuenta/cupones — "Mis cupones" (referidos v2, 2026-10-05).
 *
 * Dos secciones:
 *  1. Cupones personales del cliente (Coupon.customerId = él): los emite el
 *     programa de referidos (bienvenida al registrarse con código, premio del
 *     referente tras la primera compra del referido). Estado derivado al leer
 *     (disponible / usado / vencido, ver features/coupons/mine.ts).
 *  2. "Cupones disponibles": los públicos vigentes (isPublic), los mismos que
 *     expone /api/coupons/public vía listPublicCoupons.
 *
 * La description interna de los cupones personales NO se muestra: lleva emails
 * de terceros (quién te refirió); la tarjeta arma su propio copy.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Ticket, BadgePercent } from "lucide-react";
import { getCurrentCustomer } from "@/lib/auth";
import { listMyCoupons } from "@/features/coupons/mine";
import { listPublicCoupons } from "@/lib/catalog";
import { formatCOP } from "@/lib/format";
import { ReferralCopyButton } from "../referral-copy-button";
import { getAccountTexts } from "../account-texts.server";

export const metadata: Metadata = {
  title: "Mis cupones",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const STATUS_LABEL = {
  AVAILABLE: "Disponible",
  USED: "Usado",
  EXPIRED: "Vencido",
} as const;

const STATUS_STYLE = {
  AVAILABLE: "bg-emerald-100 text-emerald-900",
  USED: "bg-slate-200 text-slate-700",
  EXPIRED: "bg-amber-100 text-amber-900",
} as const;

/** Valor del cupón en lenguaje de cliente ("10% de descuento"). */
function valueLabel(coupon: { type: string; value: number }): string {
  if (coupon.type === "PERCENT") return `${coupon.value}% de descuento`;
  if (coupon.type === "FIXED") return `${formatCOP(coupon.value)} de descuento`;
  return "Envío gratis";
}

/** Restricciones del cupón, solo cuando aplican. */
function restrictionNotes(coupon: {
  minOrder: number | null;
  requiresMinQuantity: number | null;
  appliesToCategories: string[];
  appliesToProductSlugs: string[];
}): string[] {
  const notes: string[] = [];
  if (coupon.minOrder != null) notes.push(`Compra mínima de ${formatCOP(coupon.minOrder)}`);
  if (coupon.requiresMinQuantity != null) {
    notes.push(`Mínimo ${coupon.requiresMinQuantity} unidades`);
  }
  if (coupon.appliesToProductSlugs.length > 0) notes.push("Aplica a productos seleccionados");
  else if (coupon.appliesToCategories.length > 0) notes.push("Aplica a categorías seleccionadas");
  return notes;
}

export default async function CuponesPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta/cupones");

  const [myCoupons, publicCoupons, texts] = await Promise.all([
    listMyCoupons(session.customer.id),
    listPublicCoupons(),
    getAccountTexts(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/mi-cuenta"
        className="text-brand-muted hover:text-brand-purple mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ChevronLeft className="h-3 w-3" />
        {texts.back.miCuenta}
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-brand-purple-dark text-3xl">Mis cupones</h1>
        <p className="text-brand-muted mt-1 text-sm">
          Tus cupones personales y los descuentos vigentes para tu próxima compra.
        </p>
      </header>

      {myCoupons.length === 0 ? (
        <div className="border-brand-purple/15 rounded-2xl border border-dashed bg-white p-8 text-center">
          <Ticket className="text-brand-purple/60 mx-auto h-8 w-8" />
          <p className="text-brand-purple-dark mt-3 font-semibold">Aún no tienes cupones</p>
          <p className="text-brand-muted mt-1 text-sm">
            Si un amigo te comparte su código de referido, al registrarte recibes un cupón de
            bienvenida aquí mismo.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {myCoupons.map((c) => (
            <li
              key={c.id}
              className="border-brand-purple/15 rounded-2xl border bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-brand-purple/10 text-brand-purple flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full">
                  <Ticket className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-brand-purple-dark font-semibold">{valueLabel(c)}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[c.status]}`}
                >
                  {STATUS_LABEL[c.status]}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="bg-brand-purple/5 text-brand-purple-dark rounded-md px-3 py-1.5 font-mono text-sm font-bold tracking-wider">
                  {c.code}
                </code>
                {c.status === "AVAILABLE" && (
                  <ReferralCopyButton value={c.code} label="Copiar código" />
                )}
              </div>
              <p className="text-brand-muted mt-2 text-xs">
                Válido hasta el {dateFmt.format(c.validTo)}
              </p>
              {restrictionNotes(c).map((note) => (
                <p key={note} className="text-brand-muted mt-0.5 text-xs">
                  · {note}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}

      {publicCoupons.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-brand-purple-dark mb-3 text-xl">Cupones disponibles</h2>
          <ul className="space-y-3">
            {publicCoupons.map((c) => (
              <li
                key={c.code}
                className="border-brand-purple/15 rounded-2xl border bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-brand-turquoise/15 text-brand-purple flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full">
                    <BadgePercent className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="text-brand-purple-dark font-semibold">{valueLabel(c)}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="bg-brand-purple/5 text-brand-purple-dark rounded-md px-3 py-1.5 font-mono text-sm font-bold tracking-wider">
                    {c.code}
                  </code>
                  <ReferralCopyButton value={c.code} label="Copiar código" />
                </div>
                {c.description && <p className="text-brand-muted mt-2 text-xs">{c.description}</p>}
                <p className="text-brand-muted mt-0.5 text-xs">
                  Válido hasta el {dateFmt.format(c.validUntil)}
                </p>
                {restrictionNotes(c).map((note) => (
                  <p key={note} className="text-brand-muted mt-0.5 text-xs">
                    · {note}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
