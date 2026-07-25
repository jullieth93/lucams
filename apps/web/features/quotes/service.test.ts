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

import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  token: "abc123token",
  customerName: "Lucía Pérez",
  total: 45_000, // centavos → $ 450
  items: [
    { productName: "Imán Corazón", variantName: "Set 6", quantity: 2, unitPrice: 15_000 },
    { productName: "Llavero Foto", variantName: "Default", quantity: 1, unitPrice: 15_000 },
  ],
};

describe("buildQuoteWhatsAppUrl", () => {
  beforeAll(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://lucamsshop.com");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("arma el wa.me con número, items con cantidades, total COP y nombre (plantilla fallback)", async () => {
    process.env.NEXT_PUBLIC_WA_NUMBER = "573001234567";
    const url = await buildQuoteWhatsAppUrl(QUOTE);
    expect(url.startsWith("https://wa.me/573001234567?text=")).toBe(true);

    const text = decodeURIComponent(url.slice(url.indexOf("?text=") + "?text=".length));
    expect(text).toContain("COT-ABC234");
    expect(text).toContain("Lucía Pérez");
    // Items con el nombre en *negrita* (formato de WhatsApp): "• 2× *Imán Corazón* (Set 6) — $ 300".
    expect(text).toContain("2× *Imán Corazón* (Set 6)");
    // La variante interna "Default" NO se muestra.
    expect(text).toContain("1× *Llavero Foto* —");
    expect(text).not.toContain("Default");
    // Total en negrita, formateado COP ($ 450 para 45_000 centavos).
    expect(text).toMatch(/\*Total: \$\s*450\*/);
    // Incluye el link público de la cotización sobre el dominio canónico.
    expect(text).toContain("https://lucamsshop.com/cotizacion/abc123token");
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

// ───────────────── buildQuoteWhatsAppUrl — cota de longitud ────────────────
//
// Un carrito grande generaba una URL wa.me larguísima. Chrome no lanza URLs de protocolo de
// aplicación (`whatsapp://`, a donde deriva wa.me) de más de 2046 caracteres: el cliente pulsaba
// el botón y no pasaba nada (Microsoft, "URL Length Limits", IEInternals 2014-08-13, archivado en
// Microsoft Learn). Como el total va al FINAL de la plantilla, un truncado se lo llevaba justo a
// él. Estos tests fijan el techo y el degradado con el link público.

/** Carrito de n ítems con nombres de largo realista ("Imán 07 oooo..."). */
function bigQuote(n: number, nameLen = 20) {
  return {
    ...QUOTE,
    items: Array.from({ length: n }, (_, i) => ({
      productName: `Imán ${String(i).padStart(2, "0")} ${"o".repeat(Math.max(0, nameLen - 8))}`,
      variantName: "Set 6",
      quantity: 3,
      unitPrice: 15_000,
    })),
  };
}

/**
 * Peor caso del percent-encoding: nombres larguísimos y llenos de tildes (cada "á" ocupa 6
 * caracteres ya codificada, así que pocos ítems inflan la URL como muchos).
 */
function accentedQuote(n: number) {
  return {
    ...QUOTE,
    items: Array.from({ length: n }, (_, i) => ({
      productName: `Imán ${String(i).padStart(2, "0")} ${"á".repeat(300)}`,
      variantName: "Set 6",
      quantity: 3,
      unitPrice: 15_000,
    })),
  };
}

/** Texto decodificado del parámetro `text` de la URL wa.me. */
function waText(url: string): string {
  return decodeURIComponent(url.slice(url.indexOf("?text=") + "?text=".length));
}

describe("buildQuoteWhatsAppUrl — cota de longitud del mensaje", () => {
  beforeAll(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://lucamsshop.com");
    process.env.NEXT_PUBLIC_WA_NUMBER = "573001234567";
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("un carrito de 30 ítems NO pasa de 2000 caracteres de URL", async () => {
    const url = await buildQuoteWhatsAppUrl(bigQuote(30));
    expect(url.length).toBeLessThanOrEqual(2000);
  });

  it("conserva SIEMPRE número, total y link aunque recorte los ítems", async () => {
    const text = waText(await buildQuoteWhatsAppUrl(bigQuote(30)));
    expect(text).toContain("COT-ABC234");
    expect(text).toMatch(/Total: \$\s*450/);
    expect(text).toContain("https://lucamsshop.com/cotizacion/abc123token");
  });

  it("detalla los primeros ítems y resume el resto con el link público", async () => {
    const text = waText(await buildQuoteWhatsAppUrl(bigQuote(30)));
    const detailed = text.split("\n").filter((l) => l.startsWith("•"));
    expect(detailed).toHaveLength(8);
    // El primero sí está detallado; el número 9 en adelante, no.
    expect(text).toContain("Imán 00");
    expect(text).not.toContain("Imán 08");
    expect(text).toContain(
      "…y 22 productos más — mira el detalle aquí: https://lucamsshop.com/cotizacion/abc123token",
    );
  });

  it("un carrito que cabe entero NO gana línea de resumen (sin degradar de más)", async () => {
    const text = waText(await buildQuoteWhatsAppUrl(bigQuote(8)));
    expect(text.split("\n").filter((l) => l.startsWith("•"))).toHaveLength(8);
    expect(text).not.toContain("productos más");
    expect(text).toContain("Imán 07");
  });

  it("con un solo producto omitido usa singular ('1 producto más')", async () => {
    const text = waText(await buildQuoteWhatsAppUrl(bigQuote(9)));
    expect(text).toContain("…y 1 producto más — mira el detalle aquí:");
    expect(text).not.toContain("1 productos más");
  });

  it("nombres patológicos: corta por caracteres, no solo por cantidad de ítems", async () => {
    // 6 ítems (bajo el tope de 8), pero cada nombre codificado pesa como cinco normales.
    const url = await buildQuoteWhatsAppUrl(accentedQuote(6));
    const text = waText(url);
    expect(url.length).toBeLessThanOrEqual(2000);
    expect(text.split("\n").filter((l) => l.startsWith("•")).length).toBeLessThan(6);
    expect(text).toContain("productos más — mira el detalle aquí:");
    expect(text).toMatch(/Total: \$\s*450/);
  });

  it("un único ítem de nombre gigante se detalla igual, con el nombre recortado y su precio", async () => {
    const url = await buildQuoteWhatsAppUrl(accentedQuote(1));
    const text = waText(url);
    const [line] = text.split("\n").filter((l) => l.startsWith("•"));
    expect(url.length).toBeLessThanOrEqual(2000);
    expect(line).toContain("…"); // nombre recortado
    expect(line).toMatch(/— \$\s*450$/); // el precio de la línea sobrevive al recorte
    expect(text).not.toContain("productos más");
  });
});

// ─────────────────────────── QuoteFormSchema ───────────────────────────────

const VALID = {
  customerName: "Lucía Pérez",
  customerWhatsapp: "3208873826",
  city: "Bogotá D.C.",
  department: "Bogotá D.C.",
  customerEmail: "lucia@example.com",
};

describe("QuoteFormSchema", () => {
  it("acepta el caso feliz mínimo (sin notas)", () => {
    const r = QuoteFormSchema.safeParse(VALID);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.customerEmail).toBe("lucia@example.com");
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

  // Obligatorio desde 2026-07-25: la cotización se manda por WhatsApp Y por correo, así que sin
  // email el cliente se queda sin copia escrita de lo que cotizó.
  it("email OBLIGATORIO: rechaza vacío y formato inválido, normaliza a minúsculas", () => {
    expect(QuoteFormSchema.safeParse({ ...VALID, customerEmail: "" }).success).toBe(false);
    expect(QuoteFormSchema.safeParse({ ...VALID, customerEmail: "   " }).success).toBe(false);

    const sinCampo = { ...VALID } as Record<string, unknown>;
    delete sinCampo.customerEmail;
    expect(QuoteFormSchema.safeParse(sinCampo).success).toBe(false);

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

/*
 * Regresión (revisión adversarial 2026-07-21): la cota de longitud del mensaje de WhatsApp
 * recortaba el nombre con `slice`, que corta por unidades UTF-16. Un emoji en el borde dejaba
 * media pareja subrogada y `encodeURIComponent` lanzaba `URIError: URI malformed`. El caller
 * (app/cotizacion/[token]/page.tsx) es un server component sin try/catch → la página respondía
 * 500, y para entonces la Quote ya existía y el carrito ya se había vaciado: el cliente quedaba
 * sin poder reintentar ni ver su cotización. Alcanzable de verdad: Product.name admite 120
 * caracteres y la marca usa emoji por todas partes.
 */
describe("truncateForWhatsApp — no parte emojis", () => {
  it("no deja surrogates sueltos con un emoji EXACTAMENTE en el borde del corte", async () => {
    const { truncateForWhatsApp } = await import("./service");
    // 💜 ocupa los índices UTF-16 58-59; el corte viejo (slice(0,59)) lo partía a la mitad.
    const name = `${"a".repeat(58)}\u{1F49C}${"b".repeat(10)}`;

    const out = truncateForWhatsApp(name, 60);

    expect(() => encodeURIComponent(`${out}\n`)).not.toThrow();
    expect(out).not.toMatch(/[\uD800-\uDBFF]$/); // sin high surrogate colgando
    expect(out.endsWith("…")).toBe(true);
  });

  it("no parte secuencias ZWJ (familias, profesiones) al recortar", async () => {
    const { truncateForWhatsApp } = await import("./service");
    const name = `${"a".repeat(58)}\u{1F469}\u{200D}\u{1F467}${"b".repeat(10)}`;

    const out = truncateForWhatsApp(name, 60);

    expect(() => encodeURIComponent(out)).not.toThrow();
    // Con Intl.Segmenter la familia entra completa o no entra; nunca queda la mujer sin la niña.
    expect(out.includes("\u{1F469}") === out.includes("\u{1F467}")).toBe(true);
  });

  it("devuelve el texto intacto cuando cabe (no agrega puntos suspensivos de más)", async () => {
    const { truncateForWhatsApp } = await import("./service");

    expect(truncateForWhatsApp("Imán Corazón 💜", 60)).toBe("Imán Corazón 💜");
  });
});

describe("truncateForWhatsApp — respaldo sin Intl.Segmenter", () => {
  it("sin Segmenter recorta por code points, que ya basta para no partir un emoji", async () => {
    // Runtimes viejos o builds sin ICU completo no traen Intl.Segmenter. El respaldo usa
    // Array.from (itera por code points): no preserva secuencias ZWJ, pero sí evita el
    // URIError, que es lo que tumbaba la página.
    // `Intl.Segmenter` es readonly para TS; se manipula vía el objeto para simular un runtime
    // sin ICU completo (donde la propiedad sencillamente no existe).
    const intl = Intl as unknown as Record<string, unknown>;
    const original = intl.Segmenter;
    delete intl.Segmenter;
    try {
      vi.resetModules();
      const { truncateForWhatsApp } = await import("./service");
      const name = `${"a".repeat(58)}\u{1F49C}${"b".repeat(10)}`;

      const out = truncateForWhatsApp(name, 60);

      expect(() => encodeURIComponent(out)).not.toThrow();
      expect(out).not.toMatch(/[\uD800-\uDBFF]$/);
    } finally {
      intl.Segmenter = original;
      vi.resetModules();
    }
  });
});
