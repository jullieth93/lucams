/*
 * Test de seguridad financiera para lib/wompi.ts.
 *
 * FOCO CRÍTICO:
 *  1. generateIntegritySignature — firma de integridad de la transacción
 *     SHA256(reference + amountInCents + currency + integritySecret). Evita
 *     que el cliente manipule el monto en el Web Checkout.
 *  2. verifyWebhookSignature — verificación HMAC-SHA256 de webhooks de Wompi:
 *     SHA256(valores_de_properties_ordenadas + timestamp + events_secret).
 *     Una firma inválida/manipulada DEBE rechazarse (si no, un atacante podría
 *     marcar Orders como pagadas con un webhook falso).
 *
 * Estrategia: fijamos los secretos en env con valores deterministas y
 * recalculamos el checksum esperado con el MISMO algoritmo que la fuente
 * (node:crypto sha256 sobre la concatenación exacta). Los vectores son
 * reproducibles y no dependen de los secretos reales del .env.
 *
 * El módulo NO es DB-coupled (solo importa server-only, node:crypto y el
 * logger) → unit test puro. `server-only` lo stubea vitest.config.ts.
 */

import crypto from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateIntegritySignature, verifyWebhookSignature } from "./wompi";

// --- Secretos deterministas para los vectores --------------------------------
const INTEGRITY_SECRET = "test_integrity_FIXED";
const EVENTS_SECRET = "test_events_FIXED";

// --- Helpers que replican EXACTAMENTE el algoritmo de la fuente ---------------
function expectedIntegrity(reference: string, amountInCents: number, currency: string): string {
  const concat = `${reference}${amountInCents}${currency}${INTEGRITY_SECRET}`;
  return crypto.createHash("sha256").update(concat).digest("hex");
}

/** Replica extractValueByPath + concat del webhook signing de la fuente. */
function extractByPath(data: unknown, path: string): string {
  const parts = path.split(".");
  let cur: unknown = data;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return "";
    }
  }
  return cur === null || cur === undefined ? "" : String(cur);
}

function expectedWebhookChecksum(data: unknown, properties: string[], timestamp: number): string {
  const concat =
    properties.map((p) => extractByPath(data, p)).join("") + String(timestamp) + EVENTS_SECRET;
  return crypto.createHash("sha256").update(concat).digest("hex");
}

// --- Builder de body de webhook válido (firmado con EVENTS_SECRET) ------------
const DEFAULT_PROPS = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];

function buildWebhookBody(opts?: {
  data?: Record<string, unknown>;
  properties?: string[];
  timestamp?: number;
  checksum?: string; // si se omite, se firma correctamente
  omit?: "checksum" | "properties" | "timestamp" | "signature";
}): string {
  const data = opts?.data ?? {
    transaction: { id: "txn_abc", status: "APPROVED", amount_in_cents: 150_000 },
  };
  const properties = opts?.properties ?? DEFAULT_PROPS;
  const timestamp = opts?.timestamp ?? 1_700_000_000;
  const checksum = opts?.checksum ?? expectedWebhookChecksum(data, properties, timestamp);

  const body: Record<string, unknown> = {
    event: "transaction.updated",
    data,
    environment: "test",
    signature: { properties, checksum },
    timestamp,
    sent_at: "2026-06-29T00:00:00.000Z",
  };

  if (opts?.omit === "signature") delete body.signature;
  if (opts?.omit === "timestamp") delete body.timestamp;
  if (opts?.omit === "checksum") (body.signature as Record<string, unknown>).checksum = undefined;
  if (opts?.omit === "properties")
    (body.signature as Record<string, unknown>).properties = undefined;

  return JSON.stringify(body);
}

// --- Snapshot/restore de env --------------------------------------------------
const ORIGINAL_ENV = {
  WOMPI_PUBLIC_KEY: process.env.WOMPI_PUBLIC_KEY,
  WOMPI_PRIVATE_KEY: process.env.WOMPI_PRIVATE_KEY,
  WOMPI_EVENTS_SECRET: process.env.WOMPI_EVENTS_SECRET,
  WOMPI_INTEGRITY_SECRET: process.env.WOMPI_INTEGRITY_SECRET,
};

function restoreEnv() {
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  // getWompiConfig() exige las 4 llaves o lanza. Fijamos todas con valores
  // deterministas para que los vectores sean reproducibles.
  process.env.WOMPI_PUBLIC_KEY = "pub_test_FIXED";
  process.env.WOMPI_PRIVATE_KEY = "prv_test_FIXED";
  process.env.WOMPI_EVENTS_SECRET = EVENTS_SECRET;
  process.env.WOMPI_INTEGRITY_SECRET = INTEGRITY_SECRET;
});

afterEach(() => {
  restoreEnv();
});

afterAll(() => {
  restoreEnv();
});

// =============================================================================
// generateIntegritySignature — firma de integridad de la transacción
// =============================================================================
describe("generateIntegritySignature (firma de integridad de transacción)", () => {
  it("produce el SHA256 hex determinista de reference+amount+currency+secret", () => {
    const sig = generateIntegritySignature({
      reference: "REF-123",
      amountInCents: 150_000,
      currency: "COP",
    });
    // Vector fijo precomputado (regresión exacta del byte-string firmado).
    expect(sig).toBe("09724a3cd096dc57bff00619791ac2dfdc514d15051f5710eebb8d09639f945f");
    // Y coincide con el algoritmo replicado independientemente.
    expect(sig).toBe(expectedIntegrity("REF-123", 150_000, "COP"));
  });

  it("siempre devuelve 64 chars hex (SHA-256)", () => {
    const sig = generateIntegritySignature({
      reference: "any",
      amountInCents: 1,
      currency: "COP",
    });
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cambia si cambia el monto (impide manipular amount sin invalidar firma)", () => {
    const base = generateIntegritySignature({
      reference: "REF-123",
      amountInCents: 150_000,
      currency: "COP",
    });
    const tampered = generateIntegritySignature({
      reference: "REF-123",
      amountInCents: 1, // atacante baja el monto
      currency: "COP",
    });
    expect(tampered).not.toBe(base);
  });

  it("cambia si cambia la reference", () => {
    const a = generateIntegritySignature({
      reference: "REF-A",
      amountInCents: 1000,
      currency: "COP",
    });
    const b = generateIntegritySignature({
      reference: "REF-B",
      amountInCents: 1000,
      currency: "COP",
    });
    expect(a).not.toBe(b);
  });

  it("cambia si cambia la moneda", () => {
    const cop = generateIntegritySignature({
      reference: "REF",
      amountInCents: 1000,
      currency: "COP",
    });
    const usd = generateIntegritySignature({
      reference: "REF",
      amountInCents: 1000,
      currency: "USD",
    });
    expect(cop).not.toBe(usd);
  });

  it("cambia si cambia el integrity secret (clave distinta → firma distinta)", () => {
    const withFixed = generateIntegritySignature({
      reference: "REF",
      amountInCents: 1000,
      currency: "COP",
    });
    process.env.WOMPI_INTEGRITY_SECRET = "test_integrity_OTHER";
    const withOther = generateIntegritySignature({
      reference: "REF",
      amountInCents: 1000,
      currency: "COP",
    });
    expect(withOther).not.toBe(withFixed);
    expect(withOther).toBe(
      crypto.createHash("sha256").update("REF1000COPtest_integrity_OTHER").digest("hex"),
    );
  });

  it("es determinista (misma entrada → misma firma en llamadas sucesivas)", () => {
    const input = { reference: "REF-DET", amountInCents: 99_900, currency: "COP" };
    expect(generateIntegritySignature(input)).toBe(generateIntegritySignature(input));
  });

  it("trata amountInCents como string concatenado (sin separadores ni decimales)", () => {
    // Garantiza el formato exacto: 150000, no 150.000 ni 1500.00
    const sig = generateIntegritySignature({
      reference: "X",
      amountInCents: 150_000,
      currency: "COP",
    });
    expect(sig).toBe(
      crypto.createHash("sha256").update("X150000COPtest_integrity_FIXED").digest("hex"),
    );
  });

  it("lanza si faltan las llaves Wompi en env", () => {
    delete process.env.WOMPI_INTEGRITY_SECRET;
    expect(() =>
      generateIntegritySignature({ reference: "R", amountInCents: 1, currency: "COP" }),
    ).toThrow(/faltan WOMPI/);
  });
});

// =============================================================================
// verifyWebhookSignature — happy paths (firma válida acepta)
// =============================================================================
describe("verifyWebhookSignature — firma válida acepta", () => {
  it("acepta un webhook firmado correctamente y devuelve el evento parseado", () => {
    const body = buildWebhookBody();
    const res = verifyWebhookSignature(body);
    expect(res.valid).toBe(true);
    expect(res.reason).toBeUndefined();
    expect(res.event).not.toBeNull();
    expect(res.event?.event).toBe("transaction.updated");
    expect(res.event?.data.transaction?.id).toBe("txn_abc");
    expect(res.event?.data.transaction?.status).toBe("APPROVED");
  });

  it("acepta con un orden de properties distinto (firma derivada de ese orden)", () => {
    const data = { transaction: { id: "t1", status: "DECLINED", amount_in_cents: 500 } };
    const properties = ["transaction.amount_in_cents", "transaction.status", "transaction.id"];
    const body = buildWebhookBody({ data, properties });
    const res = verifyWebhookSignature(body);
    expect(res.valid).toBe(true);
  });

  it("la cadena a firmar concatena VALORES en el orden de properties + timestamp + secret", () => {
    // Verificación explícita de la derivación de la cadena: construimos un body
    // cuyo checksum calculamos a mano siguiendo el spec y debe aceptarse.
    const data = { transaction: { id: "abc", status: "VOIDED", amount_in_cents: 42 } };
    const properties = DEFAULT_PROPS;
    const timestamp = 1_650_000_123;
    const handChecksum = crypto
      .createHash("sha256")
      .update("abc" + "VOIDED" + "42" + "1650000123" + EVENTS_SECRET)
      .digest("hex");
    const body = buildWebhookBody({ data, properties, timestamp, checksum: handChecksum });
    expect(verifyWebhookSignature(body).valid).toBe(true);
  });

  it("una property ausente en data se concatena como cadena vacía (no rompe)", () => {
    // properties referencia transaction.payment_method_type que no existe en data.
    const data = { transaction: { id: "z", status: "APPROVED", amount_in_cents: 1 } };
    const properties = ["transaction.id", "transaction.payment_method_type"];
    const timestamp = 1_700_000_001;
    // En la fuente, el valor faltante → "" ; replicamos eso.
    const checksum = crypto
      .createHash("sha256")
      .update("z" + "" + "1700000001" + EVENTS_SECRET)
      .digest("hex");
    const body = buildWebhookBody({ data, properties, timestamp, checksum });
    expect(verifyWebhookSignature(body).valid).toBe(true);
  });
});

// =============================================================================
// verifyWebhookSignature — firma inválida / manipulada RECHAZA (SEGURIDAD)
// =============================================================================
describe("verifyWebhookSignature — firma inválida/manipulada rechaza", () => {
  it("rechaza checksum manipulado (mismo length, valor distinto)", () => {
    const tamperedChecksum = "0".repeat(64);
    const body = buildWebhookBody({ checksum: tamperedChecksum });
    const res = verifyWebhookSignature(body);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("checksum mismatch");
    // El evento se devuelve aunque la firma falle (para logging), pero valid=false.
    expect(res.event).not.toBeNull();
  });

  it("rechaza si el atacante baja el monto pero conserva la firma original", () => {
    // Firma calculada sobre amount=150000; atacante cambia data a amount=1.
    const goodData = {
      transaction: { id: "txn_abc", status: "APPROVED", amount_in_cents: 150_000 },
    };
    const goodChecksum = expectedWebhookChecksum(goodData, DEFAULT_PROPS, 1_700_000_000);
    const tamperedData = {
      transaction: { id: "txn_abc", status: "APPROVED", amount_in_cents: 1 },
    };
    const body = buildWebhookBody({
      data: tamperedData,
      checksum: goodChecksum, // firma vieja
      timestamp: 1_700_000_000,
    });
    const res = verifyWebhookSignature(body);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("checksum mismatch");
  });

  it("rechaza si el atacante eleva el status a APPROVED conservando firma vieja", () => {
    const goodData = {
      transaction: { id: "txn_abc", status: "DECLINED", amount_in_cents: 150_000 },
    };
    const goodChecksum = expectedWebhookChecksum(goodData, DEFAULT_PROPS, 1_700_000_000);
    const tamperedData = {
      transaction: { id: "txn_abc", status: "APPROVED", amount_in_cents: 150_000 },
    };
    const body = buildWebhookBody({
      data: tamperedData,
      checksum: goodChecksum,
      timestamp: 1_700_000_000,
    });
    expect(verifyWebhookSignature(body).valid).toBe(false);
  });

  it("rechaza si se cambia el timestamp (replay con timestamp distinto invalida firma)", () => {
    const data = { transaction: { id: "t", status: "APPROVED", amount_in_cents: 1 } };
    const checksum = expectedWebhookChecksum(data, DEFAULT_PROPS, 1_700_000_000);
    const body = buildWebhookBody({ data, checksum, timestamp: 1_700_000_999 });
    expect(verifyWebhookSignature(body).valid).toBe(false);
  });

  it("rechaza si la firma fue generada con OTRO events secret", () => {
    const data = { transaction: { id: "t", status: "APPROVED", amount_in_cents: 1 } };
    const wrongSecretChecksum = crypto
      .createHash("sha256")
      .update("tAPPROVED1" + "1700000000" + "test_events_ATTACKER")
      .digest("hex");
    const body = buildWebhookBody({
      data,
      checksum: wrongSecretChecksum,
      timestamp: 1_700_000_000,
    });
    expect(verifyWebhookSignature(body).valid).toBe(false);
  });

  it("rechaza checksum de length incorrecto (no 64 hex)", () => {
    const body = buildWebhookBody({ checksum: "abc123" });
    const res = verifyWebhookSignature(body);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("checksum mismatch");
  });

  it("rechaza checksum de 64 chars NO-hex (Buffer.from da 0 bytes → mismatch, sin crash)", () => {
    const body = buildWebhookBody({ checksum: "z".repeat(64) });
    const res = verifyWebhookSignature(body);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("checksum mismatch");
  });

  it("rechaza si se reordenan las properties sin recalcular firma", () => {
    // Firma calculada con DEFAULT_PROPS, pero el body declara otro orden.
    const data = { transaction: { id: "t", status: "APPROVED", amount_in_cents: 1 } };
    const checksum = expectedWebhookChecksum(data, DEFAULT_PROPS, 1_700_000_000);
    const reordered = ["transaction.status", "transaction.id", "transaction.amount_in_cents"];
    const body = buildWebhookBody({
      data,
      properties: reordered,
      checksum,
      timestamp: 1_700_000_000,
    });
    expect(verifyWebhookSignature(body).valid).toBe(false);
  });
});

// =============================================================================
// verifyWebhookSignature — entradas inválidas / campos faltantes
// =============================================================================
describe("verifyWebhookSignature — entradas inválidas y campos faltantes", () => {
  it("rechaza JSON malformado", () => {
    const res = verifyWebhookSignature("{ esto no es json válido");
    expect(res.valid).toBe(false);
    expect(res.event).toBeNull();
    expect(res.reason).toBe("JSON inválido");
  });

  it("rechaza string vacío", () => {
    const res = verifyWebhookSignature("");
    expect(res.valid).toBe(false);
    expect(res.event).toBeNull();
    expect(res.reason).toBe("JSON inválido");
  });

  it("rechaza body sin objeto signature", () => {
    const body = buildWebhookBody({ omit: "signature" });
    const res = verifyWebhookSignature(body);
    expect(res.valid).toBe(false);
    expect(res.event).toBeNull();
    expect(res.reason).toBe("signature/timestamp ausentes");
  });

  it("rechaza body sin checksum", () => {
    const body = buildWebhookBody({ omit: "checksum" });
    const res = verifyWebhookSignature(body);
    expect(res.valid).toBe(false);
    expect(res.event).toBeNull();
    expect(res.reason).toBe("signature/timestamp ausentes");
  });

  it("rechaza body sin properties", () => {
    const body = buildWebhookBody({ omit: "properties" });
    const res = verifyWebhookSignature(body);
    expect(res.valid).toBe(false);
    expect(res.event).toBeNull();
    expect(res.reason).toBe("signature/timestamp ausentes");
  });

  it("rechaza body sin timestamp", () => {
    const body = buildWebhookBody({ omit: "timestamp" });
    const res = verifyWebhookSignature(body);
    expect(res.valid).toBe(false);
    expect(res.event).toBeNull();
    expect(res.reason).toBe("signature/timestamp ausentes");
  });

  it("rechaza JSON que es un literal null", () => {
    const res = verifyWebhookSignature("null");
    expect(res.valid).toBe(false);
    expect(res.event).toBeNull();
    expect(res.reason).toBe("signature/timestamp ausentes");
  });

  it("lanza si faltan las llaves Wompi en env (firma con length OK no se puede verificar)", () => {
    // Con un checksum de 64 chars el flujo llega a getWompiConfig() y debe lanzar.
    delete process.env.WOMPI_EVENTS_SECRET;
    const body = buildWebhookBody();
    expect(() => verifyWebhookSignature(body)).toThrow(/faltan WOMPI/);
  });
});
