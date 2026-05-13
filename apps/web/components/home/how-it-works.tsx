/*
 * "Así de fácil" — 3 pasos del proceso Lucams.
 *
 * Cada paso (título + descripción) viene del CMS con fallback.
 * Lucy edita desde /admin/contenido > Bloques: home.howitworks.*
 */

import { MousePointerClick, Sparkles, Package } from "lucide-react";
import { getCmsBlock } from "@/lib/cms";

const FALLBACKS = [
  {
    title: "Eliges",
    description:
      "Eliges el formato que más te guste en nuestro catálogo. Hay opciones para fotos, eventos, organización y más.",
  },
  {
    title: "Personalizas",
    description:
      "Subes tus fotos o nos cuentas tu idea por WhatsApp. Pronto vas a poder diseñarlo en vivo aquí mismo.",
  },
  {
    title: "Llega a tu nevera",
    description:
      "Lo fabricamos a mano y te llega en 5-7 días hábiles. Pago contraentrega disponible en 1.100+ destinos.",
  },
];

const ICONS = [MousePointerClick, Sparkles, Package];

export async function HowItWorks() {
  const blocks = await Promise.all([
    getCmsBlock("home.howitworks.step1.title"),
    getCmsBlock("home.howitworks.step1.description"),
    getCmsBlock("home.howitworks.step2.title"),
    getCmsBlock("home.howitworks.step2.description"),
    getCmsBlock("home.howitworks.step3.title"),
    getCmsBlock("home.howitworks.step3.description"),
  ]);

  const steps = [
    {
      title: blocks[0]?.body ?? FALLBACKS[0].title,
      description: blocks[1]?.body ?? FALLBACKS[0].description,
    },
    {
      title: blocks[2]?.body ?? FALLBACKS[1].title,
      description: blocks[3]?.body ?? FALLBACKS[1].description,
    },
    {
      title: blocks[4]?.body ?? FALLBACKS[2].title,
      description: blocks[5]?.body ?? FALLBACKS[2].description,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      {steps.map((s, i) => {
        const Icon = ICONS[i];
        return (
          <div
            key={i}
            className="border-brand-purple/10 relative flex flex-col items-center rounded-xl border bg-white p-6 text-center"
          >
            <span className="bg-brand-purple absolute -top-3 left-1/2 inline-flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full text-sm font-bold text-white">
              {i + 1}
            </span>
            <div className="bg-brand-cream mt-2 mb-3 rounded-full p-3">
              <Icon className="text-brand-purple h-7 w-7" />
            </div>
            <h3 className="font-display text-brand-purple-dark mb-2 text-xl">{s.title}</h3>
            <p className="text-brand-purple-dark/70 text-sm leading-relaxed">{s.description}</p>
          </div>
        );
      })}
    </div>
  );
}
