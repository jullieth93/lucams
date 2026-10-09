"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Power, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { purgeProductAction, restoreProductAction, toggleProductActiveAction } from "./actions";

/** Botón submit que muestra spinner + se deshabilita mientras procesa. */
function ActionButton({
  className,
  title,
  icon,
  label,
}: {
  className: string;
  title: string;
  icon: ReactNode;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Hint content={title}>
      {/* span wrapper: el button disabled no recibe hover/foco, el span sí. */}
      <span tabIndex={pending ? 0 : undefined} className="inline-flex">
        <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
          {label}
        </button>
      </span>
    </Hint>
  );
}

/** Botón ELIMINAR PERMANENTE (papelera) con confirmación fuerte: escribir
 * ELIMINAR — patrón de purgeGalleryImageAction (prediseñados) y mi-cuenta/eliminar. */
function PurgeProductButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPurge = async () => {
    const typed = window.prompt(
      `Esta acción es IRREVERSIBLE: «${productName}» y sus imágenes se borrarán para siempre (no se puede restaurar).\n\nEscribe ELIMINAR para confirmar:`,
    );
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== "ELIMINAR") {
      setError("No escribiste ELIMINAR — el producto sigue archivado, no se borró nada.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("id", productId);
      const res = await purgeProductAction(fd);
      if (res?.error) {
        setError(res.error);
      } else {
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <Hint content="Eliminar permanentemente (irreversible)">
        <span className="inline-flex">
          <button
            type="button"
            onClick={onPurge}
            disabled={pending}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Eliminar
          </button>
        </span>
      </Hint>
      {error && <span className="max-w-56 text-xs text-red-600">{error}</span>}
    </span>
  );
}

/**
 * Botones rápidos por fila: toggle activar/desactivar (si no archivado) +
 * restaurar (si archivado). Sin confirm modal — son acciones reversibles.
 */
export function ProductQuickActions({
  productId,
  productName,
  isActive,
  isArchived,
}: {
  productId: string;
  productName: string;
  isActive: boolean;
  isArchived: boolean;
}) {
  // Hotfix P0-9: touch targets antes eran ~22-24px (text-[10px] + px-2 py-1
  // + icon h-3 w-3) — muy lejos del estándar 44px y desproporcionados con
  // el botón "Editar" hermano. Ahora h-9 (~36px) + text-xs + icon h-3.5 +
  // padding px-3 — consistente con CompactStockEditor y resto del admin.
  if (isArchived) {
    return (
      <span className="inline-flex items-center gap-2">
        <form action={restoreProductAction} className="inline">
          <input type="hidden" name="id" value={productId} />
          <ActionButton
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            title="Restaurar de la papelera (queda pausado)"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            label="Restaurar"
          />
        </form>
        <PurgeProductButton productId={productId} productName={productName} />
      </span>
    );
  }

  return (
    <form action={toggleProductActiveAction} className="inline">
      <input type="hidden" name="id" value={productId} />
      <input type="hidden" name="isActive" value={isActive ? "false" : "true"} />
      <ActionButton
        className={
          isActive
            ? "border-brand-purple/20 text-brand-purple-dark/80 hover:bg-brand-purple/5 inline-flex h-9 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-semibold"
            : "inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
        }
        title={isActive ? "Ocultar de tu tienda" : "Mostrar en tu tienda"}
        icon={<Power className="h-3.5 w-3.5" />}
        label={isActive ? "Pausar" : "Activar"}
      />
    </form>
  );
}
