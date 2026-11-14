"use client";

import { createCouponAction } from "./actions";
import { CouponForm } from "./coupon-form";
import type { SlugOption } from "./slug-restriction-select";

export function CreateCouponForm({
  categories,
  products,
  defaultValidFrom,
  defaultValidTo,
}: {
  /** Categorías del catálogo (deletedAt null) y productos activos — los fetchea
   *  la página server y alimentan los multi-select de restricciones. */
  categories: SlugOption[];
  products: SlugOption[];
  defaultValidFrom: string;
  defaultValidTo: string;
}) {
  return (
    <CouponForm
      mode="create"
      action={createCouponAction}
      categories={categories}
      products={products}
      defaultValidFrom={defaultValidFrom}
      defaultValidTo={defaultValidTo}
    />
  );
}
