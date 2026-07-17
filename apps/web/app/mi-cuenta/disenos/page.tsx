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

export const metadata: Metadata = {
  title: "Mis diseños",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DisenosPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta/disenos");

  const rows = await listCustomerDesigns(session.customer.id);
  const designs: DesignCardData[] = rows.map((d) => ({
    id: d.id,
    previewUrl: d.previewUrl ?? "",
    productName: d.product.name,
    productSlug: d.product.slug,
    hasShareToken: Boolean(d.shareToken),
    shareToken: d.shareToken,
    used: d.status === "USED_IN_ORDER",
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/mi-cuenta"
        className="text-brand-muted hover:text-brand-purple mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ChevronLeft className="h-3 w-3" />
        Mi cuenta
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-brand-purple-dark text-3xl">Mis diseños</h1>
        <p className="text-brand-muted mt-1 text-sm">
          Tus creaciones del Estudio. Compártelas con un link o guárdalas para pedir otra vez.
        </p>
      </header>

      {designs.length === 0 ? (
        <div className="border-brand-purple/15 rounded-2xl border border-dashed bg-white p-10 text-center">
          <Palette className="text-brand-purple/60 mx-auto h-8 w-8" />
          <p className="text-brand-purple-dark mt-3 font-semibold">
            Aún no tienes diseños guardados
          </p>
          <p className="text-brand-muted mx-auto mt-1 max-w-sm text-sm">
            Crea un fotoimán en el Estudio de Personalización y aparecerá aquí para compartirlo o
            pedirlo otra vez.
          </p>
          <Link
            href="/productos"
            className="bg-brand-purple hover:bg-brand-purple-dark mt-4 inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold text-white"
          >
            Explorar productos
          </Link>
        </div>
      ) : (
        <DesignGrid designs={designs} />
      )}
    </div>
  );
}
