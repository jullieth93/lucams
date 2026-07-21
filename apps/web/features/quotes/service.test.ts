/*
 * Tests unitarios de features/quotes — Etapa 1 (catálogo + WhatsApp).
 *
 * FOCO (puro, sin DB):
 *   - generateQuoteNumber: formato "COT-XXXXXX", alfabeto sin ambiguos,
 *     aleatoriedad entre llamadas.
 *   - buildQuoteWhatsAppUrl: mensaje wa.me con número de cotización, items
 *     con cantidades, total formateado COP y nombre del cliente; omite la
 *     variante interna "Default"; consulta la plantilla WA_MSG_QUOTE del CMS.
 *   - QuoteFormSchema: validaciones del formulario (nombre, móvil CO,
 *     email opcional, ciudad/departamento, notas ≤500).
 *
 * Los bordes DB/servicios se mockean (prisma, cart service, orders service);
 * el CMS se mockea como en lib/wa.test.ts (por defecto devuelve el fallback →
 * ejercita la plantilla hardcoded real).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Bordes mockeados: el service importa prisma/cart/orders pero estos tests
// solo ejercitan las partes puras (number, wa url, schema).
vi.mock("@/lib/db", () => ({
  prisma: {},
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      constructor(
        message: string,
        public code: string,
      ) {
        super(message);
      }
    },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/features/cart/service", () => ({ getCartDetail: vi.fn() }));
vi.mock("@/features/orders/service", () => ({ clearCartAfterPaid: vi.fn() }));

// CMS mockeado: setting ausente → fallback (igual que lib/wa.test.ts).
const getSettingValue = vi.fn(async (_key: string, fallback: string): Promise<string> => fallback);
vi.mock("@/lib/cms", () => ({
  getSettingValue: (key: string, fallback: string) => getSettingValue(key, fallback),
}));

import { buildQuoteWhatsAppUrl, generateQuoteNumber } from "./service";
import { QuoteFormSchema } from "./schemas";

beforeEach(() => {
  getSettingValue.mockReset();
  getSettingValue.mockImplementation(async (_key: string, fallback: string) => fallback);
});

// ─────────────────────────── generateQuoteNumber ───────────────────────────

describe("generateQuoteNumber", () => {
  it("genera formato COT-XXXXXX con 6 caracteres", () => {
    const n = generateQuoteNumber();
    expect(n).toMatch(/^COT-[A-Z2-9]{6}$/);
  });

  it("usa solo el alfabeto sin ambiguos (sin 0/O/1/I/L)", () => {
    // Muestra amplia para cubrir el alfabeto completo con alta probabilidad.
    // La verificación de ambiguos aplica a la parte VARIABLE (tras "COT-").
    for (let i = 0; i < 200; i++) {
      const n = generateQuoteNumber();
      expect(n).toMatch(/^COT-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
      expect(n.slice(4)).not.toMatch(/[01OIL]/);
    }
  });

  it("dos llamadas consecutivas casi nunca coinciden (aleatorio, no secuencial)", () => {
    const a = generateQuoteNumber();
    const b = generateQuoteNumber();
    expect(a).not.toBe(b);
  });
});

// ─────────────────────────── buildQuoteWhatsAppUrl ─────────────────────────

const QUOTE = {
  number: "COT-ABC234",
  customerName: "Lucía Pérez",
  total: 45_000, // centavos → $ 450
  items: [
    { productName: "Imán Corazón", variantName: "Set 6", quantity: 2, unitPrice: 15_000 },
    { productName: "Llavero Foto", variantName: "Default", quantity: 1, unitPrice: 15_000 },
  ],
};

describe("buildQuoteWhatsAppUrl", () => {
  it("arma el wa.me con número, items con cantidades, total COP y nombre (plantilla fallback)", async () => {
    process.env.NEXT_PUBLIC_WA_NUMBER = "573001234567";
    const url = await buildQuoteWhatsAppUrl(QUOTE);
    expect(url.startsWith("https://wa.me/573001234567?text=")).toBe(true);

    const text = decodeURIComponent(url.slice(url.indexOf("?text=") + "?text=".length));
    expect(text).toContain("COT-ABC234");
    expect(text).toContain("Lucía Pérez");
    // Items: "• 2× Imán Corazón (Set 6) — $ 300" (centavos → pesos, es-CO).
    expect(text).toContain("2× Imán Corazón (Set 6)");
    // La variante interna "Default" NO se muestra.
    expect(text).toContain("1× Llavero Foto —");
    expect(text).not.toContain("Default");
    // Total formateado COP ($ 450 para 45_000 centavos).
    expect(text).toMatch(/Total: \$\s*450/);
  });

  it("consulta la plantilla WA_MSG_QUOTE del CMS con su fallback", async () => {
    await buildQuoteWhatsAppUrl(QUOTE);
    expect(getSettingValue).toHaveBeenCalledWith(
      "WA_MSG_QUOTE",
      expect.stringContaining("{quoteNumber}"),
    );
  });

  it("usa la plantilla configurada en el CMS cuando existe (interpolando las 4 variables)", async () => {
    getSettingValue.mockImplementation(async (key: string, fallback: string) =>
      key === "WA_MSG_QUOTE" ? "Cotización {quoteNumber} de {customerName}: {total}" : fallback,
    );
    const url = await buildQuoteWhatsAppUrl(QUOTE);
    const text = decodeURIComponent(url.slice(url.indexOf("?text=") + "?text=".length));
    expect(text).toMatch(/^Cotización COT-ABC234 de Lucía Pérez: \$\s*450$/);
  });

  it("el mensaje va encodeURIComponent (un solo '?', sin '&' crudo)", async () => {
    const url = await buildQuoteWhatsAppUrl({
      ...QUOTE,
      customerName: "A & B",
    });
    expect(url.split("?")).toHaveLength(2);
    expect(url).toContain("%26");
  });
});

// ─────────────────────────── QuoteFormSchema ───────────────────────────────

const VALID = {
  customerName: "Lucía Pérez",
  customerWhatsapp: "3208873826",
  city: "Bogotá D.C.",
  department: "Bogotá D.C.",
};

describe("QuoteFormSchema", () => {
  it("acepta el caso feliz mínimo (sin email ni notas)", () => {
    const r = QuoteFormSchema.safeParse(VALID);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.customerEmail).toBeUndefined();
      expect(r.data.notes).toBeUndefined();
    }
  });

  it("normaliza el WhatsApp con +57 y espacios a 10 dígitos", () => {
    const r = QuoteFormSchema.safeParse({ ...VALID, customerWhatsapp: "+57 320 887 3826" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.customerWhatsapp).toBe("3208873826");
  });

  it("rechaza móvil que no empieza con 3 o no tiene 10 dígitos", () => {
    expect(QuoteFormSchema.safeParse({ ...VALID, customerWhatsapp: "208873826" }).success).toBe(
      false,
    );
    expect(QuoteFormSchema.safeParse({ ...VALID, customerWhatsapp: "32088738" }).success).toBe(
      false,
    );
    expect(QuoteFormSchema.safeParse({ ...VALID, customerWhatsapp: "" }).success).toBe(false);
  });

  it("rechaza nombre de 1 caracter, con dígitos, o de más de 80 caracteres", () => {
    expect(QuoteFormSchema.safeParse({ ...VALID, customerName: "L" }).success).toBe(false);
    expect(QuoteFormSchema.safeParse({ ...VALID, customerName: "Luc1a" }).success).toBe(false);
    expect(QuoteFormSchema.safeParse({ ...VALID, customerName: "A".repeat(81) }).success).toBe(
      false,
    );
  });

  it("email opcional: acepta vacío, rechaza formato inválido, normaliza a minúsculas", () => {
    const vacio = QuoteFormSchema.safeParse({ ...VALID, customerEmail: "" });
    expect(vacio.success).toBe(true);
    if (vacio.success) expect(vacio.data.customerEmail).toBeUndefined();

    expect(QuoteFormSchema.safeParse({ ...VALID, customerEmail: "no-es-email" }).success).toBe(
      false,
    );

    const ok = QuoteFormSchema.safeParse({ ...VALID, customerEmail: "  Lucia@Gmail.COM " });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.customerEmail).toBe("lucia@gmail.com");
  });

  it("rechaza ciudad/departamento vacíos", () => {
    expect(QuoteFormSchema.safeParse({ ...VALID, city: "" }).success).toBe(false);
    expect(QuoteFormSchema.safeParse({ ...VALID, department: " " }).success).toBe(false);
  });

  it("notas: acepta hasta 500, rechaza 501, vacío → undefined", () => {
    expect(QuoteFormSchema.safeParse({ ...VALID, notes: "x".repeat(500) }).success).toBe(true);
    expect(QuoteFormSchema.safeParse({ ...VALID, notes: "x".repeat(501) }).success).toBe(false);
    const vacio = QuoteFormSchema.safeParse({ ...VALID, notes: "" });
    expect(vacio.success).toBe(true);
    if (vacio.success) expect(vacio.data.notes).toBeUndefined();
  });
});
