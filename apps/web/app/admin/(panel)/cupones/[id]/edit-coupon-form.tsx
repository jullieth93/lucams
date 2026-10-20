"use client";

import { updateCouponAction } from "../actions";
import { CouponForm, type EditableCoupon } from "../coupon-form";
import type { SlugOption } from "../slug-restriction-select";

/** Edición de un cupón existente — el formulario es compartido con crear (../coupon-form.tsx). */
export function EditCouponForm({
  coupon,
  categories,
  products,
}: {
  coupon: EditableCoupon;
  /** Categorías del catálogo (deletedAt null) y productos activos — alimentan
   *  los multi-select de restricciones (mismos datos que el form de crear). */
  categories: SlugOption[];
  products: SlugOption[];
}) {
  return (
    <CouponForm
      mode="edit"
      action={updateCouponAction}
      coupon={coupon}
      categories={categories}
      products={products}
    />
  );
}
