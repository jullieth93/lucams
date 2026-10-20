"use client";

import { createCouponAction } from "./actions";
import { CouponForm } from "./coupon-form";
import type { SlugOption } from "./slug-restriction-select";

export function CreateCouponForm({
  categories,
  products,
}: {
  /** Categorías del catálogo (deletedAt null) y productos activos — los fetchea
   *  la página server y alimentan los multi-select de restricciones. */
  categories: SlugOption[];
  products: SlugOption[];
}) {
  return (
    <CouponForm
      mode="create"
      action={createCouponAction}
      categories={categories}
      products={products}
    />
  );
}
