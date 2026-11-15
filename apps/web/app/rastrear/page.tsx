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
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getPageSeo } from "@/lib/cms-tokens";
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
              Ingresa el número de tu pedido y el correo con el que lo hiciste. No necesitas cuenta.
            </p>
          </div>

          <div className="border-brand-purple/10 mt-8 rounded-2xl border bg-white p-6 shadow-sm">
            <RastrearForm texts={FORM_TEXTS} initialNumber={prefillNumber?.slice(0, 40)} />
          </div>

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
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
