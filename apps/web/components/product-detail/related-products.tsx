/*
 * <RelatedProducts> — sección "También te puede gustar" al final
 * del PDP. Lista server-side de productos misma categoría (o featured
 * si la categoría tiene pocos). Reusa <ProductCard>.
 */

import { ProductCard } from "@/components/product-card";
import { CmsText } from "@/components/cms/cms-text";
import type { StorefrontProductCard } from "@/features/products/public-service";

export function RelatedProducts({ products }: { products: StorefrontProductCard[] }) {
  if (products.length === 0) return null;
  return (
    <section className="mt-16">
      <h2 className="font-display text-brand-purple-dark mb-6 text-2xl sm:text-3xl">
        <CmsText blockKey="pdp.related.heading" fallback="También te puede gustar" />
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
