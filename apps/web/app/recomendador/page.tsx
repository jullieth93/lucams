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
import { WizardRecomendador } from "@/components/wizard-recomendador";

export const metadata: Metadata = {
  title: "Lucams · Recomendador",
  description:
    "¿No sabes qué elegir? Te ayudamos en 4 preguntas a encontrar el imán perfecto para tu ocasión.",
};

export default async function RecomendadorPage() {
  const ocasiones = await listOcasiones();

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
            4 preguntas rápidas y te recomendamos los productos perfectos para vos. Sin spam, sin
            email. Solo magia kawaii ✨
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-3xl px-6">
          <WizardRecomendador ocasiones={ocasiones} />
        </div>
      </section>
    </div>
  );
}
