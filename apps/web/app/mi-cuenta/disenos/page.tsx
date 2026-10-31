/*
 * /mi-cuenta/disenos — "Mis diseños" del cliente. Lista los diseños finalizados
 * (listos o ya comprados) con su preview, y permite compartirlos por link público
 * (/d/<token>), archivarlos o EDITARLOS de nuevo (2026-10-13 — CTA «Editar» que
 * abre /estudio/<slug>?designId=: el recover clona READY→DRAFT y al finalizar
 * queda listo otra vez; el original nunca se toca). Los borradores vigentes se
 * listan con su miniatura del auto-save (Design.draftPreviewUrl) o placeholder,
 * en una sección «Borradores» colapsable debajo de los listos (2026-10-13 —
 * con eliminación individual y «Vaciar borradores»).
 * Aislamiento por customerId. Fase 3 — compartir diseño.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Palette } from "lucide-react";
import { getCurrentCustomer } from "@/lib/auth";
import { listCustomerDesigns } from "@/features/personalization/service";
import { designPreviewDisplay } from "@/features/personalization/preview-artifacts";
import { CmsText } from "@/components/cms/cms-text";
import { DesignGrid, type DesignCardData } from "./design-grid";
import { getAccountTexts } from "../account-texts.server";
import { previewRefToAuthorizedUrl } from "@/features/personalization/preview-artifacts";

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
    // 2026-10-13 — los DRAFT no tienen preview final (se genera en el
    // finalize): su tarjeta usa la miniatura del auto-save (draftPreviewUrl)
    // cuando existe; sin ella, placeholder de marca en el grid. Los diseños
    // LISTOS exhiben la miniatura representativa WATERMARK (thumb.webp =
    // primera unidad legible; fallback al preview limpio si no hay artefactos).
    // LUC-SEC-001 — la miniatura del borrador (draftPreviewUrl) y el thumb
    // salen por el handler autorizado; refs legacy convertidas. "" = sin imagen.
    previewUrl:
      d.status === "DRAFT"
        ? (d.draftPreviewUrl ? (previewRefToAuthorizedUrl(d.draftPreviewUrl) ?? "") : "")
        : (designPreviewDisplay(d)?.thumbUrl ?? ""),
    productName: d.product.name,
    productSlug: d.product.slug,
    // F-11 — solo sabemos SI hay link activo (hash en DB); el token plano ya no
    // se puede releer. Pedir el link de nuevo lo ROTA (ver design-grid).
    hasShareToken: Boolean(d.shareTokenHash),
    used: d.status === "USED_IN_ORDER",
    inCart: d.inCart,
    draft: d.status === "DRAFT",
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/mi-cuenta"
        className="text-brand-muted hover:text-brand-purple -mt-2 mb-3 inline-flex min-h-10 items-center gap-1 text-xs"
      >
        <ChevronLeft className="h-3 w-3" />
        {texts.back.miCuenta}
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-brand-purple-dark text-3xl">{texts.designs.title}</h1>
        <p className="text-brand-muted mt-1 text-sm">{texts.designs.subtitle}</p>
        {/* 2026-10-13 — las miniaturas de diseños listos llevan marca de agua
            (anti-copia); la impresión final no la lleva. Aviso visible pedido
            por la decisión de producto del watermark. */}
        {rows.some((d) => d.status !== "DRAFT" && d.previewWatermarkedAt !== null) && (
          <p className="text-brand-muted mt-1 text-xs">
            <CmsText
              blockKey="account.designs.watermark-note"
              fallback="Las vistas previas llevan marca de agua — tu impresión final no la lleva."
            />
          </p>
        )}
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
