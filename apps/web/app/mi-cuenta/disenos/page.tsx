/*
 * /mi-cuenta/disenos — "Mis diseños" del cliente. Lista los diseños finalizados
 * (listos o ya comprados) con su preview, y permite compartirlos por link público
 * (/d/<token>) o archivarlos. Aislamiento por customerId. Fase 3 — compartir diseño.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Palette } from "lucide-react";
import { getCurrentCustomer } from "@/lib/auth";
import { listCustomerDesigns } from "@/features/personalization/service";
import { DesignGrid, type DesignCardData } from "./design-grid";
import { getAccountTexts } from "../account-texts.server";

export const metadata: Metadata = {
  title: "Mis diseños",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DisenosPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta/disenos");

  const [rows, texts] = await Promise.all([
    listCustomerDesigns(session.customer.id),
    getAccountTexts(),
  ]);
  const designs: DesignCardData[] = rows.map((d) => ({
    id: d.id,
    previewUrl: d.previewUrl ?? "",
    productName: d.product.name,
    productSlug: d.product.slug,
    // F-11 — solo sabemos SI hay link activo (hash en DB); el token plano ya no
    // se puede releer. Pedir el link de nuevo lo ROTA (ver design-grid).
    hasShareToken: Boolean(d.shareTokenHash),
    used: d.status === "USED_IN_ORDER",
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/mi-cuenta"
        className="text-brand-muted hover:text-brand-purple mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ChevronLeft className="h-3 w-3" />
        {texts.back.miCuenta}
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-brand-purple-dark text-3xl">{texts.designs.title}</h1>
        <p className="text-brand-muted mt-1 text-sm">{texts.designs.subtitle}</p>
      </header>

      {designs.length === 0 ? (
        <div className="border-brand-purple/15 rounded-2xl border border-dashed bg-white p-10 text-center">
          <Palette className="text-brand-purple/60 mx-auto h-8 w-8" />
          <p className="text-brand-purple-dark mt-3 font-semibold">{texts.designs.emptyTitle}</p>
          <p className="text-brand-muted mx-auto mt-1 max-w-sm text-sm">{texts.designs.emptySub}</p>
          <Link
            href="/productos"
            className="bg-brand-purple hover:bg-brand-purple-dark mt-4 inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold text-white"
          >
            {texts.designs.emptyCta}
          </Link>
        </div>
      ) : (
        <DesignGrid designs={designs} texts={texts.designs} />
      )}
    </div>
  );
}
