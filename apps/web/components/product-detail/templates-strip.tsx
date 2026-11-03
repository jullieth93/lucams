/*
 * <TemplatesStrip /> — Sección en PDP que muestra las plantillas EDITABLES del
 * producto como punto de partida del Estudio.
 *
 * Click → /estudio/<slug>?template=<templateSlug>: la página del Estudio resuelve
 * el slug contra la lista visible del producto y el draft nuevo arranca con ESA
 * plantilla (N-08, 2026-09-11 — antes el parámetro se generaba pero nadie lo leía).
 *
 * DECISIÓN DE PRODUCTO (2026-09-11, orquestador) — el concepto PREMADE se RETIRA:
 * la rama kind=NONE que enlazaba `/producto/<slug>?templateId=<id>` no tenía un
 * solo consumidor en el repo, 0 plantillas PREMADE en las 3 bases y 0 filas de
 * CartItem/OrderItem con templateId. Era funcionalidad falsa. Si el negocio
 * quiere "compra-tal-cual" más adelante, será un feature nuevo con diseño propio.
 * El strip queda solo EDITABLE; para productos NO personalizables no se renderiza
 * (no hay Estudio al que enlazar).
 *
 * Tope de 8 tarjetas (`.slice(0, 8)`): el grid es 4 columnas → 2 filas máximo;
 * el resto de plantillas sigue disponible en el sidebar del Estudio.
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
  // PREMADE retirado (ver header): sin Estudio no hay destino para el deep-link.
  if (!isPersonalizable) return null;

  const templates = await listTemplatesByProduct(productSlug);
  if (templates.length === 0) return null;

  return (
    <section className="border-brand-purple/10 mt-8 rounded-xl border bg-white p-5">
      <div className="mb-4">
        <h2 className="text-brand-purple-dark text-lg font-bold">
          <Sparkles className="text-brand-purple mr-1 inline h-4 w-4" />
          Empieza desde una plantilla
        </h2>
        <p className="text-brand-purple-dark/70 text-sm">
          Elige un punto de partida y personaliza con tus fotos
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {templates.slice(0, 8).map((t) => (
          <Link
            key={t.id}
            href={`/estudio/${productSlug}?template=${t.slug}`}
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
            </div>
            <div className="p-2">
              <p className="text-brand-purple-dark line-clamp-1 text-xs font-semibold">{t.name}</p>
              {t.description && (
                <p className="text-brand-muted mt-0.5 line-clamp-2 text-[10px]">{t.description}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
