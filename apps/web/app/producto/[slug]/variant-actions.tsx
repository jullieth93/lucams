"use client";

/*
 * Estado compartido de la variante elegida en el buy-box (auditoría v3 · H12).
 *
 * Antes cada acción (CTA al Estudio, input oculto del carrito, precio) se renderizaba en el SERVER a
 * partir de `?variant=` en la URL, y el VariantSelector solo actualizaba su estado LOCAL + hacía
 * router.replace. Ese router.replace no refresca la UI al instante (la URL/RSC llegan tarde o no
 * llegan) → quedaba una ventana en la que el cliente podía personalizar/agregar la variante
 * EQUIVOCADA. Ahora un Context es la única fuente de verdad en cliente: el selector lo actualiza y
 * las acciones lo leen → todo cambia en el mismo paint. La URL se sigue sincronizando como
 * side-effect (deep-link compartible), pero ya no es de lo que depende la UI.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createContext, useCallback, useContext, useState, useTransition } from "react";
import { SubmitButton } from "@/components/admin/submit-button";

type SelectedVariantCtx = {
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  /**
   * Copias (CartItem.qty 1..99) elegidas en el stepper "Unidades" de la PDP. Única fuente de
   * verdad de la cantidad en la ficha (Lucy 2026-09-03): la rama de compra directa la manda
   * como `qty` del form y la rama personalizable la lleva al Estudio como `?copies=N` (el
   * stepper "Copias" de la modal de confirmación arranca pre-cargado con ella).
   */
  copies: number;
  setCopies: (n: number) => void;
};

const Ctx = createContext<SelectedVariantCtx | null>(null);

export function SelectedVariantProvider({
  variantIds,
  initialId,
  children,
}: {
  variantIds: string[];
  initialId: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Init una sola vez: ?variant= válido de la URL (deep-link) o la primera variante.
  const [selectedId, setSelectedIdState] = useState<string | null>(() => {
    const fromUrl = searchParams.get("variant");
    if (fromUrl && variantIds.includes(fromUrl)) return fromUrl;
    return initialId;
  });
  // Copias del stepper "Unidades" de la PDP (1..99, mismo tope de AddToCartSchema).
  const [copies, setCopiesState] = useState(1);

  const setSelectedId = useCallback(
    (id: string) => {
      setSelectedIdState(id); // fuente de verdad en cliente → UI cambia al instante
      // Side-effect: sincronizar la URL para que el link sea compartible (deep-link). No bloquea el
      // paint (transition) y la UI NO depende de que esto complete.
      const params = new URLSearchParams(window.location.search);
      params.set("variant", id);
      startTransition(() => {
        router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [router],
  );

  const setCopies = useCallback((n: number) => {
    setCopiesState(Math.min(99, Math.max(1, Math.trunc(n) || 1)));
  }, []);

  return (
    <Ctx.Provider value={{ selectedId, setSelectedId, copies, setCopies }}>{children}</Ctx.Provider>
  );
}

/** Lee el estado compartido. Fuera del provider devuelve un no-op seguro (fallback). */
export function useSelectedVariant(): SelectedVariantCtx {
  return (
    useContext(Ctx) ?? { selectedId: null, setSelectedId: () => {}, copies: 1, setCopies: () => {} }
  );
}

/** CTA "Personalizar" al Estudio, con el ?variant= SIEMPRE en sync con el selector. */
export function EstudioCtaLink({ slug, ctaNoun }: { slug: string; ctaNoun: string }) {
  const { selectedId, copies } = useSelectedVariant();
  // UX selección guiada (Lucy 2026-08-12): sin variante elegida el Estudio no
  // puede abrir (photoSlots/precio dependen de la variante) → CTA deshabilitado
  // con la instrucción clara en vez de un default invisible.
  if (!selectedId) {
    return (
      <>
        <span
          aria-disabled="true"
          className="bg-brand-purple/60 inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-md px-6 text-base font-semibold text-white shadow-lg"
        >
          <Sparkles className="h-5 w-5" />
          Personalizar {ctaNoun} →
        </span>
        <p className="text-brand-purple-dark text-center text-xs font-semibold">
          Elige las opciones primero ↑
        </p>
      </>
    );
  }
  // Las copias elegidas en la PDP viajan como ?copies=N: la modal de confirmación
  // del Estudio arranca con ese valor pre-cargado (se puede ajustar ahí mismo).
  const copiesQS = copies > 1 ? `&copies=${copies}` : "";
  return (
    <>
      <Link
        href={`/estudio/${slug}?variant=${selectedId}${copiesQS}`}
        className="bg-brand-purple hover:bg-brand-purple-dark shadow-brand-purple/30 hover:shadow-brand-purple/40 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md px-6 text-base font-semibold text-white shadow-lg transition-all hover:shadow-xl"
      >
        <Sparkles className="h-5 w-5" />
        Personalizar {ctaNoun} →
      </Link>
      <p className="text-brand-muted text-center text-xs">
        Diseña en vivo • Vista previa al instante
      </p>
    </>
  );
}

/** Input oculto `variantId` para el form de agregar al carrito, en sync con el selector. */
export function CartVariantIdInput() {
  const { selectedId } = useSelectedVariant();
  if (!selectedId) return null;
  return <input type="hidden" name="variantId" value={selectedId} />;
}

/**
 * Botón "Añadir al carrito" reactivo al STOCK de la variante elegida (Fase 1 — stock
 * por variante): si la selección actual está agotada, el botón se bloquea con el texto
 * "Agotado" (mismo término del badge de las cards). El gate global de producto agotado
 * (BackInStockButton) sigue en page.tsx para cuando TODAS las variantes están en 0.
 */
export function CartSubmitButton({
  stockByVariantId,
  className,
}: {
  stockByVariantId: Record<string, number>;
  className?: string;
}) {
  const { selectedId } = useSelectedVariant();
  const stock = selectedId ? stockByVariantId[selectedId] : undefined;
  const soldOut = stock !== undefined && stock <= 0;
  // UX selección guiada (2026-08-12): sin variante elegida el botón pide la
  // elección en vez de agregar un default invisible al carrito.
  const noSelection = !selectedId;
  return (
    <SubmitButton
      label={noSelection ? "Elige tus opciones" : soldOut ? "Agotado" : "Añadir al carrito"}
      pendingLabel="Añadiendo…"
      size="lg"
      disabled={noSelection || soldOut}
      className={className}
    />
  );
}
