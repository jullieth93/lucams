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
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getPageSeo } from "@/lib/cms-tokens";
import { isCatalogMode } from "@/lib/store-mode";
import { buildWhatsAppUrl } from "@/lib/wa";
import { RastrearForm, type RastrearTexts } from "./rastrear-form";

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getPageSeo("seo.page.rastrear", {
    title: "Rastrear pedido",
    description: "Consulta el estado de tu pedido con tu número y correo, sin necesidad de cuenta.",
  });
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: "/rastrear" },
  };
}

// CSP por nonce (C3): los scripts del formulario necesitan el nonce → render dinámico.
export const dynamic = "force-dynamic";

const FORM_TEXTS: RastrearTexts = {
  numberLabel: "Número de pedido",
  numberHelp: "Lo encuentras en tu correo de confirmación.",
  emailLabel: "Correo del pedido",
  submit: "Ver mi pedido",
};

export default async function RastrearPage({
  searchParams,
}: {
  // ?number=LCM-2026-0001 prellena el número (lo usa el link "Seguir estado en
  // LUCAMS" de /pedido/[token]). El CORREO nunca viaja por query (PII — Ley
  // 1581): lo escribe el cliente y la prueba número+correo rota un token nuevo.
  searchParams: Promise<{ number?: string }>;
}) {
  const { number: prefillNumber } = await searchParams;
  // En modo catálogo el checkout crea COTIZACIONES (Quote COT-XXXXXX), no
  // pedidos (Order): el formulario de rastreo nunca encontraría nada. El
  // seguimiento real se hace por WhatsApp (auditoría de info pública 2026-09-11).
  const catalog = isCatalogMode();
  const waTrackUrl = catalog
    ? await buildWhatsAppUrl({ kind: "support", subject: "Quiero saber el estado de mi pedido" })
    : "";
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
              Rastrea tu pedido
            </h1>
            <p className="text-brand-purple/80 mt-2 text-sm">
              {catalog
                ? "Como tu pedido se cierra por WhatsApp, el estado también te lo contamos por ahí: escríbenos con tu nombre o tu número de cotización."
                : "Ingresa el número de tu pedido y el correo con el que lo hiciste. No necesitas cuenta."}
            </p>
          </div>

          {catalog ? (
            <div className="border-brand-purple/10 mt-8 rounded-2xl border bg-white p-6 text-center shadow-sm">
              <p className="text-brand-purple-dark/80 text-sm">
                Cuando despachamos tu pedido te pasamos el número de guía por WhatsApp. Si tienes
                dudas antes, escríbenos y te contamos cómo va.
              </p>
              <a
                href={waTrackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-brand-purple hover:bg-brand-purple-dark mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
              >
                <WhatsAppIcon className="h-4 w-4" />
                Preguntar por WhatsApp →
              </a>
            </div>
          ) : (
            <div className="border-brand-purple/10 mt-8 rounded-2xl border bg-white p-6 shadow-sm">
              <RastrearForm texts={FORM_TEXTS} initialNumber={prefillNumber?.slice(0, 40)} />
            </div>
          )}

          {!catalog && (
            <p className="text-brand-muted mt-6 text-center text-sm">
              ¿Tienes cuenta?{" "}
              <Link
                href="/mi-cuenta/pedidos"
                className="text-brand-purple-dark font-semibold underline"
              >
                Entra y ve todos tus pedidos
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
