"use client";

/*
 * Botón de wishlist/favoritos (corazón). Toggle optimista contra toggleWishlistAction. Si no hay
 * sesión, lleva a /login (los favoritos son de clientes logueados). Auditoría 2026-07-13.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toggleWishlistAction } from "@/features/wishlist/actions";

export function WishlistButton({
  productId,
  initialWishlisted,
  size = "md",
  className = "",
}: {
  productId: string;
  initialWishlisted: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const router = useRouter();
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [pending, startTransition] = useTransition();
  const dim = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !wishlisted;
    setWishlisted(next); // optimista
    startTransition(async () => {
      const res = await toggleWishlistAction({ productId });
      if (!res.ok) {
        setWishlisted(!next); // revertir
        if (res.code === "AUTH") router.push("/login?next=" + encodeURIComponent(location.pathname));
      } else {
        setWishlisted(res.wishlisted);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={wishlisted}
      aria-label={wishlisted ? "Quitar de favoritos" : "Guardar en favoritos"}
      className={`inline-flex items-center justify-center rounded-full transition disabled:opacity-60 ${className}`}
    >
      <Heart
        className={`${dim} transition ${
          wishlisted ? "fill-brand-pink text-brand-pink-ink" : "text-brand-muted"
        }`}
      />
    </button>
  );
}
