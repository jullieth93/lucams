/*
 * Idempotencia del submit de cotización (auditoría 2026-07-21, diferible "idempotencia del submit").
 *
 * La cotización es el único embudo de la Etapa 1 y su formulario ya tiene tres frenos al doble
 * envío: el botón se deshabilita con `pending`; useActionState encola los envíos de un mismo
 * formulario ("React queues and executes multiple calls to dispatchAction sequentially" — doc
 * oficial de React, referencia de useActionState § Caveats, consultada 2026-07-24); y, sobre todo,
 * el carrito se vacía al crear la cotización → un segundo envío SECUENCIAL muere en getCartDetail
 * con CART_NOT_FOUND. Lo que NINGUNO de esos frenos cubre es el solapamiento real: dos envíos
 * que leen el carrito lleno antes de que el primero cierre su transacción (dos pestañas, dos
 * dispositivos con la misma cookie de sesión, un POST repetido a mano). Esa ventana —de la lectura
 * al commit— es la que se cierra reclamando el carrito de forma atómica DENTRO de la transacción.
 *
 * Estos tests mockean solo los bordes (DB, carrito, CMS, cabeceras) y ejercitan el service real y
 * la action real, que es donde vive el mapeo del error a mensaje para el cliente.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const quoteCreate = vi.hoisted(() => vi.fn(async () => ({ id: "q1" })));
const consentCreate = vi.hoisted(() => vi.fn());
const cartUpdateMany = vi.hoisted(() => vi.fn(async (_args: unknown) => ({ count: 1 })));
const getCartDetail = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() =>
  vi.fn(async (_input: unknown): Promise<unknown> => ({ sent: true, id: "e1" })),
);
const quoteFindFirst = vi.hoisted(() => vi.fn());
// Notificación in-app del aviso (centro de notificaciones 2026-08-05): dedup + create.
const notificationFindFirst = vi.hoisted(() => vi.fn(async () => null));
const notificationCreate = vi.hoisted(() => vi.fn(async () => ({})));
// after() de next/server se captura (fuera de un request scope lanza) y las tareas se corren a
// mano en el test — así se verifica QUÉ se difiere y CUÁNDO, sin servidor.
const afterTasks = vi.hoisted(() => [] as Array<() => unknown>);
const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/cms", () => ({
  getSettingValue: async (_key: string, fallback: string) => fallback,
}));
vi.mock("@/lib/resend", () => ({ sendEmail }));
vi.mock("@/features/cart/service", () => ({ getCartDetail }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        quote: { create: quoteCreate },
        consent: { create: consentCreate },
        cart: { updateMany: cartUpdateMany },
      }),
    // El aviso al admin (features/quotes/emails.ts) re-lee la Quote por id.
    quote: { findFirst: quoteFindFirst },
    // ...y además del email deja notificación in-app (centro de notificaciones).
    notification: { findFirst: notificationFindFirst, create: notificationCreate },
  },
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));

// Bordes de la action (mismo recorte que actions-consent.test.ts). El service NO se mockea:
// queremos el camino real hasta el reclamo del carrito.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "1.2.3.4" }),
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => afterTasks.push(fn) }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken: async () => ({ success: true }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/cart-session", () => ({ getOrCreateCartSession: async () => "sess_1" }));

import { createQuoteAction } from "./actions";
import { QuoteError, createQuoteFromCart } from "./service";

const CART = {
  cartId: "cart_1",
  subtotal: 4_500_000,
  items: [
    {
      productId: "p1",
      variantId: "v1",
      designId: null,
      productName: "Set fotoimanes",
      variantName: "Default",
      unitPrice: 2_250_000,
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

/** FormData válido del formulario de cotización. */
function quoteForm(): FormData {
  const fd = new FormData();
  fd.set("customerName", INPUT.customerName);
  fd.set("customerWhatsapp", INPUT.customerWhatsapp);
  fd.set("customerEmail", "lucia@example.com");
  fd.set("city", INPUT.city);
  fd.set("department", INPUT.department);
  fd.set("notes", "");
  fd.set("cf-turnstile-response", "tok");
  fd.set("dataConsent", "on");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCartDetail.mockResolvedValue(CART);
  cartUpdateMany.mockResolvedValue({ count: 1 });
  sendEmail.mockResolvedValue({ sent: true, id: "e1" });
  afterTasks.length = 0;
  // La fila que el aviso al admin re-lee por id (emails.ts): shape Quote + items.
  quoteFindFirst.mockResolvedValue({
    id: "q1",
    number: "COT-ABC234",
    customerName: INPUT.customerName,
    customerWhatsapp: INPUT.customerWhatsapp,
    customerEmail: "lucia@example.com",
    city: INPUT.city,
    department: INPUT.department,
    notes: null,
    total: CART.subtotal,
    items: CART.items.map((i) => ({
      productName: i.productName,
      variantName: i.variantName,
      quantity: i.qty,
      unitPrice: i.unitPrice,
    })),
  });
});

/** Corre las tareas diferidas con after() (en producción van tras responder). */
async function runAfterTasks() {
  await Promise.all(afterTasks.splice(0).map((fn) => fn()));
}

describe("createQuoteFromCart — reclamo del carrito", () => {
  it("reclama el carrito de forma CONDICIONAL (solo si sigue sin vaciar) y lo marca 'quote:create'", async () => {
    await createQuoteFromCart(INPUT, "sess_1", {});

    expect(cartUpdateMany).toHaveBeenCalledTimes(1);
    const arg = cartUpdateMany.mock.calls[0][0] as {
      where: { id: string; deletedAt: null };
      data: { deletedAt: Date; deletedBy: string };
    };
    // Sin `deletedAt: null` en el WHERE el segundo envío también afectaría la fila → dos cotizaciones.
    expect(arg.where).toEqual({ id: "cart_1", deletedAt: null });
    expect(arg.data.deletedBy).toBe("quote:create");
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
  });

  it("si otro envío ya se quedó con el carrito (0 filas afectadas) NO crea una segunda cotización", async () => {
    cartUpdateMany.mockResolvedValue({ count: 0 });

    await expect(createQuoteFromCart(INPUT, "sess_1", {})).rejects.toMatchObject({
      name: "QuoteError",
      code: "DUPLICATE_SUBMIT",
    });
    expect(quoteCreate).not.toHaveBeenCalled();
    expect(consentCreate).not.toHaveBeenCalled();
  });

  it("el reclamo va ANTES de escribir (falla rápido, sin PII a medio escribir)", async () => {
    await createQuoteFromCart(INPUT, "sess_1", {});

    const claimOrder = cartUpdateMany.mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(quoteCreate.mock.invocationCallOrder[0]);
    expect(claimOrder).toBeLessThan(consentCreate.mock.invocationCallOrder[0]);
  });

  it("el caso normal (carrito reclamado) sigue creando cotización + consentimiento", async () => {
    const res = await createQuoteFromCart(INPUT, "sess_1", { ip: "9.9.9.9" });

    expect(res.number).toMatch(/^COT-[A-Z2-9]{6}$/);
    expect(quoteCreate).toHaveBeenCalledTimes(1);
    expect(consentCreate).toHaveBeenCalledTimes(1);
  });
});

describe("createQuoteAction — doble envío simultáneo", () => {
  it("responde con un mensaje claro (no el genérico de fallo) y sin registrar un error", async () => {
    cartUpdateMany.mockResolvedValue({ count: 0 });

    const res = await createQuoteAction(null, quoteForm());

    if (res?.ok !== false) throw new Error("debió rechazar el duplicado");
    expect(res.error).toMatch(/no la enviamos dos veces/i);
    expect(res.error).not.toMatch(/prueba de nuevo/i); // reintentar es justo lo que NO queremos
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "quote.create.duplicate_submit" }),
    );
  });

  it("el duplicado NO se confunde con 'carrito vacío' (son cosas distintas para el cliente)", async () => {
    cartUpdateMany.mockResolvedValue({ count: 0 });

    const res = await createQuoteAction(null, quoteForm());

    if (res?.ok !== false) throw new Error("debió rechazar el duplicado");
    expect(res.error).not.toMatch(/carrito está vacío/i);
  });

  it("QuoteError expone el código para que la action pueda distinguirlo", () => {
    expect(new QuoteError("DUPLICATE_SUBMIT").code).toBe("DUPLICATE_SUBMIT");
  });
});

describe("createQuoteAction — aviso al admin (fire-and-forget)", () => {
  it("crear la cotización agenda el aviso y el correo sale UNA vez con número, ítems y total", async () => {
    const res = await createQuoteAction(null, quoteForm());
    expect(res).toMatchObject({ ok: true });
    // El aviso NO corre inline (no retrasa la creación): quedó diferido vía after().
    expect(sendEmail).not.toHaveBeenCalled();
    expect(afterTasks).toHaveLength(1);

    await runAfterTasks();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.to).toBe("hola@lucamsshop.com"); // fallback de ALERT_EMAIL
    expect(arg.subject).toContain("COT-ABC234"); // número de la fila re-leída por el wrapper
    expect(arg.idempotencyKey).toBe("quote:admin-notification:q1");
    expect(arg.html).toContain("Set fotoimanes");
    expect(arg.html).toMatch(/\$\s*45\.000/); // total del carrito en COP
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("un retry del cliente NO manda un segundo correo: solo la rama 'se creó nueva' dispara", async () => {
    // Primer envío: crea la cotización y agenda el aviso.
    const first = await createQuoteAction(null, quoteForm());
    expect(first).toMatchObject({ ok: true });
    await runAfterTasks();
    expect(sendEmail).toHaveBeenCalledTimes(1);

    // Retry (otra pestaña / POST repetido): el reclamo atómico del carrito ya se hizo →
    // DUPLICATE_SUBMIT, sin after ni segundo correo. Doble defensa residual: el
    // idempotencyKey de Resend (ver emails.ts).
    cartUpdateMany.mockResolvedValue({ count: 0 });
    const second = await createQuoteAction(null, quoteForm());
    expect(second).toMatchObject({ ok: false });
    expect(afterTasks).toHaveLength(0);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
