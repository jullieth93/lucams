"use client";

import { updateCouponAction } from "../actions";
import { CouponForm, type EditableCoupon } from "../coupon-form";
import type { SlugOption } from "../slug-restriction-select";

/** Edición o consulta de un cupón existente — comparte formulario con crear (`../coupon-form.tsx`). */
export function EditCouponForm({
  coupon,
  categories,
  products,
  readOnly = false,
}: {
  coupon: EditableCoupon;
  categories: SlugOption[];
  products: SlugOption[];
  readOnly?: boolean;
}) {
  return (
    <CouponForm
      mode="edit"
      action={updateCouponAction}
      coupon={coupon}
      categories={categories}
      products={products}
      readOnly={readOnly}
    />
  );
}
