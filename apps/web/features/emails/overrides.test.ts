/*
 * Test PURO del helper de overrides de plantillas de email
 * (features/emails/overrides.ts — Fase 4, feedback Lucy 2026-09-18).
 *
 * FOCO: el wrapper withOverrides post-procesa {subject, html} aplicando los
 * overrides de EmailTemplateOverride (SUBJECT / PREHEADER / HEADING) con
 * fallback TOTAL al copy base: sin filas en DB o DB caída → el resultado es
 * idéntico al de la plantilla cruda. También se cubre la interpolación de
 * tokens {campo}, el reemplazo del div oculto de preheader y del primer <h1>,
 * y los extractores que usa el admin para mostrar el texto actual.
 *
 * Estrategia: UNIT PURO, offline. @/lib/db se mockea (prisma.emailTemplateOverride
 * .findMany) y @/lib/cms se mockea igual que en templates.test.ts (el layout lo
 * importa para los settings del footer). La capa unstable_cache degrada sola al
 * invariante E469 de Next 16 (sin incrementalCache en vitest → ejecuta crudo),
 * así que el mock de prisma es lo único que manda.
 */

import { describe, expect, it, vi } from "vitest";

process.env.NEXT_PUBLIC_SITE_URL = "https://lucamsshop.com";

vi.mock("@/lib/cms", () => ({
  getSettingValue: vi.fn(async (_key: string, fallback: string) => fallback),
  getCmsBlock: vi.fn(async () => null),
}));

// DB mockeada: por defecto SIN overrides (la prueba del fallback). Los tests
// de aplicación lo pisan con mockResolvedValue. vi.hoisted porque vi.mock se
// iza por encima de las declaraciones del archivo.
const { findMany } = vi.hoisted(() => ({
  findMany: vi.fn(async () => [] as Array<{ key: string; value: string }>),
}));
vi.mock("@/lib/db", () => ({
  prisma: { emailTemplateOverride: { findMany } },
}));

import {
  extractHeading,
  extractPreheader,
  getEmailOverride,
  interpolateOverrideTokens,
  replaceHeading,
  replacePreheader,
  withOverrides,
} from "./overrides";
import { renderEmailLayout } from "./layout";

/** Render mínimo de plantilla para envolver: subject + layout con preview y h1. */
async function baseRender(data: { orderNumber: string }) {
  return {
    subject: `Pedido ${data.orderNumber} confirmado 🎉`,
    html: await renderEmailLayout({
      preview: `Tu pedido ${data.orderNumber} ya está en preparación.`,
      bodyHtml: `<h1 style="margin:0;">¡Tu pedido está confirmado! 🎉</h1><p>Hola.</p>`,
    }),
    text: `Pedido ${data.orderNumber} confirmado`,
  };
}

describe("interpolateOverrideTokens", () => {
  it("reemplaza tokens {campo} con escalares string/number del data", () => {
    expect(
      interpolateOverrideTokens("Pedido {orderNumber} de {customerName}", {
        orderNumber: "LCM-2026-1042",
        customerName: "Camila",
        total: 8_990_000,
      }),
    ).toBe("Pedido LCM-2026-1042 de Camila");
    expect(interpolateOverrideTokens("Total {total}", { total: 8_990_000 })).toBe("Total 8990000");
  });

  it("token desconocido o no escalar queda LITERAL (visible para el admin)", () => {
    expect(interpolateOverrideTokens("Pedido {inexistente}", { orderNumber: "X" })).toBe(
      "Pedido {inexistente}",
    );
    expect(interpolateOverrideTokens("Items {items}", { items: [{ name: "a" }] })).toBe(
      "Items {items}",
    );
  });

  it("data null/undefined → template intacto", () => {
    expect(interpolateOverrideTokens("Hola {x}", null)).toBe("Hola {x}");
  });
});

describe("replacePreheader / extractPreheader", () => {
  it("reemplaza el contenido del div oculto de preview y lo extrae de vuelta", async () => {
    const html = await renderEmailLayout({
      preview: "Preview original.",
      bodyHtml: "<p>cuerpo</p>",
    });
    expect(extractPreheader(html)).toBe("Preview original.");

    const out = replacePreheader(html, "Preview editado por Lucy");
    expect(out).toContain("Preview editado por Lucy");
    expect(out).not.toContain("Preview original.");
    expect(extractPreheader(out)).toBe("Preview editado por Lucy");
  });

  it("escapa HTML en el preheader (un override no inyecta markup)", async () => {
    const html = await renderEmailLayout({ preview: "x", bodyHtml: "<p>c</p>" });
    const out = replacePreheader(html, 'baja <b>"aquí"</b>');
    expect(out).toContain("baja &lt;b&gt;&quot;aquí&quot;&lt;/b&gt;");
    expect(extractPreheader(out)).toBe('baja <b>"aquí"</b>');
  });

  it("sin div de preview (template sin preview) → html intacto y extractPreheader null", async () => {
    const html = await renderEmailLayout({ bodyHtml: "<p>sin preview</p>" });
    expect(replacePreheader(html, "nada")).toBe(html);
    expect(extractPreheader(html)).toBeNull();
  });
});

describe("replaceHeading / extractHeading", () => {
  it("reemplaza solo el contenido del primer <h1>, conservando sus estilos inline", async () => {
    const html = await renderEmailLayout({
      bodyHtml: `<h1 style="margin:0;color:#3D2E5C;">Titular original</h1><h1>segundo</h1>`,
    });
    expect(extractHeading(html)).toBe("Titular original");

    const out = replaceHeading(html, "Titular editado");
    expect(out).toContain('<h1 style="margin:0;color:#3D2E5C;">Titular editado</h1>');
    // Solo el PRIMERO: el segundo h1 queda intacto.
    expect(out).toContain("<h1>segundo</h1>");
    expect(extractHeading(out)).toBe("Titular editado");
  });

  it("sin <h1> → html intacto y extractHeading null", async () => {
    const html = await renderEmailLayout({ bodyHtml: "<p>sin h1</p>" });
    expect(replaceHeading(html, "nada")).toBe(html);
    expect(extractHeading(html)).toBeNull();
  });
});

describe("getEmailOverride — fallback", () => {
  it("sin fila en DB → devuelve el fallback (texto base del código)", async () => {
    findMany.mockResolvedValue([]);
    expect(await getEmailOverride("order-confirmation", "SUBJECT", "Asunto base")).toBe(
      "Asunto base",
    );
  });

  it("DB caída (findMany rechaza) → fallback, NUNCA lanza", async () => {
    findMany.mockRejectedValueOnce(new Error("pooler down"));
    await expect(getEmailOverride("order-confirmation", "SUBJECT", "Asunto base")).resolves.toBe(
      "Asunto base",
    );
  });

  it("fila con la key pedida → su valor; fila vacía → fallback", async () => {
    findMany.mockResolvedValueOnce([{ key: "SUBJECT", value: "Asunto editado" }]);
    expect(await getEmailOverride("order-confirmation", "SUBJECT", "Asunto base")).toBe(
      "Asunto editado",
    );
    findMany.mockResolvedValueOnce([{ key: "SUBJECT", value: "   " }]);
    expect(await getEmailOverride("order-confirmation", "SUBJECT", "Asunto base")).toBe(
      "Asunto base",
    );
  });
});

describe("withOverrides", () => {
  it("sin overrides → resultado IDÉNTICO al render base (fallback total)", async () => {
    findMany.mockResolvedValue([]);
    const wrapped = withOverrides("order-confirmation", baseRender);
    const [base, out] = await Promise.all([
      baseRender({ orderNumber: "LCM-2026-1042" }),
      wrapped({ orderNumber: "LCM-2026-1042" }),
    ]);
    expect(out).toEqual(base);
  });

  it("override SUBJECT se aplica con tokens interpolados", async () => {
    findMany.mockResolvedValue([{ key: "SUBJECT", value: "Tu pedido {orderNumber} ya va 💜" }]);
    const wrapped = withOverrides("order-shipped", baseRender);
    const out = await wrapped({ orderNumber: "LCM-2026-1042" });
    expect(out.subject).toBe("Tu pedido LCM-2026-1042 ya va 💜");
    // El html no se toca si solo hay SUBJECT.
    expect(out.html).toContain("¡Tu pedido está confirmado! 🎉");
    expect(out.html).toContain("Tu pedido LCM-2026-1042 ya está en preparación.");
  });

  it("override PREHEADER reemplaza el texto del preview pane", async () => {
    findMany.mockResolvedValue([{ key: "PREHEADER", value: "Preview nuevo {orderNumber}" }]);
    const wrapped = withOverrides("order-shipped", baseRender);
    const out = await wrapped({ orderNumber: "LCM-2026-1042" });
    expect(extractPreheader(out.html)).toBe("Preview nuevo LCM-2026-1042");
    expect(out.subject).toBe("Pedido LCM-2026-1042 confirmado 🎉"); // intacto
  });

  it("override HEADING reemplaza el titular principal", async () => {
    findMany.mockResolvedValue([{ key: "HEADING", value: "¡Listo, va en camino! 🚚" }]);
    const wrapped = withOverrides("order-shipped", baseRender);
    const out = await wrapped({ orderNumber: "LCM-2026-1042" });
    expect(extractHeading(out.html)).toBe("¡Listo, va en camino! 🚚");
    expect(out.html).not.toContain("¡Tu pedido está confirmado! 🎉");
  });

  it("replyTo y text se conservan intactos al post-procesar", async () => {
    findMany.mockResolvedValue([{ key: "SUBJECT", value: "Editado" }]);
    const wrapped = withOverrides(
      "support-ticket-internal",
      async (data: { orderNumber: string }) => ({
        ...(await baseRender(data)),
        replyTo: "cliente@example.com",
      }),
    );
    const out = await wrapped({ orderNumber: "X" });
    expect(out.replyTo).toBe("cliente@example.com");
    expect(out.text).toBe("Pedido X confirmado");
  });
});
