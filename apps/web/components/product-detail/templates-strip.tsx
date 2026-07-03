/*
 * <TemplatesStrip /> — Sección en PDP que muestra las plantillas asociadas al producto.
 *
 * PLAN_CATALOG_V2 decisión 5.2 + 5.8 — dos caminos visibles:
 *   - Si producto kind=NONE: templates con mode=PREMADE (compra-tal-cual).
 *     Click → futuro /carrito?templateId=X (V2). Hoy navega al estudio (V1).
 *   - Si producto personalizable: templates con mode=EDITABLE.
 *     Click → /estudio/<slug>?template=<templateSlug>.
 */

import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { listTemplatesByProduct } from "@/lib/catalog";

export async function TemplatesStrip({
  productSlug,
  isPersonalizable,
}: {
  productSlug: string;
  isPersonalizable: boolean;
}) {
  const mode = isPersonalizable ? "EDITABLE" : "PREMADE";
  const templates = await listTemplatesByProduct(productSlug, mode);
  if (templates.length === 0) return null;

  const title = isPersonalizable ? "Empieza desde una plantilla" : "Diseños disponibles";
  const subtitle = isPersonalizable
    ? "Elige un punto de partida y personaliza con tus fotos"
    : "Compra el diseño que más te guste, listo para enviar";

  return (
    <section className="border-brand-purple/10 mt-8 rounded-xl border bg-white p-5">
      <div className="mb-4">
        <h2 className="text-brand-purple-dark text-lg font-bold">
          <Sparkles className="text-brand-purple mr-1 inline h-4 w-4" />
          {title}
        </h2>
        <p className="text-brand-purple-dark/70 text-sm">{subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {templates.slice(0, 8).map((t) => {
          const href = isPersonalizable
            ? `/estudio/${productSlug}?template=${t.slug}`
            : `/producto/${productSlug}?templateId=${t.id}`;
          return (
            <Link
              key={t.id}
              href={href}
              className="group border-brand-purple/15 hover:border-brand-purple/40 overflow-hidden rounded-lg border bg-white transition-all hover:shadow-md"
            >
              <div className="from-brand-turquoise/15 via-brand-cream to-brand-pink/15 relative aspect-square w-full bg-gradient-to-br">
                {t.previewUrl ? (
                  <Image
                    src={t.previewUrl}
                    alt={t.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Sparkles className="text-brand-muted h-8 w-8" />
                  </div>
                )}
                {!isPersonalizable && (
                  <span className="bg-brand-purple absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white">
                    Listo
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="text-brand-purple-dark line-clamp-1 text-xs font-semibold">
                  {t.name}
                </p>
                {t.description && (
                  <p className="text-brand-muted mt-0.5 line-clamp-2 text-[10px]">
                    {t.description}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
