// @vitest-environment jsdom
/*
 * Test de componente — bloque de incentivo "crea tu cuenta y gana puntos"
 * para INVITADOS en OrderSummary (2026-10-26 — decisión owner).
 *
 * El gate real (invitado / programa activo / catálogo) vive en el service
 * (getGuestLoyaltyIncentive — ver features/checkout/service-guest-loyalty.test.ts);
 * acá se prueba el render: interpolación de {puntos}/{valor}, microcopy de
 * referidos solo cuando aplica, CTA a /registro y que SIN la prop no se
 * renderiza nada (cliente logueado).
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { OrderSummary } from "./order-summary";
import { DEFAULT_CHECKOUT_TEXTS } from "../checkout-texts";
import type { CartDetail } from "@/features/cart/service";

afterEach(cleanup);

const CART = {
  cartId: "cart_1",
  sessionId: "sess_1",
  itemCount: 1,
  subtotal: 5_990_000,
  items: [
    {
      itemId: "item_1",
      variantId: "v1",
      productSlug: "iman",
      productName: "Imán Nevera",
      variantName: "Grande",
      variantBreakdown: [],
      qty: 1,
      inventoryUnits: 1,
      unitPrice: 5_990_000,
      lineTotal: 5_990_000,
      imageUrl: null,
      designPreviewUrl: null,
      isPersonalizable: false,
      borderNote: null,
    },
  ],
} as unknown as CartDetail;

const INCENTIVE = {
  earnPreviewPoints: 59,
  valueCents: 59_000,
  referralsEnabled: true,
};

function renderSummary(props?: {
  guestIncentive?: typeof INCENTIVE | null;
  loyaltyEarnPreview?: number;
}) {
  return render(
    <OrderSummary
      cart={CART}
      texts={DEFAULT_CHECKOUT_TEXTS.summary}
      guestTexts={DEFAULT_CHECKOUT_TEXTS.guestLoyalty}
      guestIncentive={props?.guestIncentive}
      loyaltyEarnPreview={props?.loyaltyEarnPreview}
    />,
  );
}

describe("OrderSummary — incentivo de cuenta para invitados", () => {
  it("invitado con incentivo: muestra puntos, equivalencia en pesos, microcopy de referidos y CTA a /registro", () => {
    renderSummary({ guestIncentive: INCENTIVE });

    expect(screen.getByText(DEFAULT_CHECKOUT_TEXTS.guestLoyalty.title)).toBeInTheDocument();
    // Interpolación: 59 puntos → $590 (formatCOP puede usar espacio fino).
    expect(screen.getByText(/59 Puntos Lucams/)).toBeInTheDocument();
    expect(screen.getByText(/\$\s*590/)).toBeInTheDocument();
    expect(screen.getByText(DEFAULT_CHECKOUT_TEXTS.guestLoyalty.referralNote)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: DEFAULT_CHECKOUT_TEXTS.guestLoyalty.cta });
    expect(cta).toHaveAttribute("href", "/registro");
  });

  it("sin programa de referidos: el microcopy de invitar amigos NO aparece", () => {
    renderSummary({ guestIncentive: { ...INCENTIVE, referralsEnabled: false } });
    expect(
      screen.queryByText(DEFAULT_CHECKOUT_TEXTS.guestLoyalty.referralNote),
    ).not.toBeInTheDocument();
  });

  it("sin incentivo (cliente logueado / programa apagado): no se renderiza el bloque", () => {
    renderSummary({ guestIncentive: null, loyaltyEarnPreview: 59 });
    expect(screen.queryByText(DEFAULT_CHECKOUT_TEXTS.guestLoyalty.title)).not.toBeInTheDocument();
    // …y el preview normal de puntos del cliente con sesión sigue intacto.
    expect(screen.getByText(/Ganarás 59 Puntos Lucams/)).toBeInTheDocument();
  });
});
