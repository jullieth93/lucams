"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { linkProductOcasionAction, unlinkProductOcasionAction } from "../actions";

type LinkedProduct = {
  productId: string;
  productSlug: string;
  productName: string;
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
        <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          Todavía no hay productos asociados a esta ocasión.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
          {linkedProducts.map((link) => (
            <li key={link.productId} className="flex items-start gap-3 px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">{link.productName}</p>
                <p className="font-mono text-xs text-slate-500">{link.productSlug}</p>
                {link.rationale ? (
                  <p className="mt-1 text-xs text-slate-600 italic">&quot;{link.rationale}&quot;</p>
                ) : (
                  <p className="mt-1 text-xs text-amber-600">
                    ⚠ Sin rationale — el bot no podrá justificar.
                  </p>
                )}
              </div>
              <form action={unlinkProductOcasionAction}>
                <input type="hidden" name="productId" value={link.productId} />
                <input type="hidden" name="ocasionTagId" value={ocasionTagId} />
                <button
                  type="submit"
                  className="text-red-600 hover:text-red-900"
                  onClick={(e) => {
                    if (!confirm("¿Desasociar este producto de la ocasión?")) e.preventDefault();
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {/* Form para agregar producto */}
      <div className="rounded-md border border-slate-200 p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-900">Asociar producto nuevo</h3>
        <input
          type="text"
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500">Sin productos disponibles.</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {filtered.slice(0, 20).map((p) => (
              <form
                key={p.id}
                action={linkProductOcasionAction}
                className="rounded border border-slate-200 bg-slate-50 p-2"
              >
                <input type="hidden" name="productId" value={p.id} />
                <input type="hidden" name="ocasionTagId" value={ocasionTagId} />
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{p.name}</p>
                    <p className="font-mono text-xs text-slate-500">{p.slug}</p>
                  </div>
                  <input
                    type="text"
                    name="rationale"
                    placeholder="Rationale: ¿por qué este producto sirve para esta ocasión?"
                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    <Plus className="h-3 w-3" />
                    Asociar
                  </button>
                </div>
              </form>
            ))}
            {filtered.length > 20 && (
              <p className="text-center text-xs text-slate-500">
                +{filtered.length - 20} más — refina la búsqueda
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
