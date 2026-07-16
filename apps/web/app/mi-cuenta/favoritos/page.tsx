/*
 * /mi-cuenta/favoritos — productos que el cliente guardó (wishlist). Aislamiento por customerId.
 * Palanca de ingreso (auditoría 2026-07-13).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Heart } from "lucide-react";
import { getCurrentCustomer } from "@/lib/auth";
import { listWishlist } from "@/features/wishlist/service";
import { ProductCard } from "@/components/product-card";

export const metadata: Metadata = {
  title: "Mis favoritos",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FavoritosPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta/favoritos");

  const products = await listWishlist(session.customer.id);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/mi-cuenta"
        className="text-brand-muted hover:text-brand-purple-dark mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="h-4 w-4" /> Mi cuenta
      </Link>

      <h1 className="font-display text-brand-purple-dark mb-1 text-2xl">Mis favoritos</h1>
      <p className="text-brand-muted mb-6 text-sm">
        {products.length > 0
          ? `${products.length} ${products.length === 1 ? "producto guardado" : "productos guardados"}.`
          : "Guarda los productos que te encanten para encontrarlos rápido."}
      </p>

      {products.length === 0 ? (
        <div className="border-brand-purple/15 flex flex-col items-center gap-3 rounded-xl border border-dashed bg-white px-6 py-12 text-center">
          <Heart className="text-brand-pink/50 h-10 w-10" />
          <p className="text-brand-purple-dark font-semibold">Aún no tienes favoritos</p>
          <p className="text-brand-muted max-w-sm text-sm">
            Toca el corazón en cualquier producto para guardarlo aquí.
          </p>
          <Link
            href="/productos"
            className="bg-brand-purple hover:bg-brand-purple-dark mt-1 rounded-md px-4 py-2 text-sm font-semibold text-white"
          >
            Ver el catálogo
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} wishlisted={true} />
          ))}
        </div>
      )}
    </div>
  );
}
