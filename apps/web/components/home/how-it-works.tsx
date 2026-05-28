/*
 * "Así de fácil" — 3 pasos del proceso Lucams.
 *
 * Cada paso (título + descripción) viene del CMS con fallback.
 * Lucy edita desde /admin/contenido > Bloques: home.howitworks.*
 */

import { MousePointerClick, Sparkles, Package } from "lucide-react";
import { CmsText } from "@/components/cms/cms-text";

const STEPS = [
  {
    icon: MousePointerClick,
    titleKey: "home.howitworks.step1.title",
    titleFallback: "Eliges",
    descKey: "home.howitworks.step1.description",
    descFallback:
      "Eliges el formato que más te guste en nuestro catálogo. Hay opciones para fotos, eventos, organización y más.",
  },
  {
    icon: Sparkles,
    titleKey: "home.howitworks.step2.title",
    titleFallback: "Personalizas",
    descKey: "home.howitworks.step2.description",
    descFallback:
      "Subes tus fotos o nos cuentas tu idea por WhatsApp. Pronto vas a poder diseñarlo en vivo aquí mismo.",
  },
  {
    icon: Package,
    titleKey: "home.howitworks.step3.title",
    titleFallback: "Llega a tu nevera",
    descKey: "home.howitworks.step3.description",
    descFallback:
      "Lo fabricamos a mano y te llega en 5-7 días hábiles. Pago en línea seguro con Wompi (tarjeta, PSE, Nequi, Bancolombia).",
  },
];

export function HowItWorks() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        return (
          <div
            key={s.titleKey}
            className="border-brand-purple/10 relative flex flex-col items-center rounded-xl border bg-white p-6 text-center"
          >
            <span className="bg-brand-purple absolute -top-3 left-1/2 inline-flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full text-sm font-bold text-white">
              {i + 1}
            </span>
            <div className="bg-brand-cream mt-2 mb-3 rounded-full p-3">
              <Icon className="text-brand-purple h-7 w-7" />
            </div>
            <h3 className="font-display text-brand-purple-dark mb-2 text-xl">
              <CmsText blockKey={s.titleKey} fallback={s.titleFallback} />
            </h3>
            <p className="text-brand-purple-dark/70 text-sm leading-relaxed">
              <CmsText blockKey={s.descKey} fallback={s.descFallback} />
            </p>
          </div>
        );
      })}
    </div>
  );
}
