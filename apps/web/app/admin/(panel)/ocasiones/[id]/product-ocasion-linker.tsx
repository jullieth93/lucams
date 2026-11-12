"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, X } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Input } from "@/components/ui/input";
import { linkProductOcasionAction, unlinkProductOcasionAction } from "../actions";

type LinkedProduct = {
  productId: string;
  productSlug: string;
  productName: string;
  isActive: boolean;
  rationale: string | null;
};

type AvailableProduct = {
  id: string;
  slug: string;
  name: string;
};

type Props = {
  ocasionTagId: string;
  linkedProducts: LinkedProduct[];
  availableProducts: AvailableProduct[];
};

export function ProductOcasionLinker({ ocasionTagId, linkedProducts, availableProducts }: Props) {
  const [search, setSearch] = useState("");
  const filtered = search
    ? availableProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.slug.toLowerCase().includes(search.toLowerCase()),
      )
    : availableProducts;

  return (
    <div className="space-y-6">
      {/* Lista de productos ya asociados */}
      {linkedProducts.length === 0 ? (
        <p className="border-brand-purple/15 text-brand-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
          Todavía no hay productos asociados a esta ocasión.
        </p>
      ) : (
        <ul className="divide-brand-purple/10 border-brand-purple/10 divide-y rounded-xl border bg-white">
          {linkedProducts.map((link) => (
            <li
              key={link.productId}
              className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50/70"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/productos/${link.productId}`}
                    className="text-brand-purple-dark hover:text-brand-purple text-sm font-semibold hover:underline"
                  >
                    {link.productName}
                  </Link>
                  {!link.isActive && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      Pausado
                    </span>
                  )}
                  <Link
                    href={`/producto/${link.productSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Ver ficha pública del producto"
                    className="text-brand-muted hover:text-brand-purple inline-flex items-center gap-0.5 text-[11px]"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                <p className="text-brand-muted font-mono text-xs">{link.productSlug}</p>
                {link.rationale ? (
                  <p className="text-brand-purple-dark/80 mt-1 text-xs italic">
                    &quot;{link.rationale}&quot;
                  </p>
                ) : (
                  <p className="text-brand-muted mt-1 text-xs">
                    Sin motivo destacado (opcional para enriquecer la vitrina y el recomendador).
                  </p>
                )}
              </div>
              <ConfirmAction
                action={unlinkProductOcasionAction}
                message="¿Desasociar este producto de la ocasión?"
              >
                <input type="hidden" name="productId" value={link.productId} />
                <input type="hidden" name="ocasionTagId" value={ocasionTagId} />
                <button
                  type="submit"
                  aria-label={`Desasociar ${link.productName}`}
                  className="rounded-md p-1 text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </ConfirmAction>
            </li>
          ))}
        </ul>
      )}

      {/* Form para agregar producto */}
      <div className="border-brand-purple/10 rounded-xl border bg-slate-50/40 p-4">
        <h3 className="text-brand-purple-dark mb-3 text-sm font-bold">Asociar producto</h3>
        <Input
          type="search"
          placeholder="Buscar producto por nombre o slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-brand-purple/20 mb-3 bg-white text-sm"
        />
        {filtered.length === 0 ? (
          <p className="text-brand-muted text-sm">Sin productos disponibles para agregar.</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {filtered.slice(0, 20).map((p) => (
              <form
                key={p.id}
                action={linkProductOcasionAction}
                className="border-brand-purple/10 rounded-lg border bg-white p-2.5 shadow-2xs"
              >
                <input type="hidden" name="productId" value={p.id} />
                <input type="hidden" name="ocasionTagId" value={ocasionTagId} />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 sm:w-56">
                    <Link
                      href={`/admin/productos/${p.id}`}
                      className="text-brand-purple-dark hover:text-brand-purple block truncate text-sm font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    <p className="text-brand-muted truncate font-mono text-xs">{p.slug}</p>
                  </div>
                  <input
                    type="text"
                    name="rationale"
                    placeholder="Motivo sugerido (ej. Ideal como recordatorio con foto y fecha)"
                    className="border-brand-purple/20 focus:border-brand-purple min-w-0 flex-1 rounded-md border bg-slate-50/60 px-2.5 py-1.5 text-xs focus:bg-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="bg-gradient-brand inline-flex shrink-0 items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Asociar
                  </button>
                </div>
              </form>
            ))}
            {filtered.length > 20 && (
              <p className="text-brand-muted pt-1 text-center text-xs">
                +{filtered.length - 20} productos más — escribe arriba para filtrar.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
