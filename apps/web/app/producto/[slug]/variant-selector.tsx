"use client";

/*
 * VariantSelector — M.3.b.CAT.B reescrito 2026-05-18.
 *
 * Arquitectura: SINGLE SOURCE OF TRUTH = local state `selectedId`.
 *   - El selector controla su estado visual con `useState`.
 *   - La URL es UN SIDE-EFFECT (deep-link in / out), no source.
 *   - El click hace `setSelectedId(id)` INMEDIATO (urgent update) →
 *     React renderea el chip nuevo seleccionado en el siguiente paint.
 *   - Luego `router.replace(?variant=id)` en transition para que el
 *     Server Component padre re-renderee (precio header + link al
 *     Estudio + JSON-LD).
 *
 * Por qué este patrón:
 *   - El bug previo mezclaba `useState + useEffect(sync con URL) +
 *     useTransition`. React 19 agrupaba el setOptimisticId dentro de
 *     la transition → no había paint visible hasta los ~3s del RSC.
 *   - Con un solo source, no hay bucle de sync. Local state = lo
 *     que el cliente ve. Server state catches up async.
 *
 * Modo single-dim: lista vertical con price por variant. EXCEPCIÓN (Lucy
 * 2026-07-22, polaroid 7.5×10 qty 1–10): si la ÚNICA dimensión visible es la
 * cantidad 1..N contigua, se usa el stepper +/− del modo multi-dim en vez de
 * la lista vertical de N filas.
 * Modo multi-dim: chips por dimensión + card de Precio prominente.
 *   - La dimensión Cantidad (quantity/photoSlots) se muestra como stepper +/−
 *     con "$X c/u" + total de la línea cuando sus valores son 1..N contiguos
 *     (fotoimanes/separadores 1–6); sets no contiguos (polaroid 6/9/12/20)
 *     conservan chips. La selección siempre mapea a la variant con esa
 *     cantidad (mismo handleSelectValue que los chips) → deep-link ?variant=
 *     y dedupe quantity/photoSlots intactos.
 *   - Dimensión de 1 SOLO valor (Lucy 2026-07-22): normalmente se oculta por
 *     redundante (Forma igual en todas las variants). EXCEPCIÓN: las claves en
 *     SINGLE_VALUE_VISIBLE_DIMS (hoy `sizeCm`) se muestran igual como chip
 *     único preseleccionado NO clicable — el tamaño físico es información de
 *     compra ("Tamaño: 7.5×10 cm" en polaroid, "6.5×20 cm" en tiras) y deja
 *     el grupo listo para cuando el producto acople más tamaños.
 */

import { useMemo } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { formatCOP } from "@/lib/format";
import { useSelectedVariant } from "./variant-actions";
import {
  parseVariantAttributes,
  generateVariantLabel,
  type ProductVariantAttributes,
} from "@/features/products/variant-schemas";

type Variant = {
  id: string;
  name: string;
  sku: string;
  price: number | null;
  attributes: unknown;
};

type VariantSelectorProps = {
  productBasePrice: number;
  variants: Variant[];
  /** #14 — en productos por-ficha (Nombre) el total lo lleva el NamePricePicker ("$X por ficha ·
   * count × price = total"); ocultamos el card "Precio" pelado del selector (confunde: parece el
   * total pero es el precio de UNA ficha). */
  perTile?: boolean;
  /** Ola 2A — claves de attributes que NO se muestran como grupo (se eligen en el Estudio:
   * variantStyle/frameStyle/theme/language según el producto). Las variantes siguen intactas;
   * solo se filtra el grupo del UI. */
  hiddenDimensions?: readonly string[];
};

const DIMENSION_LABELS: Record<string, string> = {
  quantity: "Cantidad",
  photoSlots: "Fotos",
  sizeCm: "Tamaño",
  shape: "Forma",
  color: "Color",
  finish: "Acabado",
  language: "Idioma",
  magnet: "¿Con imán?",
  frameStyle: "Marco",
  variantStyle: "Estilo",
  theme: "Tema",
};

/** Orden preferido por dimensión no numérica (lo demás = alfabético). */
const DIMENSION_VALUE_ORDER: Record<string, string[]> = {
  language: ["es", "en"],
  magnet: ["true", "false"],
  frameStyle: ["blanco", "negro"],
  variantStyle: ["blanco-clasico", "pasteles", "instagram"],
  theme: ["animales", "frutas", "profesiones"],
};

function formatDimensionValue(key: string, value: unknown): string {
  if (key === "quantity") return `${value} unidades`;
  if (key === "photoSlots") return `${value} fotos`;
  if (key === "sizeCm") return `${value} cm`;
  if (key === "shape") {
    const labels: Record<string, string> = {
      rectangle: "Rectangular",
      circle: "Circular",
      heart: "Corazón",
      custom: "Custom",
    };
    return labels[String(value)] ?? String(value);
  }
  if (key === "finish") {
    const labels: Record<string, string> = {
      matte: "Mate",
      glossy: "Brillante",
      "soft-touch": "Soft-touch",
      glass: "Vidrio",
    };
    return labels[String(value)] ?? String(value);
  }
  if (key === "language") {
    const labels: Record<string, string> = { es: "Español", en: "Inglés" };
    return labels[String(value)] ?? String(value);
  }
  if (key === "magnet") return String(value) === "true" ? "🧲 Con imán" : "✨ Sin imán";
  if (key === "frameStyle") {
    const labels: Record<string, string> = { blanco: "Blanco", negro: "Negro" };
    return labels[String(value)] ?? String(value);
  }
  if (key === "variantStyle") {
    const labels: Record<string, string> = {
      "blanco-clasico": "Blanco clásico",
      pasteles: "Pasteles",
      instagram: "Instagram",
    };
    return labels[String(value)] ?? String(value);
  }
  if (key === "theme") {
    const labels: Record<string, string> = {
      animales: "Animales",
      frutas: "Frutas",
      profesiones: "Profesiones",
    };
    return labels[String(value)] ?? String(value);
  }
  return String(value);
}

const VISIBLE_DIMENSIONS: (keyof ProductVariantAttributes)[] = [
  "language",
  "quantity",
  "photoSlots",
  "sizeCm",
  "shape",
  "color",
  "finish",
  "magnet",
  "frameStyle",
  "variantStyle",
  "theme",
];

/**
 * Dimensiones visibles AUN con 1 solo valor (Lucy 2026-07-22). Regla:
 * una dimensión se muestra si está en VISIBLE_DIMENSIONS y (tiene >1 valor
 * distinto O está en esta lista). Hoy solo `sizeCm`: el tamaño físico es dato
 * de compra ("Tamaño: 7.5×10 cm" polaroid · "6.5×20 cm" tiras) y el grupo
 * queda listo para cuando el producto acople más tamaños. El resto de claves
 * con 1 valor (Forma, Marco fijo…) siguen ocultas por redundantes.
 */
const SINGLE_VALUE_VISIBLE_DIMS: ReadonlySet<string> = new Set(["sizeCm"]);

/** Dimensiones que representan CANTIDAD de unidades (candidatas al stepper +/−). */
const QUANTITY_DIM_KEYS: ReadonlySet<string> = new Set(["quantity", "photoSlots"]);

/**
 * ¿Los valores de la dimensión son exactamente 1..N contiguos? Solo así la cantidad
 * se elige con stepper +/− (fotoimanes cuadrados y separadores: 1–6, Lucy 2026-07-22).
 * Sets NO contiguos (polaroid 6/9/12/20) conservan chips: un stepper insinuaría que
 * existen todos los tamaños intermedios. La regla es por-producto, derivada de los
 * valores reales de sus variants — no de una lista fija.
 */
function isContiguousFromOne(values: string[]): boolean {
  const nums = values.map((v) => Number.parseInt(v, 10));
  if (nums.length === 0 || nums.some((n) => !Number.isFinite(n))) return false;
  return [...nums].sort((a, b) => a - b).every((n, i) => n === i + 1);
}

export function VariantSelector({
  productBasePrice,
  variants: rawVariants,
  perTile = false,
  hiddenDimensions,
}: VariantSelectorProps) {
  // ──── SINGLE SOURCE OF TRUTH: el Context del buy-box (H12) ────
  // Antes el estado vivía LOCAL acá + router.replace; las acciones (CTA/carrito/precio) no se
  // enteraban al instante. Ahora el estado es compartido: el selector lo escribe y las acciones lo
  // leen → todo cambia en el mismo paint. La URL se sincroniza como side-effect dentro del provider.
  const { selectedId, setSelectedId } = useSelectedVariant();

  // Filtrar la variant "Default" vacía si hay otras con attributes reales.
  const variants = useMemo(() => {
    const withAttrs = rawVariants.filter((v) => {
      const attrs = parseVariantAttributes(v.attributes);
      return Object.keys(attrs).length > 0;
    });
    return withAttrs.length > 0 ? withAttrs : rawVariants;
  }, [rawVariants]);

  const selectedVariant = variants.find((v) => v.id === selectedId);

  function selectVariant(id: string) {
    if (id === selectedId) return; // mismo variant, nada que hacer
    setSelectedId(id);
  }

  // Detectar dimensiones presentes con >1 valor distinto (más las de 1 valor
  // en SINGLE_VALUE_VISIBLE_DIMS). Modo multi-dim: chips por dimensión. El
  // cliente combina libremente. Si una combinación específica no existe en el
  // catálogo, el chip correspondiente se muestra deshabilitado ("no
  // disponible") en lugar de cambiar la dimensión no-clickeada automáticamente.
  const dimensions = useMemo(() => {
    const dimMap: Record<string, Set<string>> = {};
    for (const v of variants) {
      const attrs = parseVariantAttributes(v.attributes);
      for (const key of VISIBLE_DIMENSIONS) {
        const value = attrs[key];
        if (value === undefined || value === null) continue;
        if (!dimMap[key]) dimMap[key] = new Set();
        dimMap[key].add(String(value));
      }
    }
    // Dimensiones con >1 valor distinto, o de 1 valor visible (sizeCm).
    const keys = VISIBLE_DIMENSIONS.filter(
      (key) => dimMap[key] && (dimMap[key].size > 1 || SINGLE_VALUE_VISIBLE_DIMS.has(key)),
    );
    // Dedupe de grupos redundantes: si dos dimensions tienen EXACTAMENTE el mismo
    // valor en TODAS las variants (ej. `quantity` y `photoSlots` en packs donde cada
    // unidad lleva 1 foto), elegir por una equivale a elegir por la otra → mostrar
    // ambas pintaría el mismo grupo dos veces (bug: doble grupo "CANTIDAD" en la PDP
    // de separadores-libros). Se conserva la primera según VISIBLE_DIMENSIONS.
    const uniqueKeys = keys.filter(
      (key, i) =>
        !keys.slice(0, i).some((other) =>
          variants.every((v) => {
            const attrs = parseVariantAttributes(v.attributes);
            return String(attrs[key]) === String(attrs[other]);
          }),
        ),
    );
    // Ola 2A — ocultar las dimensiones que se eligen en el Estudio (Estilo/Marco/Tema/Idioma).
    // El dato sigue en la variante seleccionada (preselección del Estudio + cotización);
    // solo NO se pinta el grupo de chips. El dedupe corre ANTES para que una dim oculta no
    // "tape" una visible idéntica (ej. theme espejo de otra clave).
    const hidden = new Set(hiddenDimensions ?? []);
    const visibleKeys = uniqueKeys.filter((key) => !hidden.has(key));
    return visibleKeys.map((key) => {
      const rawValues = Array.from(dimMap[key]);
      const order = DIMENSION_VALUE_ORDER[key];
      let values: string[];
      if (order) {
        // Orden fijo (idioma, imantado); valores fuera de la lista al final.
        values = rawValues.sort(
          (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99),
        );
      } else if (key === "quantity" || key === "photoSlots" || key === "sizeCm") {
        // Numérico por el primer número (sizeCm "10×14" no debe ir antes que "5×7").
        values = rawValues.sort((a, b) => parseFloat(a) - parseFloat(b));
      } else {
        values = rawValues.sort();
      }
      return { key, label: DIMENSION_LABELS[key] ?? key, values };
    });
  }, [variants, hiddenDimensions]);

  // Valor actual por dimensión (del variant seleccionado) — refleja
  // INMEDIATO porque selectedVariant depende de selectedId (local).
  const currentValues = useMemo(() => {
    if (!selectedVariant) return {} as Record<string, string>;
    const attrs = parseVariantAttributes(selectedVariant.attributes);
    const result: Record<string, string> = {};
    for (const dim of dimensions) {
      const value = attrs[dim.key as keyof ProductVariantAttributes];
      if (value !== undefined && value !== null) result[dim.key] = String(value);
    }
    return result;
  }, [selectedVariant, dimensions]);

  // Helper: ¿existe una variant que cumpla "dimKey=value Y todas las otras
  // dimensiones = currentValues"? Si no, el chip se deshabilita en el UI.
  function isCombinationAvailable(dimKey: string, value: string): boolean {
    return variants.some((v) => {
      const attrs = parseVariantAttributes(v.attributes);
      const dimValue = attrs[dimKey as keyof ProductVariantAttributes];
      if (dimValue === undefined || String(dimValue) !== value) return false;
      for (const [k, val] of Object.entries(currentValues)) {
        if (k === dimKey) continue;
        const variantValue = attrs[k as keyof ProductVariantAttributes];
        if (variantValue === undefined || String(variantValue) !== val) return false;
      }
      return true;
    });
  }

  function handleSelectValue(dimKey: string, value: string) {
    // Buscar el variant EXACTO: dimKey=value Y todas las otras dimensiones
    // = currentValues. Si no existe (combinación no disponible), el chip
    // ya debería estar deshabilitado en el UI; pero por seguridad: no
    // hacer nada (no auto-cambiar las otras dimensiones).
    const exact = findExactVariant(dimKey, value);
    if (exact) {
      selectVariant(exact.id);
      return;
    }
    // Fallback: si por algún motivo el chip era clickeable pero no hay
    // match exacto (race condition), buscar la primera variant con
    // dimKey=value. No es ideal pero evita que el click sea no-op total.
    const fallback = variants.find((v) => {
      const attrs = parseVariantAttributes(v.attributes);
      const dimValue = attrs[dimKey as keyof ProductVariantAttributes];
      return dimValue !== undefined && String(dimValue) === value;
    });
    if (fallback) selectVariant(fallback.id);
  }

  /** Match exacto: dimKey=value Y las demás dimensiones como están (currentValues). */
  function findExactVariant(dimKey: string, value: string) {
    return variants.find((v) => {
      const attrs = parseVariantAttributes(v.attributes);
      const dimValue = attrs[dimKey as keyof ProductVariantAttributes];
      if (dimValue === undefined || String(dimValue) !== value) return false;
      for (const [k, val] of Object.entries(currentValues)) {
        if (k === dimKey) continue;
        const variantValue = attrs[k as keyof ProductVariantAttributes];
        if (variantValue === undefined || String(variantValue) !== val) return false;
      }
      return true;
    });
  }

  if (variants.length < 2 && dimensions.length === 0) return null;

  // Polaroid qty 1–10 (Lucy 2026-07-22): con UNA sola dimensión visible que es la
  // cantidad 1..N contigua, ir directo al modo multi-dim (que pinta el stepper +/−)
  // en vez de la lista vertical. Sin esto, pausar los sets viejos dejaba la PDP con
  // una lista de 10 filas y sin stepper.
  const firstDim = dimensions[0];
  const singleQuantityStepper =
    dimensions.length === 1 &&
    firstDim !== undefined &&
    QUANTITY_DIM_KEYS.has(firstDim.key) &&
    isContiguousFromOne(firstDim.values);

  // Dimensión de 1 SOLO valor visible (Tamaño fijo, Lucy 2026-07-22): se pinta
  // como chip estático en el modo multi-dim; la lista vertical "Elige tu opción"
  // no aplica porque no hay opción que elegir (tiras 6.5×20 con 1 sola variante).
  const singleStaticDim =
    dimensions.length === 1 && firstDim !== undefined && firstDim.values.length === 1;

  // ── Modo single-dimension: lista vertical con precio por variant ──
  // Ola 18 (Lucy 2026-07-26) — estilo visual UNIFICADO con el modo chips/stepper:
  // mismo acento púrpura de selección (antes turquesa, desentonaba), mismo ring-2 +
  // shadow-md al seleccionar y mismo hover que el resto de la PDP. La lógica de
  // selección (single source en Context) no cambia.
  if (dimensions.length <= 1 && !singleQuantityStepper && !singleStaticDim) {
    return (
      <div className="mb-4">
        <p className="text-brand-purple-dark/70 mb-2 text-xs font-bold tracking-wider uppercase">
          Elige tu opción
        </p>
        <div role="group" aria-label="Variantes del producto" className="flex flex-col gap-2">
          {variants.map((v) => {
            const attrs = parseVariantAttributes(v.attributes);
            const fallbackLabel = generateVariantLabel(attrs);
            const label = v.name && v.name !== "Default" ? v.name : fallbackLabel;
            const price = v.price ?? productBasePrice;
            const isSelected = v.id === selectedId;
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => selectVariant(v.id)}
                className={[
                  "focus:ring-brand-purple flex w-full cursor-pointer items-center justify-between rounded-lg p-3 text-left transition-all focus:ring-2 focus:outline-none",
                  isSelected
                    ? "ring-brand-purple bg-brand-purple/5 shadow-md ring-2"
                    : "ring-brand-purple/15 hover:ring-brand-purple/40 hover:bg-brand-cream/40 ring-1 hover:shadow-sm",
                ].join(" ")}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={[
                      "flex h-5 w-5 items-center justify-center rounded-full transition-colors",
                      isSelected
                        ? "bg-brand-purple text-white"
                        : "ring-brand-purple/30 ring-1",
                    ].join(" ")}
                    aria-hidden
                  >
                    {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span
                    className={[
                      "text-sm font-semibold",
                      isSelected ? "text-brand-purple-dark" : "text-brand-purple-dark/85",
                    ].join(" ")}
                  >
                    {label}
                  </span>
                </span>
                <span
                  className={[
                    "text-sm font-bold tabular-nums",
                    isSelected ? "text-brand-purple-dark" : "text-brand-purple-dark/75",
                  ].join(" ")}
                >
                  {formatCOP(price)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Modo multi-dimension: chips por dimensión + card de Precio ──
  const currentPrice = selectedVariant?.price ?? productBasePrice;

  // Detectar si el catálogo tiene combinaciones faltantes (matriz
  // incompleta). Si todos los variants posibles existen, no mostrar el
  // microcopy explicativo (innecesario). El cálculo es barato porque
  // dimensions ya está memoizado.
  const cartesianTotal = dimensions.reduce((acc, d) => acc * d.values.length, 1);
  const hasUnavailable = variants.length < cartesianTotal;

  return (
    <div className="mb-4 space-y-4">
      {dimensions.map((dim) => {
        // Stepper de cantidad (Lucy 2026-07-22): solo si la dimensión es de cantidad
        // y sus valores son 1..N contiguos (fotoimanes/separadores 1–6). Sets no
        // contiguos (polaroid 6/9/12/20) siguen con chips, más abajo.
        const useStepper = QUANTITY_DIM_KEYS.has(dim.key) && isContiguousFromOne(dim.values);
        if (useStepper) {
          const maxQty = dim.values.length; // values = ["1",…,"N"] contiguos
          const parsed = Number.parseInt(currentValues[dim.key] ?? "", 10);
          const qty = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), maxQty) : 1;
          // La variante de la cantidad actual (misma combinación de las otras
          // dimensiones) da el total de la línea; el c/u deriva de él.
          const qtyVariant =
            findExactVariant(dim.key, String(qty)) ??
            variants.find(
              (v) =>
                String(
                  parseVariantAttributes(v.attributes)[dim.key as keyof ProductVariantAttributes],
                ) === String(qty),
            );
          const totalPrice = qtyVariant?.price ?? productBasePrice;
          const unitPrice = Math.round(totalPrice / qty);
          const canDecrease = qty > 1 && isCombinationAvailable(dim.key, String(qty - 1));
          const canIncrease = qty < maxQty && isCombinationAvailable(dim.key, String(qty + 1));
          return (
            <div key={dim.key}>
              <p className="text-brand-purple-dark/70 mb-2 text-xs font-bold tracking-wider uppercase">
                {dim.label}
              </p>
              <div
                role="group"
                aria-label={dim.label}
                className="flex flex-wrap items-center gap-x-3 gap-y-2"
              >
                <div className="ring-brand-purple/15 inline-flex items-center rounded-lg bg-white ring-1">
                  <button
                    type="button"
                    aria-label="Disminuir cantidad"
                    disabled={!canDecrease}
                    onClick={() => canDecrease && handleSelectValue(dim.key, String(qty - 1))}
                    className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-10 w-10 cursor-pointer items-center justify-center rounded-l-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <Minus className="h-4 w-4" aria-hidden />
                  </button>
                  <span
                    aria-live="polite"
                    className="text-brand-purple-dark min-w-20 text-center text-sm font-bold tabular-nums"
                  >
                    {qty} {qty === 1 ? "unidad" : "unidades"}
                  </span>
                  <button
                    type="button"
                    aria-label="Aumentar cantidad"
                    disabled={!canIncrease}
                    onClick={() => canIncrease && handleSelectValue(dim.key, String(qty + 1))}
                    className="text-brand-purple-dark hover:bg-brand-purple/5 focus:ring-brand-turquoise disabled:text-brand-muted flex h-10 w-10 cursor-pointer items-center justify-center rounded-r-lg transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <span className="text-brand-muted text-xs tabular-nums">
                  {formatCOP(unitPrice)} c/u
                </span>
                <span className="text-brand-purple-dark text-sm font-bold tabular-nums">
                  Total: {formatCOP(totalPrice)}
                </span>
              </div>
            </div>
          );
        }
        return (
          <div key={dim.key}>
            <p className="text-brand-purple-dark/70 mb-2 text-xs font-bold tracking-wider uppercase">
              {dim.label}
            </p>
            <div role="group" aria-label={dim.label} className="flex flex-wrap gap-2">
              {dim.values.map((value) => {
                // Dimensión de 1 solo valor (Tamaño fijo, Lucy 2026-07-22):
                // chip único PRESELECCIONADO y no clicable — es un dato del
                // producto, no una opción. Mañana, al acoplar más tamaños,
                // los chips se vuelven interactivos solos (>1 valor).
                const isSingle = dim.values.length === 1;
                const isSelected = isSingle || currentValues[dim.key] === value;
                const available = isSingle || isSelected || isCombinationAvailable(dim.key, value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isSelected}
                    aria-disabled={!available || isSingle}
                    disabled={!available || isSingle}
                    onClick={() => !isSingle && available && handleSelectValue(dim.key, value)}
                    title={
                      !available
                        ? `No disponible en esta combinación. Cambia primero otra opción para acceder a "${formatDimensionValue(dim.key, value)}".`
                        : undefined
                    }
                    className={[
                      "focus:ring-brand-turquoise rounded-lg px-3 py-2 text-sm font-semibold transition-all focus:ring-2 focus:outline-none",
                      isSelected
                        ? isSingle
                          ? "bg-brand-purple cursor-default text-white shadow-md"
                          : "bg-brand-purple cursor-pointer text-white shadow-md"
                        : available
                          ? "ring-brand-purple/20 text-brand-purple-dark hover:ring-brand-purple/50 hover:bg-brand-cream/50 cursor-pointer bg-white ring-1"
                          : "ring-brand-purple/10 text-brand-muted bg-brand-cream/40 cursor-not-allowed ring-1",
                    ].join(" ")}
                  >
                    {formatDimensionValue(dim.key, value)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Microcopy: explica los chips atenuados cuando hay combinaciones
          imposibles en el catálogo. No mostrar si la matriz está completa. */}
      {hasUnavailable && (
        <p className="text-brand-muted text-[11px]">
          Las opciones atenuadas no están disponibles en esta combinación. Cambia primero la otra
          opción para acceder a ellas.
        </p>
      )}

      {/* Precio del variant seleccionado, prominente. Refleja inmediato
          porque depende de selectedVariant (local). El router.replace
          en background sincroniza la URL y el RSC silenciosamente.
          #14 — se oculta en por-ficha: el total lo muestra el NamePricePicker.
          Ola 18 — misma familia visual que la lista single-dim (bg-purple/5 + ring purple). */}
      {!perTile && (
        <div className="bg-brand-purple/5 ring-brand-purple/15 flex items-center justify-between rounded-lg p-3 ring-1">
          <span className="text-brand-purple-dark/70 text-xs font-bold tracking-wider uppercase">
            Precio
          </span>
          <span className="text-brand-purple-dark text-xl font-bold tabular-nums">
            {formatCOP(currentPrice)}
          </span>
        </div>
      )}
    </div>
  );
}
