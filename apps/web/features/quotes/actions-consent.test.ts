/*
 * Regresión (auditoría 2026-07-21 · hallazgo A1 · Ley 1581 art. 9).
 *
 * `createQuoteAction` es el único punto de la Etapa 1 que recibe datos personales, y los
 * persistía sin exigir ninguna autorización: el formulario solo mostraba un aviso pasivo en el
 * pie. Este test invoca la acción REAL y verifica que sin la casilla marcada NO llega nada al
 * service — cubre el hueco que un test del formulario no ve (el formulario podría marcar la
 * casilla como `required` en el cliente y aun así un POST crafteado la omitiría).
 *
 * Complementa `consent.test.ts`, que prueba que la autorización se PERSISTE cuando sí se da.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const createQuoteFromCart = vi.hoisted(() =>
  vi.fn(async () => ({ number: "COT-ABC234", token: "t" })),
);
const verifyTurnstileToken = vi.hoisted(() => vi.fn(async () => ({ success: true })));
const rateLimit = vi.hoisted(() => vi.fn(async () => ({ allowed: true })));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "1.2.3.4" }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/cart-session", () => ({ getOrCreateCartSession: async () => "sess_1" }));
vi.mock("./service", () => ({
  createQuoteFromCart,
  QuoteError: class QuoteError extends Error {
    constructor(public code: string) {
      super(code);
    }
  },
}));

import { createQuoteAction } from "./actions";

/** FormData válido del formulario de cotización; `consent:false` omite la casilla. */
function quoteForm({ consent = true }: { consent?: boolean } = {}): FormData {
  const fd = new FormData();
  fd.set("customerName", "Lucía Pérez");
  fd.set("customerWhatsapp", "3001234567");
  fd.set("customerEmail", "");
  fd.set("city", "Bogotá");
  fd.set("department", "Cundinamarca");
  fd.set("notes", "");
  fd.set("cf-turnstile-response", "tok");
  if (consent) fd.set("dataConsent", "on");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyTurnstileToken.mockResolvedValue({ success: true });
  rateLimit.mockResolvedValue({ allowed: true });
});

describe("createQuoteAction — autorización de tratamiento obligatoria", () => {
  it("SIN la casilla marcada rechaza y NO persiste ningún dato personal", async () => {
    const res = await createQuoteAction(null, quoteForm({ consent: false }));

    expect(res).toMatchObject({ ok: false });
    expect(createQuoteFromCart).not.toHaveBeenCalled();
  });

  it("el rechazo señala el campo, para que el formulario pinte el error", async () => {
    const res = await createQuoteAction(null, quoteForm({ consent: false }));

    if (res?.ok !== false) throw new Error("debió rechazar");
    expect(res.fieldErrors?.dataConsent?.[0]).toMatch(/[Aa]utoriza/);
    expect(res.error).toMatch(/datos personales/i);
  });

  it("un valor distinto de 'on' no cuenta como autorización", async () => {
    const fd = quoteForm({ consent: false });
    fd.set("dataConsent", "false");

    const res = await createQuoteAction(null, fd);

    expect(res).toMatchObject({ ok: false });
    expect(createQuoteFromCart).not.toHaveBeenCalled();
  });

  it("CON la casilla marcada crea la cotización y propaga IP/User-Agent para el audit trail", async () => {
    const res = await createQuoteAction(null, quoteForm());

    expect(res).toMatchObject({ ok: true, number: "COT-ABC234" });
    expect(createQuoteFromCart).toHaveBeenCalledTimes(1);

    const [, , consentCtx] = createQuoteFromCart.mock.calls[0] as unknown as [
      unknown,
      string,
      { ip?: string | null; userAgent?: string | null },
    ];
    expect(consentCtx.ip).toBe("1.2.3.4");
    expect(consentCtx.userAgent).toBe("vitest");
  });

  it("la autorización se exige ANTES del anti-bot y del rate-limit (no se gasta cuota ni se filtra estado)", async () => {
    await createQuoteAction(null, quoteForm({ consent: false }));

    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });
});
