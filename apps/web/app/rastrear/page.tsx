/*
 * /rastrear — rastreo público de pedidos (#14).
 *
 * Puerta pública para clientes SIN cuenta (o que no recuerdan entrar): número de pedido + correo →
 * los lleva a la vista pública /pedido/<token> con estado, timeline y guía. La validación y el
 * anti-enumeración viven en actions.ts.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/brand";
import { CmsText } from "@/components/cms/cms-text";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getCmsBlock } from "@/lib/cms";
import { resolveCmsTokens } from "@/lib/cms-tokens";
import { isCatalogMode } from "@/lib/store-mode";
import { buildWhatsAppUrl } from "@/lib/wa";
import { RastrearForm, type RastrearTexts } from "./rastrear-form";

export async function generateMetadata(): Promise<Metadata> {
  const [titleBlock, descriptionBlock] = await Promise.all([
    getCmsBlock("track.meta-title"),
    getCmsBlock("track.meta-description"),
  ]);
  return {
    title: titleBlock?.body ?? "Rastrear pedido",
    description:
      descriptionBlock?.body ??
      "Consulta el estado de tu pedido con tu número y correo, sin necesidad de cuenta.",
  };
}

// CSP por nonce (C3): los scripts del formulario necesitan el nonce → render dinámico.
export const dynamic = "force-dynamic";

// <RastrearForm> es client component ("use client") y no puede leer el CMS:
// sus textos se resuelven acá en el server y se pasan por props (mismo patrón
// que cmsMenuText del site-header).
async function cmsTrackText(key: string, fallback: string): Promise<string> {
  const block = await getCmsBlock(key);
  return resolveCmsTokens(block?.body ?? fallback);
}

export default async function RastrearPage() {
  // En modo catálogo el checkout crea COTIZACIONES (Quote COT-XXXXXX), no
  // pedidos (Order): el formulario de rastreo nunca encontraría nada. El
  // seguimiento real se hace por WhatsApp (auditoría de info pública 2026-09-11).
  const catalog = isCatalogMode();
  const [numberLabel, numberHelp, emailLabel, submit, waTrackUrl] = await Promise.all([
    cmsTrackText("track.form.number-label", "Número de pedido"),
    cmsTrackText("track.form.number-help", "Lo encuentras en tu correo de confirmación."),
    cmsTrackText("track.form.email-label", "Correo del pedido"),
    cmsTrackText("track.form.submit", "Ver mi pedido"),
    catalog
      ? buildWhatsAppUrl({ kind: "support", subject: "Quiero saber el estado de mi pedido" })
      : Promise.resolve(""),
  ]);
  const formTexts: RastrearTexts = { numberLabel, numberHelp, emailLabel, submit };
  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />

      <main id="contenido" tabIndex={-1} className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-md">
          <div className="text-center">
            <div className="bg-brand-purple/15 mx-auto inline-flex items-center justify-center rounded-full p-3">
              <PackageSearch className="text-brand-purple h-8 w-8" />
            </div>
            <h1 className="font-display text-brand-purple-dark mt-4 text-3xl font-bold">
              <CmsText blockKey="track.heading" fallback="Rastrea tu pedido" />
            </h1>
            <p className="text-brand-purple/80 mt-2 text-sm">
              {catalog ? (
                <CmsText
                  blockKey="track.subtext-catalog"
                  fallback="Como tu pedido se cierra por WhatsApp, el estado también te lo contamos por ahí: escríbenos con tu nombre o tu número de cotización."
                />
              ) : (
                <CmsText
                  blockKey="track.subtext"
                  fallback="Ingresa el número de tu pedido y el correo con el que lo hiciste. No necesitas cuenta."
                />
              )}
            </p>
          </div>

          {catalog ? (
            <div className="border-brand-purple/10 mt-8 rounded-2xl border bg-white p-6 text-center shadow-sm">
              <p className="text-brand-purple-dark/80 text-sm">
                <CmsText
                  blockKey="track.catalog-note"
                  fallback="Cuando despachamos tu pedido te pasamos el número de guía por WhatsApp. Si tienes dudas antes, escríbenos y te contamos cómo va."
                />
              </p>
              <a
                href={waTrackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-brand-purple hover:bg-brand-purple-dark mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
              >
                <WhatsAppIcon className="h-4 w-4" />
                <CmsText blockKey="track.catalog-cta" fallback="Preguntar por WhatsApp →" />
              </a>
            </div>
          ) : (
            <div className="border-brand-purple/10 mt-8 rounded-2xl border bg-white p-6 shadow-sm">
              <RastrearForm texts={formTexts} />
            </div>
          )}

          {!catalog && (
            <p className="text-brand-muted mt-6 text-center text-sm">
              <CmsText blockKey="track.account-note" fallback="¿Tienes cuenta?" />{" "}
              <Link
                href="/mi-cuenta/pedidos"
                className="text-brand-purple-dark font-semibold underline"
              >
                <CmsText blockKey="track.account-cta" fallback="Entra y ve todos tus pedidos" />
              </Link>
              .
            </p>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
