/*
 * Unit tests — self-heal de CART_IDENTITY_MISMATCH en las actions del carrito.
 *
 * Cuando la cookie cart_session apunta a un carrito de OTRO customer
 * (dispositivo compartido / cookie no rotada al cambiar de cuenta), el service
 * lanza CartError("CART_IDENTITY_MISMATCH"). Las actions lo capturan, rotan la
 * sesión (rotateCartSession → cookie nueva) y reintentan UNA vez con carrito
 * nuevo; el carrito ajeno queda intacto en DB. Si el retry también falla, el
 * cliente ve un copy específico en vez del genérico "Algo salió mal".
 *
 * Estrategia: service/auth/session/logger mockeados (patrón
 * app/admin/(panel)/carritos/actions.test.ts). CartError se redefine en el
 * mock (misma forma que la clase real) para que el instanceof de la action
 * funcione sin cargar @/lib/db.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  MockCartError,
  cartService,
  personalizationService,
  authLib,
  cartSessionLib,
  mockLogger,
  revalidatePathSpy,
  redirectSpy,
} = vi.hoisted(() => {
  class MockCartError extends Error {
    constructor(
      public code: string,
      public detail?: string,
    ) {
      super(detail ?? code);
      this.name = "CartError";
    }
  }
  return {
    MockCartError,
    cartService: {
      addProductToCart: vi.fn(),
      addPersonalizedToCart: vi.fn(),
      removeCartItem: vi.fn(),
      updateCartItemQty: vi.fn(),
    },
    personalizationService: { getOwnedDesign: vi.fn() },
    authLib: {
      getCurrentCustomer: vi.fn(async (): Promise<{ customer: { id: string } } | null> => null),
    },
    cartSessionLib: {
      getOrCreateCartSession: vi.fn(async () => "sess_old"),
      peekCartSession: vi.fn(async () => "sess_old"),
      rotateCartSession: vi.fn(async () => "sess_new"),
    },
    mockLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    revalidatePathSpy: vi.fn(),
    // Next lanza redirect() con message EXACTO "NEXT_REDIRECT" (la action lo
    // usa como guard en el catch); el spy graba la URL y lanza igual.
    redirectSpy: vi.fn((_url: string) => {
      throw new Error("NEXT_REDIRECT");
    }),
  };
});

vi.mock("@/features/cart/service", () => ({
  CartError: MockCartError,
  addProductToCart: cartService.addProductToCart,
  addPersonalizedToCart: cartService.addPersonalizedToCart,
  removeCartItem: cartService.removeCartItem,
  updateCartItemQty: cartService.updateCartItemQty,
}));
vi.mock("@/features/personalization/service", () => personalizationService);
vi.mock("@/lib/auth", () => authLib);
vi.mock("@/lib/cart-session", () => cartSessionLib);
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathSpy }));
vi.mock("next/navigation", () => ({ redirect: redirectSpy }));

import { addPersonalizedToCartAction, addToCartAction } from "./actions";

const READY_DESIGN = { id: "design_1", status: "READY" };

function addForm(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("slug", "iman-nevera");
  fd.set("qty", "1");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  cartSessionLib.getOrCreateCartSession.mockResolvedValue("sess_old");
  cartSessionLib.rotateCartSession.mockResolvedValue("sess_new");
  personalizationService.getOwnedDesign.mockResolvedValue(READY_DESIGN);
  redirectSpy.mockImplementation((_url: string) => {
    throw new Error("NEXT_REDIRECT");
  });
});

describe("addToCartAction — self-heal de CART_IDENTITY_MISMATCH", () => {
  it("rota la sesión y reintenta UNA vez: éxito con el carrito nuevo", async () => {
    authLib.getCurrentCustomer.mockResolvedValue({ customer: { id: "cust_1" } });
    cartService.addProductToCart
      .mockRejectedValueOnce(new MockCartError("CART_IDENTITY_MISMATCH"))
      .mockResolvedValueOnce({ itemCount: 1 });

    await expect(addToCartAction(addForm())).rejects.toThrow("NEXT_REDIRECT");
    // cartQty/cartVariant: handoff del tracker GA4 de add_to_cart (E09).
    expect(redirectSpy).toHaveBeenCalledWith("/carrito?added=1&cartQty=1");

    expect(cartSessionLib.rotateCartSession).toHaveBeenCalledTimes(1);
    expect(cartService.addProductToCart).toHaveBeenCalledTimes(2);
    expect(cartService.addProductToCart).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sessionId: "sess_old", customerId: "cust_1" }),
    );
    expect(cartService.addProductToCart).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sessionId: "sess_new", customerId: "cust_1" }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "cart.identity_mismatch.healed",
        oldSessionId: "sess_old",
        newSessionId: "sess_new",
        customerId: "cust_1",
      }),
    );
  });

  it("si el retry también lanza CART_IDENTITY_MISMATCH → copy específico, no el genérico", async () => {
    cartService.addProductToCart.mockRejectedValue(new MockCartError("CART_IDENTITY_MISMATCH"));

    await expect(addToCartAction(addForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectSpy).toHaveBeenCalledWith(
      `/carrito?error=${encodeURIComponent("Tuvimos un problema con tu carrito. Recárgalo e inténtalo de nuevo.")}`,
    );

    // Un solo retry: exactamente 2 intentos contra el service.
    expect(cartSessionLib.rotateCartSession).toHaveBeenCalledTimes(1);
    expect(cartService.addProductToCart).toHaveBeenCalledTimes(2);
  });

  it("otros CartError NO rotan la sesión ni reintentan", async () => {
    cartService.addProductToCart.mockRejectedValue(new MockCartError("PRODUCT_NOT_FOUND"));

    await expect(addToCartAction(addForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectSpy).toHaveBeenCalledWith(
      `/carrito?error=${encodeURIComponent("Este producto ya no está disponible.")}`,
    );

    expect(cartSessionLib.rotateCartSession).not.toHaveBeenCalled();
    expect(cartService.addProductToCart).toHaveBeenCalledTimes(1);
  });
});

describe("addPersonalizedToCartAction — self-heal de CART_IDENTITY_MISMATCH", () => {
  it("rota la sesión y reintenta UNA vez: devuelve ok con el carrito nuevo", async () => {
    authLib.getCurrentCustomer.mockResolvedValue({ customer: { id: "cust_1" } });
    cartService.addPersonalizedToCart
      .mockRejectedValueOnce(new MockCartError("CART_IDENTITY_MISMATCH"))
      .mockResolvedValueOnce({ itemCount: 2 });

    const res = await addPersonalizedToCartAction({ designId: "design_1", qty: 1 });

    expect(res).toEqual({ ok: true, itemCount: 2 });
    expect(cartSessionLib.rotateCartSession).toHaveBeenCalledTimes(1);
    expect(cartService.addPersonalizedToCart).toHaveBeenCalledTimes(2);
    expect(cartService.addPersonalizedToCart).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sessionId: "sess_new", customerId: "cust_1" }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "cart.identity_mismatch.healed",
        oldSessionId: "sess_old",
        newSessionId: "sess_new",
        customerId: "cust_1",
      }),
    );
  });

  it("si el retry también falla → INTERNAL con el copy específico de carrito", async () => {
    cartService.addPersonalizedToCart.mockRejectedValue(
      new MockCartError("CART_IDENTITY_MISMATCH"),
    );

    const res = await addPersonalizedToCartAction({ designId: "design_1", qty: 1 });

    expect(res).toEqual({
      ok: false,
      code: "INTERNAL",
      message: "Tuvimos un problema con tu carrito. Recárgalo e inténtalo de nuevo.",
    });
    expect(cartSessionLib.rotateCartSession).toHaveBeenCalledTimes(1);
    expect(cartService.addPersonalizedToCart).toHaveBeenCalledTimes(2);
  });

  it("otros errores NO rotan la sesión ni reintentan", async () => {
    cartService.addPersonalizedToCart.mockRejectedValue(new Error("db down"));

    const res = await addPersonalizedToCartAction({ designId: "design_1", qty: 1 });

    expect(res).toEqual({ ok: false, code: "INTERNAL", message: "Algo salió mal. Reintenta." });
    expect(cartSessionLib.rotateCartSession).not.toHaveBeenCalled();
    expect(cartService.addPersonalizedToCart).toHaveBeenCalledTimes(1);
  });
});
