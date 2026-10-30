"use client";

/*
 * CategoryIntro — encabezado editorial de la vista de categoría (2026-10-29,
 * feedback owner): en MÓVIL la descripción + el caso de uso copaban el primer
 * viewport y el producto «se perdía» — parecía publicidad, no tienda. Ahora en
 * <sm el texto va colapsado a 2 líneas con «Leer más / Leer menos»; en ≥sm se
 * muestra completo como siempre. El texto completo queda en el DOM colapsado
 * (el SEO lo lee igual — el clamp es visual).
 */

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function CategoryIntro({
  description,
  useCase,
  readMore,
  readLess,
}: {
  description: string;
  useCase?: string | null;
  /** Textos CMS (los resuelve el padre server con <CmsText>) — 2026-10-30. */
  readMore: ReactNode;
  readLess: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <div className={expanded ? "" : "max-sm:[&_p]:line-clamp-2"}>
        <p className="text-brand-purple-dark/70 mt-2 max-w-2xl text-base">{description}</p>
        {useCase && <p className="text-brand-muted mt-1 max-w-2xl text-sm italic">{useCase}</p>}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="text-brand-purple-dark hover:text-brand-purple focus:ring-brand-turquoise mt-1 inline-flex min-h-10 items-center gap-1 text-xs font-semibold focus:ring-2 focus:outline-none sm:hidden"
      >
        {expanded ? readLess : readMore}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
    </div>
  );
}
