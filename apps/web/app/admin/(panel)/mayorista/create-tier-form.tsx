"use client";

/*
 * Formulario de creación de nivel mayorista con simulador económico en vivo.
 * El precio se digita en PESOS (la conversión a centavos ocurre server-side en
 * la action). Muestra de inmediato el descuento porcentual frente al precio de
 * referencia, el pedido mínimo en pesos y la salud del margen bruto frente al
 * costo BOM (`Product.cost`).
 */

import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { validateWholesaleTierCandidate } from "@/features/cart/volume-pricing";
import { formatCOP } from "@/lib/format";
import { createWholesaleTierAction, type TierActionState } from "./actions";

export type ProductOption = {
  id: string;
  name: string;
  sku: string;
  basePrice: number; // centavos
  referencePrice: number; // centavos (precio mínimo de opción activa o basePrice)
  cost: number | null; // centavos BOM
  maxMinQty: number;
  unitPlural: string;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    price: number;
    maxMinQty: number;
    unitPlural: string;
  }>;
  activeTiers: Array<{ variantId: string | null; minQty: number; unitPrice: number }>;
};

export function CreateTierForm({
  products,
  globalActiveTiers,
  defaultProductId = "",
  canViewCosts = false,
}: {
  products: ProductOption[];
  globalActiveTiers: Array<{ minQty: number; unitPrice: number }>;
  defaultProductId?: string;
  canViewCosts?: boolean;
}) {
  const [state, formAction, isPending] = useActionState<TierActionState | null, FormData>(
    createWholesaleTierAction,
    null,
  );

  const [productId, setProductId] = useState(defaultProductId);
  const [variantId, setVariantId] = useState("");
  const [minQtyRaw, setMinQtyRaw] = useState("");
  const [pricePesosRaw, setPricePesosRaw] = useState("");
  const [isActive, setIsActive] = useState(true);

  const selectedProduct = productId ? (products.find((p) => p.id === productId) ?? null) : null;
  const selectedVariant =
    selectedProduct && variantId
      ? (selectedProduct.variants.find((v) => v.id === variantId) ?? null)
      : null;
  const effectiveRefPrice = selectedVariant
    ? selectedVariant.price
    : (selectedProduct?.referencePrice ?? null);
  const effectiveMaxMinQty = selectedVariant
    ? selectedVariant.maxMinQty
    : (selectedProduct?.maxMinQty ?? 100);
  const effectiveUnitPlural = selectedVariant
    ? selectedVariant.unitPlural
    : (selectedProduct?.unitPlural ?? "unidades");
  const minQty = Number.parseInt(minQtyRaw, 10);
  const pricePesos = Number(pricePesosRaw);
  const unitPriceCents =
    Number.isFinite(pricePesos) && pricePesos > 0 ? Math.round(pricePesos * 100) : 0;

  const activeSiblings = selectedProduct
    ? selectedProduct.activeTiers
        .filter((t) => t.variantId === (selectedVariant?.id ?? null))
        .map((t) => ({ minQty: t.minQty, unitPrice: t.unitPrice }))
    : globalActiveTiers;
  const liveViolation =
    Number.isInteger(minQty) && minQty > effectiveMaxMinQty
      ? ({ kind: "EXCEEDS_MAX_UNITS", maxAllowedQty: effectiveMaxMinQty } as const)
      : Number.isInteger(minQty) && minQty >= 2 && unitPriceCents >= 100
        ? validateWholesaleTierCandidate({
            minQty,
            unitPrice: unitPriceCents,
            willBeActive: isActive,
            referencePrice: effectiveRefPrice,
            activeSiblings,
            maxAllowedQty: effectiveMaxMinQty,
          })
        : null;

  const savingsPct =
    effectiveRefPrice !== null &&
    effectiveRefPrice > 0 &&
    unitPriceCents > 0 &&
    unitPriceCents < effectiveRefPrice
      ? Math.max(1, Math.round(((effectiveRefPrice - unitPriceCents) / effectiveRefPrice) * 100))
      : null;

  const distinctOptionPrices = selectedProduct
    ? [...new Set(selectedProduct.variants.map((v) => v.price))]
    : [];
  const hasDifferentOptionPrices = distinctOptionPrices.length > 1;

  const costCents = selectedProduct?.cost ?? null;
  const marginCents = costCents !== null && unitPriceCents > 0 ? unitPriceCents - costCents : null;
  const marginPct =
    marginCents !== null && unitPriceCents > 0
      ? Math.round((marginCents / unitPriceCents) * 100)
      : null;
  const isBelowCost = marginCents !== null && marginCents < 0;

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <label
            htmlFor="t-product"
            className="text-brand-purple-dark/80 mb-1 block text-xs font-semibold"
          >
            Alcance / producto <span className="text-rose-600">*</span>
          </label>
          <select
            id="t-product"
            name="productId"
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setVariantId("");
            }}
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-10 w-full rounded-lg border bg-white px-3 text-sm focus:ring-2 focus:outline-none"
          >
            <option value="">Todo el catálogo (global)</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.sku} ({formatCOP(p.referencePrice)})
              </option>
            ))}
          </select>
          {state?.fieldErrors?.productId && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.productId[0]}</p>
          )}
          <p className="text-brand-muted mt-1 text-xs">
            Precedencia: opción específica &gt; producto completo &gt; global.
          </p>
        </div>

        <div>
          <label
            htmlFor="t-variant"
            className="text-brand-purple-dark/80 mb-1 block text-xs font-semibold"
          >
            Opción / tamaño (opcional)
          </label>
          <select
            id="t-variant"
            name="variantId"
            value={variantId}
            disabled={!selectedProduct || selectedProduct.variants.length <= 1}
            onChange={(e) => setVariantId(e.target.value)}
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-10 w-full rounded-lg border bg-white px-3 text-sm focus:ring-2 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">Todas las opciones del producto</option>
            {(selectedProduct?.variants ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name === "Default" ? "Única" : v.name} ({formatCOP(v.price)})
              </option>
            ))}
          </select>
          {state?.fieldErrors?.variantId && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.variantId[0]}</p>
          )}
          <p className="text-brand-muted mt-1 text-xs">
            {selectedProduct && hasDifferentOptionPrices && !variantId
              ? "Este producto tiene opciones con distinto precio; puedes elegir una opción específica."
              : "Elige una opción si cada tamaño maneja su propia escala."}
          </p>
        </div>

        <div>
          <label
            htmlFor="t-minqty"
            className="text-brand-purple-dark/80 mb-1 block text-xs font-semibold"
          >
            Cantidad mínima <span className="text-rose-600">*</span>
          </label>
          <input
            id="t-minqty"
            name="minQty"
            type="number"
            min={2}
            max={effectiveMaxMinQty}
            step={1}
            required
            value={minQtyRaw}
            onChange={(e) => setMinQtyRaw(e.target.value)}
            placeholder={String(Math.min(3, effectiveMaxMinQty))}
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-10 w-full rounded-lg border bg-white px-3 text-sm tabular-nums focus:ring-2 focus:outline-none"
          />
          {state?.fieldErrors?.minQty && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.minQty[0]}</p>
          )}
          <p className="text-brand-muted mt-1 text-xs">
            {selectedProduct
              ? `Permitido para esta opción: 2 a ${effectiveMaxMinQty} ${effectiveUnitPlural}.`
              : `A partir de cuántas unidades aplica (entre 2 y ${effectiveMaxMinQty}).`}
          </p>
        </div>

        <div>
          <label
            htmlFor="t-price"
            className="text-brand-purple-dark/80 mb-1 block text-xs font-semibold"
          >
            Precio por unidad (pesos COP) <span className="text-rose-600">*</span>
          </label>
          <input
            id="t-price"
            name="unitPricePesos"
            type="number"
            min={1}
            max={5000000}
            step={1}
            required
            value={pricePesosRaw}
            onChange={(e) => setPricePesosRaw(e.target.value)}
            placeholder="8500"
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-10 w-full rounded-lg border bg-white px-3 text-sm tabular-nums focus:ring-2 focus:outline-none"
          />
          {state?.fieldErrors?.unitPrice && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.unitPrice[0]}</p>
          )}
          <p className="text-brand-muted mt-1 text-xs">
            En pesos colombianos sin puntos ni signos. Ej: 8500 = $8.500.
          </p>
        </div>
      </div>

      {/* Simulador económico en vivo */}
      {(selectedProduct || unitPriceCents > 0) && (
        <div
          className={`rounded-xl border p-3.5 text-xs transition-colors ${
            liveViolation
              ? "border-rose-200 bg-rose-50/70"
              : isBelowCost
                ? "border-rose-200 bg-rose-50/60"
                : "border-brand-purple/15 bg-brand-cream/40"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="text-brand-purple-dark inline-flex items-center gap-1.5 font-semibold">
                <Sparkles className="text-brand-purple h-3.5 w-3.5" />
                Simulación en vivo
              </span>
              {effectiveRefPrice !== null && (
                <span className="text-brand-muted">
                  Precio base{selectedVariant ? ` (${selectedVariant.name})` : ""}:{" "}
                  <strong className="text-brand-purple-dark tabular-nums">
                    {formatCOP(effectiveRefPrice)}
                  </strong>
                </span>
              )}
              {savingsPct !== null && effectiveRefPrice !== null && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800 tabular-nums">
                  −{savingsPct}% ({formatCOP(effectiveRefPrice - unitPriceCents)} menos/u)
                </span>
              )}
              {Number.isInteger(minQty) && minQty >= 2 && unitPriceCents > 0 && (
                <span className="text-brand-muted">
                  Pedido mínimo ({minQty} u.):{" "}
                  <strong className="text-brand-purple-dark tabular-nums">
                    {formatCOP(unitPriceCents * minQty)}
                  </strong>
                </span>
              )}
            </div>

            {selectedProduct && (
              <div className="flex flex-wrap items-center gap-2">
                {costCents !== null && costCents > 0 ? (
                  <>
                    <span className="text-brand-muted">
                      Costo BOM:{" "}
                      <strong className="text-brand-purple-dark tabular-nums">
                        {formatCOP(costCents)}
                      </strong>
                    </span>
                    {marginCents !== null && marginPct !== null && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold tabular-nums ${
                          isBelowCost
                            ? "bg-rose-100 text-rose-800 ring-1 ring-rose-300"
                            : marginPct < 20
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {isBelowCost ? (
                          <AlertTriangle className="h-3 w-3" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        Margen: {formatCOP(marginCents)}/u ({marginPct}%)
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-brand-muted">
                    Sin costo BOM cargado
                    {canViewCosts && (
                      <>
                        {" · "}
                        <Link
                          href={`/admin/costos?q=${encodeURIComponent(selectedProduct.sku)}`}
                          className="text-brand-purple font-semibold hover:underline"
                        >
                          Configurar costo
                        </Link>
                      </>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>

          {liveViolation && (
            <p className="mt-2 flex items-center gap-1.5 font-medium text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {liveViolation.kind === "EXCEEDS_MAX_UNITS"
                ? `No se puede guardar: el selector de este producto permite máximo ${liveViolation.maxAllowedQty} ${effectiveUnitPlural} (usa Empresas y Eventos para pedidos mayores).`
                : liveViolation.kind === "ABOVE_OR_EQUAL_BASE"
                  ? `No se puede guardar: el precio mayorista debe ser estrictamente menor a ${formatCOP(liveViolation.referencePrice)}.`
                  : liveViolation.kind === "INVERTED_HIGHER_QTY"
                    ? `Escala invertida: a ${minQty}+ ${effectiveUnitPlural} el precio debe ser menor que el nivel activo de ${liveViolation.conflictMinQty}+ (${formatCOP(liveViolation.conflictUnitPrice)}).`
                    : `Escala invertida: a ${minQty}+ ${effectiveUnitPlural} el precio debe ser mayor que el nivel activo de ${liveViolation.conflictMinQty}+ (${formatCOP(liveViolation.conflictUnitPrice)}).`}
            </p>
          )}

          {!liveViolation && isBelowCost && costCents !== null && (
            <p className="mt-2 flex items-center gap-1.5 font-medium text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              Alerta de margen negativo: venderás {formatCOP(costCents - unitPriceCents)} por debajo
              del costo BOM por unidad. Se permite para liquidaciones puntuales, pero quedará
              destacado en rojo.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <label
            htmlFor="t-note"
            className="text-brand-purple-dark/80 mb-1 block text-xs font-semibold"
          >
            Nota interna (opcional)
          </label>
          <input
            id="t-note"
            name="note"
            maxLength={200}
            placeholder="Ej: escala corporativa temporada fin de año"
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-10 w-full rounded-lg border bg-white px-3 text-sm focus:ring-2 focus:outline-none"
          />
          {state?.fieldErrors?.note && (
            <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.note[0]}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="text-brand-purple-dark inline-flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="accent-brand-purple"
            />
            Activar de inmediato
          </label>
          <button
            type="submit"
            disabled={isPending || Boolean(liveViolation)}
            className="bg-gradient-brand inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Creando…" : "Crear nivel"}
          </button>
        </div>
      </div>

      {state?.error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
