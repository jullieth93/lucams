"use client";

import { updateCouponAction } from "../actions";
import { CouponForm, type EditableCoupon } from "../coupon-form";
import type { SlugOption } from "../slug-restriction-select";

/** Edición o consulta de un cupón existente — comparte formulario con crear (`../coupon-form.tsx`). */
export function EditCouponForm({
  coupon,
  categories,
  products,
  defaultValidFrom,
  defaultValidTo,
  readOnly = false,
}: {
  coupon: EditableCoupon;
  categories: SlugOption[];
  products: SlugOption[];
  defaultValidFrom: string;
  defaultValidTo: string;
  readOnly?: boolean;
}) {
  return (
    <CouponForm
      mode="edit"
      action={updateCouponAction}
      coupon={coupon}
      categories={categories}
      products={products}
      defaultValidFrom={defaultValidFrom}
      defaultValidTo={defaultValidTo}
      readOnly={readOnly}
    />
  );
}
