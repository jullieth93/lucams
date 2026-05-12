/*
 * "Así de fácil" — 3 pasos del proceso Lucams.
 */

import { MousePointerClick, Sparkles, Package } from "lucide-react";

const STEPS = [
  {
    icon: MousePointerClick,
    title: "Eliges",
    description:
      "Eliges el formato que más te guste en nuestro catálogo. Hay opciones para fotos, eventos, organización y más.",
  },
  {
    icon: Sparkles,
    title: "Personalizas",
    description:
      "Subes tus fotos o nos cuentas tu idea por WhatsApp. Pronto vas a poder diseñarlo en vivo aquí mismo.",
  },
  {
    icon: Package,
    title: "Llega a tu nevera",
    description:
      "Lo fabricamos a mano y te llega en 5-7 días hábiles. Pago contraentrega disponible en 1.100+ destinos.",
  },
];

export function HowItWorks() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        return (
          <div
            key={s.title}
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
