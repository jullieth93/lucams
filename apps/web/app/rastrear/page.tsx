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
import { CmsText } from "@/components/cms/cms-text";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getCmsBlock } from "@/lib/cms";
import { resolveCmsTokens } from "@/lib/cms-tokens";
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
  const [numberLabel, numberHelp, emailLabel, submit] = await Promise.all([
    cmsTrackText("track.form.number-label", "Número de pedido"),
    cmsTrackText("track.form.number-help", "Lo encuentras en tu correo de confirmación."),
    cmsTrackText("track.form.email-label", "Correo del pedido"),
    cmsTrackText("track.form.submit", "Ver mi pedido"),
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
              <CmsText
                blockKey="track.subtext"
                fallback="Ingresa el número de tu pedido y el correo con el que lo hiciste. No necesitas cuenta."
              />
            </p>
          </div>

          <div className="border-brand-purple/10 mt-8 rounded-2xl border bg-white p-6 shadow-sm">
            <RastrearForm texts={formTexts} />
          </div>

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
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
