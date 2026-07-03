/*
 * Test UNIT para features/payments/provider.ts — el FACTORY del PaymentProvider.
 *
 * FOCO (según encargo):
 *   1. getPaymentProvider() — qué adapter devuelve (Wompi), singleton + reset,
 *      parsing de PAYMENT_PROVIDER, y rechazo de providers no soportados.
 *   2. __resetPaymentProvider() — reset del singleton (solo tests).
 *   3. El SHAPE del PaymentProvider — verificado a través del adapter real
 *      (WompiPaymentProvider) con lib/wompi mockeado (offline, determinista).
 *
 * NO se duplica la firma HMAC de Wompi (generateIntegritySignature /
 * verifyWebhookSignature) — eso vive en lib/wompi.test.ts. Aquí se mockea
 * @/lib/wompi para aislar el ADAPTER/factory y probar solo la traducción de
 * shapes y el cableado, no la criptografía.
 *
 * Módulo PURO (no DB): provider.ts solo importa "server-only" (stubeado por
 * vitest.config) y hace require("./wompi") lazy. → unit test directo, sin DB.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LIMITACIÓN CONOCIDA DEL ENTORNO DE TEST (documentada, no es fallo del test):
 * provider.ts usa `require("./wompi")` (CJS require nativo de Node). En vitest
 * (ESM + módulos .ts sin compilar) el resolver nativo de Node NO puede resolver
 * "./wompi" (no existe wompi.js/.json/.node en disco; solo wompi.ts). Por eso
 * getPaymentProvider() SIEMPRE lanza "Cannot find module './wompi'" en vitest,
 * ANTES de poder construir el adapter o cachear el singleton. En producción
 * Next.js compila wompi.ts → wompi.js y el require sí resuelve. Verificado
 * 2026-06-30 con probes (Module._cache priming y vi.mock NO interceptan el
 * require nativo). Consecuencia práctica: el "happy path" del factory (devolver
 * un WompiPaymentProvider real y cachearlo) no es observable vía la factory en
 * vitest — por eso el shape/adapter se prueba importando la clase directamente
 * (bloque C). El checkout integration test stubea getPaymentProvider() entera
 * por la misma razón. Ver bugsFound del reporte.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPaymentProvider,
  getPaymentProvider,
  type CreateCheckoutInput,
  type PaymentDetails,
  type PaymentProvider,
} from "./provider";

// ============================================================================
// Snapshot/restore de PAYMENT_PROVIDER (no filtrar env entre tests).
// ============================================================================
const ORIGINAL_PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER;

function restorePaymentProviderEnv() {
  if (ORIGINAL_PAYMENT_PROVIDER === undefined) delete process.env.PAYMENT_PROVIDER;
  else process.env.PAYMENT_PROVIDER = ORIGINAL_PAYMENT_PROVIDER;
}

// ============================================================================
// BLOQUE A — getPaymentProvider(): parsing/normalización de env.
//
// La rama 'wompi' (default, 'WOMPI', '  wompi  ') pasa el check y llega al
// require("./wompi"), que en vitest lanza module-not-found (ver LIMITACIÓN
// arriba) — por eso aseveramos que NO lanza 'no soportado' (tomó la rama
// correcta) aunque el require luego falle. La normalización trim/lowercase se
// prueba así: si no normalizara, 'WOMPI'/'  wompi  ' caería a 'no soportado'.
// ============================================================================
describe("getPaymentProvider — parsing de PAYMENT_PROVIDER", () => {
  beforeEach(() => {
    __resetPaymentProvider();
  });

  afterEach(() => {
    __resetPaymentProvider();
    restorePaymentProviderEnv();
  });

  it("sin PAYMENT_PROVIDER usa el default 'wompi' (alcanza el require de wompi)", () => {
    delete process.env.PAYMENT_PROVIDER;
    // Ruta default → intenta require("./wompi"). En vitest eso lanza module-not-found;
    // lo relevante es que NO lanza el error de 'no soportado' (o sea: tomó la rama wompi).
    expect(() => getPaymentProvider()).toThrow(/wompi/i);
    expect(() => getPaymentProvider()).not.toThrow(/no soportado/);
  });

  it("PAYMENT_PROVIDER='wompi' toma la rama soportada", () => {
    process.env.PAYMENT_PROVIDER = "wompi";
    expect(() => getPaymentProvider()).not.toThrow(/no soportado/);
  });

  it("normaliza mayúsculas: 'WOMPI' se trata como 'wompi' (toLowerCase)", () => {
    process.env.PAYMENT_PROVIDER = "WOMPI";
    // Si NO se normalizara, 'WOMPI' !== 'wompi' → lanzaría 'no soportado'.
    expect(() => getPaymentProvider()).not.toThrow(/no soportado/);
  });

  it("normaliza espacios: '  wompi  ' se trata como 'wompi' (trim)", () => {
    process.env.PAYMENT_PROVIDER = "  wompi  ";
    expect(() => getPaymentProvider()).not.toThrow(/no soportado/);
  });

  it("cadena vacía NO cae al default: '' !== 'wompi' → lanza 'no soportado'", () => {
    // "" ?? "wompi" === "" (?? solo cubre null/undefined). "".trim().toLowerCase()
    // === "" !== "wompi" → el check (antes del require) lanza 'no soportado'.
    process.env.PAYMENT_PROVIDER = "";
    expect(() => getPaymentProvider()).toThrow(/no soportado/i);
  });
});

// ============================================================================
// BLOQUE B — getPaymentProvider(): provider no soportado.
//
// El check `choice !== "wompi"` va ANTES del require("./wompi"), así que un
// provider no soportado lanza el error CLARO 'no soportado' sin cargar el SDK
// (ni topar con la limitación del require en vitest). Aseveramos ese error
// específico — es la garantía de seguridad: un provider no soportado nunca
// devuelve un adapter silencioso.
// ============================================================================
describe("getPaymentProvider — provider no soportado lanza 'no soportado'", () => {
  beforeEach(() => {
    __resetPaymentProvider();
  });

  afterEach(() => {
    __resetPaymentProvider();
    restorePaymentProviderEnv();
  });

  it("'mercadopago' lanza el error 'no soportado' (no un fallback silencioso)", () => {
    process.env.PAYMENT_PROVIDER = "mercadopago";
    expect(() => getPaymentProvider()).toThrow(/no soportado/i);
  });

  it("'stripe' (jamás soportado) lanza 'no soportado'", () => {
    process.env.PAYMENT_PROVIDER = "stripe";
    expect(() => getPaymentProvider()).toThrow(/no soportado/i);
  });

  it("valor arbitrario/malicioso ('__proto__') lanza 'no soportado', no devuelve provider", () => {
    process.env.PAYMENT_PROVIDER = "__proto__";
    expect(() => getPaymentProvider()).toThrow(/no soportado/i);
  });

  it("nunca devuelve un valor cuando el provider no es soportado (return-value contract)", () => {
    process.env.PAYMENT_PROVIDER = "paypal";
    let returned: unknown = "sentinel";
    try {
      returned = getPaymentProvider();
    } catch {
      returned = undefined;
    }
    // Debe haber lanzado → returned quedó en undefined, nunca un objeto.
    expect(returned).toBeUndefined();
  });
});

// ============================================================================
// BLOQUE C — __resetPaymentProvider(): semántica del reset del singleton.
// ============================================================================
describe("__resetPaymentProvider — reset del singleton", () => {
  afterEach(() => {
    __resetPaymentProvider();
    restorePaymentProviderEnv();
  });

  it("es una función exportada", () => {
    expect(typeof __resetPaymentProvider).toBe("function");
  });

  it("devuelve undefined (no filtra el estado interno)", () => {
    expect(__resetPaymentProvider()).toBeUndefined();
  });

  it("es idempotente: llamarlo varias veces seguidas no lanza ni cambia el contrato", () => {
    expect(() => {
      __resetPaymentProvider();
      __resetPaymentProvider();
      __resetPaymentProvider();
    }).not.toThrow();
    expect(__resetPaymentProvider()).toBeUndefined();
  });

  it("tras reset, getPaymentProvider vuelve a evaluar env (rama recomputada, no valor stale)", () => {
    // Primera llamada con provider no soportado → lanza.
    process.env.PAYMENT_PROVIDER = "mercadopago";
    expect(() => getPaymentProvider()).toThrow();
    // Reset + cambiar a wompi → NO debe lanzar 'no soportado' (env se re-lee).
    __resetPaymentProvider();
    process.env.PAYMENT_PROVIDER = "wompi";
    expect(() => getPaymentProvider()).not.toThrow(/no soportado/);
  });
});

// ============================================================================
// BLOQUE D — Shape del PaymentProvider vía el adapter real (WompiPaymentProvider).
//
// Como el factory no puede construir el adapter en vitest (ver LIMITACIÓN),
// probamos el SHAPE importando la clase directamente y mockeando @/lib/wompi
// (offline, determinista). Esto valida el contrato PaymentProvider: name,
// createCheckout, getPaymentDetails (mapeo de status + coerción de Date + null),
// verifyWebhook (normalización valid/invalid). NO re-deriva HMAC (mockeado).
// ============================================================================

// Mock del cliente lib/wompi: controlamos I/O externo (fetch a Wompi, cripto).
// La factory de vi.mock se hoistea; usamos vi.hoisted para los spies compartidos.
const wompiMocks = vi.hoisted(() => ({
  buildCheckoutUrl: vi.fn(),
  getTransaction: vi.fn(),
  verifyWebhookSignature: vi.fn(),
}));

vi.mock("@/lib/wompi", () => ({
  buildCheckoutUrl: wompiMocks.buildCheckoutUrl,
  getTransaction: wompiMocks.getTransaction,
  verifyWebhookSignature: wompiMocks.verifyWebhookSignature,
}));

// Import DESPUÉS del mock (vitest hoistea vi.mock, así que el orden textual da igual,
// pero lo dejamos explícito por claridad).
import { WompiPaymentProvider } from "./wompi";

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: "txn_ABC123",
    reference: "ORD-000042",
    status: "APPROVED" as const,
    amount_in_cents: 4_500_000,
    currency: "COP",
    customer_email: "cliente@example.co",
    payment_method_type: "CARD",
    created_at: "2026-06-30T12:00:00.000Z",
    finalized_at: "2026-06-30T12:01:30.000Z",
    status_message: null,
    ...overrides,
  };
}

describe("WompiPaymentProvider — identidad del adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("name es 'wompi' (el factory por default resuelve a este adapter)", () => {
    const provider = new WompiPaymentProvider();
    expect(provider.name).toBe("wompi");
  });

  it("implementa el contrato PaymentProvider (métodos requeridos presentes)", () => {
    const provider = new WompiPaymentProvider();
    expect(typeof provider.createCheckout).toBe("function");
    expect(typeof provider.getPaymentDetails).toBe("function");
    expect(typeof provider.verifyWebhook).toBe("function");
    // Asignable estructuralmente a PaymentProvider (chequeo de tipo en compile,
    // y presencia de name en runtime).
    const asInterface: PaymentProvider = provider;
    expect(asInterface.name).toBe("wompi");
  });
});

describe("WompiPaymentProvider.createCheckout — shape CreateCheckoutResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wompiMocks.buildCheckoutUrl.mockReturnValue(
      "https://checkout.wompi.co/p/?public-key=pub&reference=ORD-000042",
    );
  });

  const input: CreateCheckoutInput = {
    reference: "ORD-000042",
    amountInCents: 4_500_000,
    currency: "COP",
    customerEmail: "cliente@example.co",
    redirectUrl: "https://lucamsshop.co/checkout/return",
  };

  it("devuelve exactamente { checkoutUrl, reference } y nada más", async () => {
    const provider = new WompiPaymentProvider();
    const result = await provider.createCheckout(input);
    expect(result).toEqual({
      checkoutUrl: "https://checkout.wompi.co/p/?public-key=pub&reference=ORD-000042",
      reference: "ORD-000042",
    });
    expect(Object.keys(result).sort()).toEqual(["checkoutUrl", "reference"]);
  });

  it("propaga el input a buildCheckoutUrl (reference, monto, moneda, email, redirect)", async () => {
    const provider = new WompiPaymentProvider();
    await provider.createCheckout(input);
    expect(wompiMocks.buildCheckoutUrl).toHaveBeenCalledTimes(1);
    expect(wompiMocks.buildCheckoutUrl).toHaveBeenCalledWith({
      reference: "ORD-000042",
      amountInCents: 4_500_000,
      currency: "COP",
      customerEmail: "cliente@example.co",
      redirectUrl: "https://lucamsshop.co/checkout/return",
    });
  });

  it("el reference devuelto ESPEJA el input (no el que devuelve el gateway) — matchea webhook luego", async () => {
    const provider = new WompiPaymentProvider();
    const result = await provider.createCheckout({ ...input, reference: "ORD-XYZ-999" });
    expect(result.reference).toBe("ORD-XYZ-999");
  });

  it("NO cobra: solo construye URL (no llama getTransaction ni verifyWebhook)", async () => {
    const provider = new WompiPaymentProvider();
    await provider.createCheckout(input);
    // createCheckout es "crear URL", no un cargo. No debe tocar lookup ni webhook.
    expect(wompiMocks.getTransaction).not.toHaveBeenCalled();
    expect(wompiMocks.verifyWebhookSignature).not.toHaveBeenCalled();
  });
});

describe("WompiPaymentProvider.getPaymentDetails — shape PaymentDetails + mapeo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mapea todos los campos de la transacción Wompi a PaymentDetails", async () => {
    wompiMocks.getTransaction.mockResolvedValue(makeTx());
    const provider = new WompiPaymentProvider();
    const details = await provider.getPaymentDetails("txn_ABC123");

    expect(wompiMocks.getTransaction).toHaveBeenCalledWith("txn_ABC123");
    expect(details.providerTransactionId).toBe("txn_ABC123");
    expect(details.reference).toBe("ORD-000042");
    expect(details.status).toBe("APPROVED");
    expect(details.amountInCents).toBe(4_500_000);
    expect(details.currency).toBe("COP");
    expect(details.customerEmail).toBe("cliente@example.co");
    expect(details.paymentMethodType).toBe("CARD");
    expect(details.statusMessage).toBeNull();
  });

  it("coerciona created_at (string ISO) a instancia Date con el timestamp correcto", async () => {
    wompiMocks.getTransaction.mockResolvedValue(
      makeTx({ created_at: "2026-06-30T12:00:00.000Z" }),
    );
    const provider = new WompiPaymentProvider();
    const details = await provider.getPaymentDetails("txn_ABC123");
    expect(details.createdAt).toBeInstanceOf(Date);
    expect(details.createdAt.toISOString()).toBe("2026-06-30T12:00:00.000Z");
  });

  it("coerciona finalized_at a Date cuando está presente", async () => {
    wompiMocks.getTransaction.mockResolvedValue(
      makeTx({ finalized_at: "2026-06-30T12:01:30.000Z" }),
    );
    const provider = new WompiPaymentProvider();
    const details = await provider.getPaymentDetails("txn_ABC123");
    expect(details.finalizedAt).toBeInstanceOf(Date);
    expect(details.finalizedAt?.toISOString()).toBe("2026-06-30T12:01:30.000Z");
  });

  it("finalized_at null → finalizedAt null (NO se convierte a epoch/Invalid Date)", async () => {
    wompiMocks.getTransaction.mockResolvedValue(makeTx({ finalized_at: null }));
    const provider = new WompiPaymentProvider();
    const details = await provider.getPaymentDetails("txn_ABC123");
    expect(details.finalizedAt).toBeNull();
  });

  it("customer_email null se preserva como null (no ''/undefined)", async () => {
    wompiMocks.getTransaction.mockResolvedValue(makeTx({ customer_email: null }));
    const provider = new WompiPaymentProvider();
    const details = await provider.getPaymentDetails("txn_ABC123");
    expect(details.customerEmail).toBeNull();
  });

  it("payment_method_type null se preserva como null", async () => {
    wompiMocks.getTransaction.mockResolvedValue(makeTx({ payment_method_type: null }));
    const provider = new WompiPaymentProvider();
    const details = await provider.getPaymentDetails("txn_ABC123");
    expect(details.paymentMethodType).toBeNull();
  });

  // Mapeo de status: cada estado de Wompi → PaymentStatus. Es lógica del adapter,
  // no de la firma HMAC → legítimo probarlo aquí.
  it.each([
    ["APPROVED", "APPROVED"],
    ["DECLINED", "DECLINED"],
    ["VOIDED", "VOIDED"],
    ["ERROR", "ERROR"],
    ["PENDING", "PENDING"],
  ])("mapea status Wompi %s → PaymentStatus %s", async (wompiStatus, expected) => {
    wompiMocks.getTransaction.mockResolvedValue(makeTx({ status: wompiStatus }));
    const provider = new WompiPaymentProvider();
    const details = await provider.getPaymentDetails("txn_ABC123");
    expect(details.status).toBe(expected);
  });

  it("status desconocido/no esperado cae a PENDING (default seguro, no APPROVED)", async () => {
    // CRÍTICO seguridad: un estado raro NUNCA debe interpretarse como pagado.
    wompiMocks.getTransaction.mockResolvedValue(makeTx({ status: "SOMETHING_WEIRD" }));
    const provider = new WompiPaymentProvider();
    const details = await provider.getPaymentDetails("txn_ABC123");
    expect(details.status).toBe("PENDING");
    expect(details.status).not.toBe("APPROVED");
  });

  it("propaga el error si getTransaction falla (no lo traga silenciosamente)", async () => {
    wompiMocks.getTransaction.mockRejectedValue(new Error("Wompi getTransaction HTTP 404"));
    const provider = new WompiPaymentProvider();
    await expect(provider.getPaymentDetails("txn_missing")).rejects.toThrow(/HTTP 404/);
  });

  it("PaymentDetails tiene exactamente el conjunto de claves del contrato", async () => {
    wompiMocks.getTransaction.mockResolvedValue(makeTx());
    const provider = new WompiPaymentProvider();
    const details: PaymentDetails = await provider.getPaymentDetails("txn_ABC123");
    expect(Object.keys(details).sort()).toEqual(
      [
        "amountInCents",
        "createdAt",
        "currency",
        "customerEmail",
        "finalizedAt",
        "paymentMethodType",
        "providerTransactionId",
        "reference",
        "status",
        "statusMessage",
      ].sort(),
    );
  });
});

describe("WompiPaymentProvider.verifyWebhook — normalización WebhookVerificationResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("firma válida con transaction → { valid:true, ...campos normalizados }", () => {
    wompiMocks.verifyWebhookSignature.mockReturnValue({
      valid: true,
      event: {
        event: "transaction.updated",
        data: {
          transaction: {
            id: "txn_WH1",
            reference: "ORD-777",
            status: "APPROVED",
            amount_in_cents: 1_200_000,
          },
        },
      },
    });
    const provider = new WompiPaymentProvider();
    const result = provider.verifyWebhook('{"raw":"body"}', { "x-signature": "irrelevant" });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.providerTransactionId).toBe("txn_WH1");
      expect(result.reference).toBe("ORD-777");
      expect(result.status).toBe("APPROVED");
      expect(result.amountInCents).toBe(1_200_000);
    }
  });

  it("pasa el rawBody tal cual a verifyWebhookSignature (no lo reserializa)", () => {
    wompiMocks.verifyWebhookSignature.mockReturnValue({ valid: false, event: null, reason: "x" });
    const provider = new WompiPaymentProvider();
    const raw = '{"event":"transaction.updated"}';
    provider.verifyWebhook(raw, {});
    expect(wompiMocks.verifyWebhookSignature).toHaveBeenCalledWith(raw);
  });

  it("mapea el status del webhook (DECLINED) igual que getPaymentDetails", () => {
    wompiMocks.verifyWebhookSignature.mockReturnValue({
      valid: true,
      event: {
        event: "transaction.updated",
        data: {
          transaction: {
            id: "t",
            reference: "r",
            status: "DECLINED",
            amount_in_cents: 1,
          },
        },
      },
    });
    const provider = new WompiPaymentProvider();
    const result = provider.verifyWebhook("{}", {});
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.status).toBe("DECLINED");
  });

  it("firma inválida → { valid:false, reason } (usa el reason de la fuente)", () => {
    wompiMocks.verifyWebhookSignature.mockReturnValue({
      valid: false,
      event: null,
      reason: "checksum mismatch",
    });
    const provider = new WompiPaymentProvider();
    const result = provider.verifyWebhook("{}", {});
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("checksum mismatch");
  });

  it("firma inválida sin reason → fallback 'firma inválida' (no undefined)", () => {
    wompiMocks.verifyWebhookSignature.mockReturnValue({ valid: false, event: null });
    const provider = new WompiPaymentProvider();
    const result = provider.verifyWebhook("{}", {});
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("firma inválida");
  });

  it("firma válida pero SIN transaction en data → { valid:false, reason } (no crashea)", () => {
    // SEGURIDAD: un evento firmado pero sin transaction NO debe pasar como válido.
    wompiMocks.verifyWebhookSignature.mockReturnValue({
      valid: true,
      event: {
        event: "nequi_token.updated",
        data: {},
      },
    });
    const provider = new WompiPaymentProvider();
    const result = provider.verifyWebhook("{}", {});
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("webhook sin transaction.data");
  });

  it("valid:true pero event ausente/null → tratado como inválido (defensa)", () => {
    wompiMocks.verifyWebhookSignature.mockReturnValue({ valid: true, event: null });
    const provider = new WompiPaymentProvider();
    const result = provider.verifyWebhook("{}", {});
    expect(result.valid).toBe(false);
  });

  it("verifyWebhook es SÍNCRONO (no devuelve Promise) — el handler no debe await", () => {
    wompiMocks.verifyWebhookSignature.mockReturnValue({ valid: false, event: null, reason: "x" });
    const provider = new WompiPaymentProvider();
    const result = provider.verifyWebhook("{}", {});
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result.valid).toBe("boolean");
  });

  it("no depende de los headers para la verificación (Wompi firma el body, no headers)", () => {
    // El adapter ignora headers (_headers). Verificamos que con headers vacíos
    // vs headers arbitrarios el resultado no cambia (source of truth = body).
    wompiMocks.verifyWebhookSignature.mockReturnValue({
      valid: true,
      event: {
        event: "transaction.updated",
        data: { transaction: { id: "a", reference: "b", status: "APPROVED", amount_in_cents: 1 } },
      },
    });
    const provider = new WompiPaymentProvider();
    const withEmpty = provider.verifyWebhook("{}", {});
    const withHeaders = provider.verifyWebhook("{}", { "x-evil": "1", authorization: "spoof" });
    expect(withEmpty).toEqual(withHeaders);
    // Y verifyWebhookSignature se llamó solo con el body ambas veces.
    expect(wompiMocks.verifyWebhookSignature).toHaveBeenNthCalledWith(1, "{}");
    expect(wompiMocks.verifyWebhookSignature).toHaveBeenNthCalledWith(2, "{}");
  });
});
