/*
 * /recomendador — PLAN_CATALOG_V2 6.1.
 *
 * Wizard "ayudame a elegir" con 4 preguntas (ocasión / destinatario / precio /
 * personalización). Usa el mismo backend que /api/catalog/recommend → bot
 * WhatsApp Fase 5+ y wizard UI comparten lógica de scoring.
 */

import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { listOcasiones } from "@/lib/catalog";
import {
  DESTINATARIOS,
  PERSONALIZATION,
  PRICE_RANGES,
  type WizardInitial,
} from "@/lib/recomendador-options";
import { WizardRecomendador } from "@/components/wizard-recomendador";

export const metadata: Metadata = {
  // #27 — el template global añade "· Lucams_shop"; keyword al frente.
  title: "Recomendador de imanes",
  description:
    "¿No sabes qué elegir? Te ayudamos en 4 preguntas a encontrar el imán perfecto para tu ocasión.",
};

// CSP por nonce (C3): requiere render dinámico (los scripts necesitan el nonce).
export const dynamic = "force-dynamic";

// #10 — rehidrata el wizard desde searchParams (deep-link / refresh). En Next 16 searchParams es
// un Promise que se debe await (Async Request APIs). Toda entrada se valida contra la whitelist
// compartida en lib/recomendador-options.ts; los precios se mantienen en centavos COP enteros.
export default async function RecomendadorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ocasiones = await listOcasiones();
  const sp = await searchParams;

  const validOcasionSlugs = new Set(ocasiones.filter((o) => o.productCount > 0).map((o) => o.slug));
  const rawOcasion = sp.ocasion;
  const ocasionArr = Array.isArray(rawOcasion) ? rawOcasion : rawOcasion ? [rawOcasion] : [];
  const ocasionSlugs = ocasionArr.filter((s) => validOcasionSlugs.has(s));

  const destRaw = typeof sp.destinatario === "string" ? sp.destinatario : null;
  const destinatario = DESTINATARIOS.some((d) => d.value === destRaw) ? destRaw : null;

  const minRaw = typeof sp.precioMin === "string" ? sp.precioMin : "";
  const maxRaw = typeof sp.precioMax === "string" ? sp.precioMax : "";
  const range = PRICE_RANGES.find((r) => String(r.min) === minRaw && String(r.max) === maxRaw);
  const priceRange = range ? { min: range.min, max: range.max } : null;

  const persRaw = typeof sp.personalizable === "string" ? sp.personalizable : "any";
  const pers = PERSONALIZATION.some((p) => p.value === persRaw) ? persRaw : "any";

  const view = sp.vista === "resultados" ? "results" : null;

  const pasoRaw = typeof sp.paso === "string" ? parseInt(sp.paso, 10) : NaN;
  const step = Number.isInteger(pasoRaw) && pasoRaw >= 1 && pasoRaw <= 4 ? pasoRaw : 1;

  const initial: WizardInitial = { step, ocasionSlugs, destinatario, priceRange, pers, view };

  return (
    <div className="min-h-screen">
      <section className="from-brand-purple/10 via-brand-cream to-brand-turquoise/10 bg-gradient-to-br py-12">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div className="bg-brand-purple/15 mx-auto inline-flex items-center justify-center rounded-full p-3">
            <Sparkles className="text-brand-purple h-8 w-8" />
          </div>
          <h1 className="text-brand-purple-dark mt-4 text-3xl font-bold md:text-4xl">
            ¿Te ayudamos a elegir?
          </h1>
          <p className="text-brand-purple/80 mt-3 text-base">
            4 preguntas rápidas y te recomendamos los productos perfectos para ti. Sin spam, sin
            email. Solo magia kawaii ✨
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-3xl px-6">
          <WizardRecomendador ocasiones={ocasiones} initial={initial} />
        </div>
      </section>
    </div>
  );
}
