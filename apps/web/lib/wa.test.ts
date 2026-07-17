/*
 * Tests de lib/wa.ts — construcción de URLs wa.me con mensaje pre-armado.
 *
 * FOCO: buildWhatsAppUrl / buildWhatsAppMessage / getWhatsAppNumber.
 *   - número desde env (NEXT_PUBLIC_WA_NUMBER) con fallback hardcoded
 *   - encoding correcto del mensaje (encodeURIComponent)
 *   - plantillas contextuales por kind (product, personalize, support,
 *     order, wholesale, custom) + interpolación de {placeholders}
 *   - override de plantilla desde el CMS
 *   - casos de seguridad: inyección de querystring, control chars, etc.
 *
 * El módulo es DB-coupled SOLO transitivamente (lee del CMS vía
 * getSettingValue → prisma). En producción el CMS degrada con gracia
 * (try/catch → fallback). Aquí mockeamos @/lib/cms en el borde para
 * que el test sea puro y determinístico, sin necesidad de DB.
 *
 * Por defecto el mock devuelve el `fallback` que recibe → ejercita las
 * plantillas hardcoded reales del módulo. Tests específicos sobreescriben
 * la implementación para simular un setting configurado en DB.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock del borde CMS. Por defecto: setting ausente → devuelve el fallback.
const getSettingValue = vi.fn(async (_key: string, fallback: string): Promise<string> => fallback);
vi.mock("@/lib/cms", () => ({
  getSettingValue: (key: string, fallback: string) => getSettingValue(key, fallback),
}));

import {
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  getWhatsAppNumber,
  type WhatsAppContext,
} from "./wa";

const FALLBACK_NUMBER = "573208873826";

beforeEach(() => {
  // Reset al comportamiento por defecto (fallback) antes de cada test.
  getSettingValue.mockReset();
  getSettingValue.mockImplementation(async (_key: string, fallback: string) => fallback);
});

describe("getWhatsAppNumber", () => {
  const original = process.env.NEXT_PUBLIC_WA_NUMBER;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_WA_NUMBER;
    else process.env.NEXT_PUBLIC_WA_NUMBER = original;
  });

  it("devuelve el número de NEXT_PUBLIC_WA_NUMBER cuando está seteado", () => {
    process.env.NEXT_PUBLIC_WA_NUMBER = "573001234567";
    expect(getWhatsAppNumber()).toBe("573001234567");
  });

  it("cae al fallback hardcoded cuando la env var no existe", () => {
    delete process.env.NEXT_PUBLIC_WA_NUMBER;
    expect(getWhatsAppNumber()).toBe(FALLBACK_NUMBER);
  });

  it("cae al fallback cuando la env var es string vacío (|| falsy)", () => {
    process.env.NEXT_PUBLIC_WA_NUMBER = "";
    expect(getWhatsAppNumber()).toBe(FALLBACK_NUMBER);
  });
});

describe("buildWhatsAppMessage — plantillas fallback (setting ausente)", () => {
  it("product: interpola productName y sku", async () => {
    const msg = await buildWhatsAppMessage({
      kind: "product",
      productName: "Imán Corazón",
      sku: "MAG-001",
    });
    expect(msg).toBe('Hola Lucams 👋 Quiero saber más sobre "Imán Corazón" (SKU MAG-001).');
  });

  it("product: consulta el setting WA_MSG_PRODUCT con su fallback", async () => {
    await buildWhatsAppMessage({ kind: "product", productName: "X", sku: "Y" });
    expect(getSettingValue).toHaveBeenCalledWith(
      "WA_MSG_PRODUCT",
      'Hola Lucams 👋 Quiero saber más sobre "{productName}" (SKU {sku}).',
    );
  });

  it("personalize: interpola productName y sku con copia de personalización", async () => {
    const msg = await buildWhatsAppMessage({
      kind: "personalize",
      productName: "Set Nevera",
      sku: "SET-09",
    });
    expect(msg).toBe(
      'Hola Lucams 👋 Quiero personalizar "Set Nevera" (SKU SET-09). Te paso fotos y referencias por aquí ✨',
    );
  });

  it("support sin subject: usa plantilla genérica (key WA_MSG_SUPPORT)", async () => {
    const msg = await buildWhatsAppMessage({ kind: "support" });
    expect(msg).toBe("Hola Lucams 👋 Tengo una consulta y quería hablar por aquí.");
    expect(getSettingValue).toHaveBeenCalledWith(
      "WA_MSG_SUPPORT",
      "Hola Lucams 👋 Tengo una consulta y quería hablar por aquí.",
    );
  });

  it("support con subject: usa plantilla con subject (key WA_MSG_SUPPORT_SUBJECT)", async () => {
    const msg = await buildWhatsAppMessage({ kind: "support", subject: "envío demorado" });
    expect(msg).toBe("Hola Lucams 👋 Tengo una consulta sobre: envío demorado");
    expect(getSettingValue).toHaveBeenCalledWith(
      "WA_MSG_SUPPORT_SUBJECT",
      "Hola Lucams 👋 Tengo una consulta sobre: {subject}",
    );
  });

  it("support con subject vacío ('') → rama genérica (string vacío es falsy)", async () => {
    const msg = await buildWhatsAppMessage({ kind: "support", subject: "" });
    expect(msg).toBe("Hola Lucams 👋 Tengo una consulta y quería hablar por aquí.");
    expect(getSettingValue).toHaveBeenCalledWith("WA_MSG_SUPPORT", expect.any(String));
  });

  it("order: interpola orderNumber", async () => {
    const msg = await buildWhatsAppMessage({ kind: "order", orderNumber: "LS-2026-0042" });
    expect(msg).toBe("Hola Lucams 👋 Quiero consultar el estado de mi pedido LS-2026-0042.");
  });

  it("wholesale: plantilla fija sin interpolación", async () => {
    const msg = await buildWhatsAppMessage({ kind: "wholesale" });
    expect(msg).toBe(
      "Hola Lucams 👋 Estoy interesado/a en pedido al por mayor / corporativo. ¿Me puedes contar?",
    );
    expect(getSettingValue).toHaveBeenCalledWith("WA_MSG_WHOLESALE", expect.any(String));
  });

  it("custom: devuelve el texto tal cual, SIN consultar el CMS", async () => {
    const msg = await buildWhatsAppMessage({ kind: "custom", text: "mensaje libre 123" });
    expect(msg).toBe("mensaje libre 123");
    expect(getSettingValue).not.toHaveBeenCalled();
  });
});

describe("buildWhatsAppMessage — override desde CMS", () => {
  it("usa la plantilla configurada en DB e interpola sobre ella", async () => {
    getSettingValue.mockImplementation(async (key: string, fallback: string) =>
      key === "WA_MSG_PRODUCT" ? "Hey! Me interesa {productName} ({sku}) 🛒" : fallback,
    );
    const msg = await buildWhatsAppMessage({
      kind: "product",
      productName: "Llavero Foto",
      sku: "LL-77",
    });
    expect(msg).toBe("Hey! Me interesa Llavero Foto (LL-77) 🛒");
  });

  it("override sin placeholders: devuelve la plantilla literal", async () => {
    getSettingValue.mockImplementation(async () => "Texto plano sin variables");
    const msg = await buildWhatsAppMessage({ kind: "order", orderNumber: "X-1" });
    expect(msg).toBe("Texto plano sin variables");
  });
});

describe("buildWhatsAppMessage — interpolación (bordes)", () => {
  it("deja el placeholder intacto si la variable no existe en vars", async () => {
    // Plantilla con {desconocido} que el módulo no conoce → se preserva.
    getSettingValue.mockImplementation(async () => "{productName} — {desconocido}");
    const msg = await buildWhatsAppMessage({ kind: "product", productName: "Foo", sku: "B" });
    expect(msg).toBe("Foo — {desconocido}");
  });

  it("interpola múltiples ocurrencias del mismo placeholder", async () => {
    getSettingValue.mockImplementation(async () => "{sku} y de nuevo {sku}");
    const msg = await buildWhatsAppMessage({ kind: "product", productName: "x", sku: "AB-1" });
    expect(msg).toBe("AB-1 y de nuevo AB-1");
  });

  it("NO interpola llaves con espacios o caracteres no-\\w (regex \\{(\\w+)\\})", async () => {
    getSettingValue.mockImplementation(async () => "{ sku } {sku-x} {productName}");
    const msg = await buildWhatsAppMessage({ kind: "product", productName: "P", sku: "S" });
    // Solo {productName} matchea \w+; "{ sku }" y "{sku-x}" quedan literales.
    expect(msg).toBe("{ sku } {sku-x} P");
  });

  it("valores con caracteres especiales se insertan crudos (sin escapar) en el mensaje", async () => {
    const msg = await buildWhatsAppMessage({
      kind: "product",
      productName: 'A & B "C" {x}',
      sku: "S?1",
    });
    expect(msg).toBe('Hola Lucams 👋 Quiero saber más sobre "A & B "C" {x}" (SKU S?1).');
  });

  it("string vacío como valor sigue siendo interpolado (no es 'ausente')", async () => {
    const msg = await buildWhatsAppMessage({ kind: "order", orderNumber: "" });
    expect(msg).toBe("Hola Lucams 👋 Quiero consultar el estado de mi pedido .");
  });
});

describe("buildWhatsAppUrl — construcción y encoding", () => {
  const original = process.env.NEXT_PUBLIC_WA_NUMBER;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_WA_NUMBER;
    else process.env.NEXT_PUBLIC_WA_NUMBER = original;
  });

  it("usa el número del env y codifica el mensaje", async () => {
    process.env.NEXT_PUBLIC_WA_NUMBER = "573001234567";
    const url = await buildWhatsAppUrl({
      kind: "product",
      productName: "Imán Corazón",
      sku: "MAG-001",
    });
    expect(url).toBe(
      "https://wa.me/573001234567?text=" +
        "Hola%20Lucams%20%F0%9F%91%8B%20Quiero%20saber%20m%C3%A1s%20sobre%20" +
        "%22Im%C3%A1n%20Coraz%C3%B3n%22%20(SKU%20MAG-001).",
    );
  });

  it("usa el fallback number cuando el env no está seteado", async () => {
    delete process.env.NEXT_PUBLIC_WA_NUMBER;
    const url = await buildWhatsAppUrl({ kind: "wholesale" });
    expect(url.startsWith(`https://wa.me/${FALLBACK_NUMBER}?text=`)).toBe(true);
  });

  it("opts.number tiene prioridad sobre el env var", async () => {
    process.env.NEXT_PUBLIC_WA_NUMBER = "573001234567";
    const url = await buildWhatsAppUrl({ kind: "wholesale" }, { number: "573009998888" });
    expect(url.startsWith("https://wa.me/573009998888?text=")).toBe(true);
  });

  it("el emoji 👋 se codifica como %F0%9F%91%8B (UTF-8 4 bytes)", async () => {
    const url = await buildWhatsAppUrl({ kind: "support" });
    expect(url).toContain("%F0%9F%91%8B");
    // y NO debe contener el emoji crudo en la URL final.
    expect(url).not.toContain("👋");
  });

  it("acentos se codifican (más → m%C3%A1s, ñ → %C3%B1)", async () => {
    const url = await buildWhatsAppUrl({ kind: "support" });
    // "quería" contiene í → %C3%AD ; "consulta" no, pero el espacio sí → %20
    expect(url).toContain("quer%C3%ADa");
    expect(url).toContain("%20");
  });

  it("el querystring solo contiene el parámetro text (un único '?')", async () => {
    const url = await buildWhatsAppUrl({ kind: "wholesale" });
    expect(url.split("?")).toHaveLength(2);
    expect(url).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
  });
});

describe("buildWhatsAppUrl — seguridad / inyección", () => {
  it("un '&' en el mensaje NO crea un segundo parámetro (se codifica como %26)", async () => {
    const url = await buildWhatsAppUrl({
      kind: "custom",
      text: "hola&utm_source=evil=1",
    });
    expect(url).toContain("%26");
    expect(url).toContain("%3D"); // '=' codificado
    // Sigue siendo un solo querystring; no aparece "&" crudo.
    expect(url.split("&")).toHaveLength(1);
    expect(url).toBe("https://wa.me/" + getWhatsAppNumber() + "?text=hola%26utm_source%3Devil%3D1");
  });

  it("'#' en el mensaje se codifica (%23), no genera un fragment", async () => {
    const url = await buildWhatsAppUrl({ kind: "custom", text: "a#fragmento" });
    expect(url).toContain("%23");
    expect(url).not.toContain("#");
  });

  it("saltos de línea / tabs / control chars se codifican (%0A, %09)", async () => {
    const url = await buildWhatsAppUrl({ kind: "custom", text: "linea1\nlinea2\ttab" });
    expect(url).toContain("%0A");
    expect(url).toContain("%09");
    expect(url).not.toMatch(/[\n\t]/);
  });

  it("intento de cambiar de URL con '?' adicional queda neutralizado (%3F)", async () => {
    const url = await buildWhatsAppUrl({ kind: "custom", text: "x?evil=1" });
    expect(url.split("?")).toHaveLength(2); // sigue habiendo un solo '?' real
    expect(url).toContain("%3F");
  });

  it("número provisto por opts se concatena tal cual (no se valida ni sanitiza)", async () => {
    // Documenta el comportamiento ACTUAL: el número no se valida. El caller
    // es responsable de pasar dígitos. Ver bugsFound/notes.
    const url = await buildWhatsAppUrl({ kind: "wholesale" }, { number: "no-es-numero/../x" });
    expect(url.startsWith("https://wa.me/no-es-numero/../x?text=")).toBe(true);
  });
});

describe("buildWhatsAppUrl — cobertura de todos los kinds (round-trip decode)", () => {
  const cases: { ctx: WhatsAppContext; expectedDecoded: string }[] = [
    {
      ctx: { kind: "product", productName: "P1", sku: "S1" },
      expectedDecoded: 'Hola Lucams 👋 Quiero saber más sobre "P1" (SKU S1).',
    },
    {
      ctx: { kind: "personalize", productName: "P2", sku: "S2" },
      expectedDecoded:
        'Hola Lucams 👋 Quiero personalizar "P2" (SKU S2). Te paso fotos y referencias por aquí ✨',
    },
    {
      ctx: { kind: "support" },
      expectedDecoded: "Hola Lucams 👋 Tengo una consulta y quería hablar por aquí.",
    },
    {
      ctx: { kind: "order", orderNumber: "O-9" },
      expectedDecoded: "Hola Lucams 👋 Quiero consultar el estado de mi pedido O-9.",
    },
    {
      ctx: { kind: "wholesale" },
      expectedDecoded:
        "Hola Lucams 👋 Estoy interesado/a en pedido al por mayor / corporativo. ¿Me puedes contar?",
    },
    { ctx: { kind: "custom", text: "libre" }, expectedDecoded: "libre" },
  ];

  it.each(cases)(
    "kind=$ctx.kind → text decodificado coincide",
    async ({ ctx, expectedDecoded }) => {
      const url = await buildWhatsAppUrl(ctx);
      const text = url.slice(url.indexOf("?text=") + "?text=".length);
      expect(decodeURIComponent(text)).toBe(expectedDecoded);
    },
  );
});
