/*
 * "Así de fácil" — 3 pasos del proceso Lucams.
 *
 * Cada paso (título + descripción) viene del CMS con fallback.
 * Lucy edita desde /admin/contenido > Bloques: home.howitworks.*
 */

import { MousePointerClick, Sparkles, Package } from "lucide-react";
import { CmsText } from "@/components/cms/cms-text";
import { getCmsBlock, getSettingValue } from "@/lib/cms";
import { resolveCmsTokens } from "@/lib/cms-tokens";

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
      "Diseñas tu producto en vivo en nuestro Estudio: subes fotos, agregas texto y plantillas, y lo ves con vista previa 3D. ¡Sin salir del sitio!",
  },
  {
    icon: Package,
    titleKey: "home.howitworks.step3.title",
    titleFallback: "Llega a tus manos",
    descKey: "home.howitworks.step3.description",
    // El compromiso propio es DESPACHO+ENTREGA (máx. 3 días hábiles: 2 de fabricación + 1 de
    // entrega); el tránsito final lo pone la transportadora y varía según la ciudad. El pago es
    // EN LÍNEA (Wompi) — el texto viejo de "se acuerdan por WhatsApp" era de la Etapa 1 (modo
    // catálogo) y era FALSO en modo full (Lucy 2026-07-29). La coletilla COD se mantiene para
    // que stripCodMention la recorte si COD_ENABLED está apagado.
    descFallback:
      "Lo producimos a mano y lo entregamos en máximo {{total}} días hábiles ({{fab}} de fabricación + {{entrega}} de entrega). El tiempo final depende de la transportadora y de tu ciudad. Pagas en línea de forma segura — contraentrega disponible.",
    // La descripción promete contraentrega: depende del toggle COD_ENABLED (igual que
    // el chip del hero) — con COD apagado se recorta esa coletilla.
    codAware: true,
  },
] as const;

/**
 * Quita la mención a la contraentrega de un texto (CMS o fallback) conservando
 * una frase gramatical: "…se coordinan por WhatsApp — contraentrega disponible."
 * → "…se coordinan por WhatsApp." No-op si el texto no la menciona.
 */
function stripCodMention(text: string): string {
  const cleaned = text
    .replace(/\s*[—–,;]\s*contraentrega disponible/gi, "")
    .replace(/contraentrega disponible/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Si al recortar la frase quedó sin cierre, la cerramos con punto.
  return /[.!?…:]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

/**
 * <CmsText> variante COD-aware: si COD_ENABLED está apagado, recorta la coletilla
 * "contraentrega disponible" del paso 3 (aplica igual al texto CMS que al fallback).
 */
async function CodAwareCmsText({ blockKey, fallback }: { blockKey: string; fallback: string }) {
  const [block, codValue] = await Promise.all([
    getCmsBlock(blockKey),
    getSettingValue("COD_ENABLED", "true"),
  ]);
  // Tokens canónicos ({{total}}/{{fab}}/{{entrega}}…) se resuelven ANTES del recorte COD.
  const text = await resolveCmsTokens(block?.body ?? fallback);
  return <>{codValue === "true" ? text : stripCodMention(text)}</>;
}

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
              {"codAware" in s && s.codAware ? (
                <CodAwareCmsText blockKey={s.descKey} fallback={s.descFallback} />
              ) : (
                <CmsText blockKey={s.descKey} fallback={s.descFallback} />
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}
