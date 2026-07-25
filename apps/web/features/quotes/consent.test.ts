/*
 * Autorización de tratamiento de datos en la cotización (Ley 1581 art. 9).
 *
 * Regresión de la auditoría 2026-07-21 (hallazgo A1): la cotización es el ÚNICO flujo que
 * recolecta PII en modo catálogo (nombre, WhatsApp, email, ciudad) y lo hacía con un aviso
 * PASIVO en el pie del formulario — sin casilla, sin rechazo si no se marcaba y sin ninguna fila
 * que probara la autorización. La política de privacidad, en cambio, sí declaraba conservar esa
 * prueba. Ante un requerimiento de la SIC no había nada que mostrar.
 *
 * Se prueban las dos mitades del arreglo:
 *   1. `buildQuoteConsentRow` arma la fila anclada al móvil (el email es opcional en cotizaciones).
 *   2. `createQuoteFromCart` la escribe en la MISMA transacción que la Quote y sella la prueba
 *      sobre el propio registro (`dataConsentAt` / `dataConsentVersion`).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const consentCreate = vi.hoisted(() => vi.fn());
const quoteCreate = vi.hoisted(() => vi.fn());
const getSettingValue = vi.hoisted(() =>
  vi.fn(async (_key: string, fallback: string): Promise<string> => fallback),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/cms", () => ({
  getSettingValue: (key: string, fallback: string) => getSettingValue(key, fallback),
}));
vi.mock("@/features/orders/service", () => ({ clearCartAfterPaid: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    // La transacción ejecuta el callback con un `tx` que expone los mismos modelos.
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ quote: { create: quoteCreate }, consent: { create: consentCreate } }),
  },
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));

const getCartDetail = vi.hoisted(() => vi.fn());
vi.mock("@/features/cart/service", () => ({ getCartDetail }));

const CART = {
  cartId: "cart_1",
  subtotal: 4500000,
  items: [
    {
      productId: "p1",
      variantId: "v1",
      designId: null,
      productName: "Set fotoimanes",
      variantName: "Default",
      unitPrice: 2250000,
      qty: 2,
      designPreviewUrl: null,
    },
  ],
};

const INPUT = {
  customerName: "Lucía Pérez",
  customerWhatsapp: "3001234567",
  city: "Bogotá",
  department: "Cundinamarca",
};

beforeEach(() => {
  vi.clearAllMocks();
  getCartDetail.mockResolvedValue(CART);
});

describe("buildQuoteConsentRow", () => {
  it("ancla la autorización al MÓVIL cuando no hay email (caso típico de cotización)", async () => {
    const { buildQuoteConsentRow } = await import("@/features/consent/service");

    const { row, version } = await buildQuoteConsentRow({
      phone: "3001234567",
      email: null,
      ip: "1.2.3.4",
      userAgent: "Mozilla/5.0",
    });

    expect(row.phone).toBe("3001234567");
    expect(row.email).toBeNull();
    expect(row.scope).toBe("HABEAS_DATA");
    expect(row.accepted).toBe(true);
    expect(row.ipAddress).toBe("1.2.3.4");
    expect(row.userAgent).toBe("Mozilla/5.0");
    expect(version).toBe("v1"); // fallback del CMS
  });

  it("conserva el email cuando el titular sí lo dio", async () => {
    const { buildQuoteConsentRow } = await import("@/features/consent/service");

    const { row } = await buildQuoteConsentRow({
      phone: "3001234567",
      email: "lucia@example.com",
    });

    expect(row.email).toBe("lucia@example.com");
    expect(row.phone).toBe("3001234567");
  });

  it("usa la versión vigente del aviso de privacidad, no una constante", async () => {
    getSettingValue.mockResolvedValueOnce("v7");
    const { buildQuoteConsentRow } = await import("@/features/consent/service");

    const { version, row } = await buildQuoteConsentRow({ phone: "3001234567" });

    expect(version).toBe("v7");
    expect(row.version).toBe("v7");
  });
});

describe("createQuoteFromCart — prueba de la autorización", () => {
  it("escribe la fila de Consent en la MISMA transacción que la Quote", async () => {
    const { createQuoteFromCart } = await import("./service");

    await createQuoteFromCart(INPUT, "sess_1", { ip: "9.9.9.9", userAgent: "vitest" });

    expect(quoteCreate).toHaveBeenCalledTimes(1);
    expect(consentCreate).toHaveBeenCalledTimes(1);

    const consentArg = consentCreate.mock.calls[0][0].data;
    expect(consentArg.scope).toBe("HABEAS_DATA");
    expect(consentArg.accepted).toBe(true);
    expect(consentArg.phone).toBe(INPUT.customerWhatsapp);
    expect(consentArg.ipAddress).toBe("9.9.9.9");
  });

  it("sella la prueba SOBRE la cotización (dataConsentAt + versión del aviso)", async () => {
    const { createQuoteFromCart } = await import("./service");

    await createQuoteFromCart(INPUT, "sess_1", { ip: null, userAgent: null });

    const quoteArg = quoteCreate.mock.calls[0][0].data;
    expect(quoteArg.dataConsentAt).toBeInstanceOf(Date);
    expect(quoteArg.dataConsentVersion).toBe("v1");
  });

  it("la marca de la Quote y la de Consent son el MISMO instante (nacen juntas)", async () => {
    const { createQuoteFromCart } = await import("./service");

    await createQuoteFromCart(INPUT, "sess_1", {});

    const quoteAt = quoteCreate.mock.calls[0][0].data.dataConsentAt as Date;
    const consentAt = consentCreate.mock.calls[0][0].data.acceptedAt as Date;
    expect(consentAt.getTime()).toBe(quoteAt.getTime());
  });

  it("no crea NADA si el carrito está vacío (ni cotización ni autorización huérfana)", async () => {
    getCartDetail.mockResolvedValue({ ...CART, items: [] });
    const { createQuoteFromCart, QuoteError } = await import("./service");

    await expect(createQuoteFromCart(INPUT, "sess_1", {})).rejects.toBeInstanceOf(QuoteError);
    expect(quoteCreate).not.toHaveBeenCalled();
    expect(consentCreate).not.toHaveBeenCalled();
  });
});
