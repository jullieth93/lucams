/*
 * Aviso interno al admin cuando nace una cotización (Etapa 1, modo catálogo).
 *
 * Si el cliente crea la cotización pero NO pulsa "Enviar por WhatsApp", el negocio no se
 * enteraba: la Quote solo era visible entrando a /admin/cotizaciones. Este email cierra
 * ese hueco. La no-duplicación ante retry del cliente y el disparo vía after() se prueban
 * en idempotency.test.ts (la action solo agenda el aviso en la rama "se creó nueva").
 *
 * FOCO:
 *   - quoteAdminNotificationEmail (render puro, CMS mockeado a fallbacks): asunto con
 *     número/nombre/ciudad, ítems con cantidades y precios, total COP formateado, link
 *     absoluto al detalle admin, link wa.me del cliente, notas, variante interna
 *     "Default" oculta y escape de HTML en los datos del cliente.
 *   - sendQuoteAdminNotification (wrapper, Resend mockeado): destinatario ALERT_EMAIL
 *     (fallback hola@lucamsshop.com, misma fuente que el resumen diario), idempotencyKey
 *     derivado del quote id, y un fallo de Resend NUNCA se propaga (fire-and-forget).
 *
 * Ojo con el dinero: formatCOP usa Intl es-CO y emite "$ X.XXX" con ESPACIO DURO U+00A0;
 * las aserciones usan \s en regex (mismo criterio que templates.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() =>
  vi.fn(async (_input: unknown): Promise<unknown> => ({ sent: true, id: "email_1" })),
);
const quoteFindFirst = vi.hoisted(() => vi.fn());
const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/resend", () => ({ sendEmail }));
vi.mock("@/lib/db", () => ({
  prisma: { quote: { findFirst: quoteFindFirst } },
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
// CMS mockeado: setting ausente → fallback (mismo criterio que lib/wa.test.ts). Así el
// destinatario esperado es el fallback documentado y los links salen con SITE_URL fallback.
vi.mock("@/lib/cms", () => ({
  getSettingValue: vi.fn(async (_key: string, fallback: string) => fallback),
}));

import { quoteAdminNotificationEmail } from "@/features/emails/templates/quote-admin-notification";
import { sendQuoteAdminNotification } from "./emails";

const DATA = {
  quoteId: "quote_1",
  quoteNumber: "COT-ABC234",
  customerName: "Lucía Pérez",
  customerWhatsapp: "3001234567",
  customerEmail: "lucia@example.com",
  city: "Bogotá D.C.",
  department: "Bogotá D.C.",
  notes: "Para el sábado",
  total: 45_000, // centavos → $ 450
  items: [
    { productName: "Imán Corazón", variantName: "Set 6", quantity: 2, unitPrice: 15_000 },
    { productName: "Llavero Foto", variantName: "Default", quantity: 1, unitPrice: 15_000 },
  ],
};

/** Fila Quote + items como la devuelve prisma (el wrapper la re-lee por id). */
const QUOTE_ROW = {
  id: DATA.quoteId,
  number: DATA.quoteNumber,
  customerName: DATA.customerName,
  customerWhatsapp: DATA.customerWhatsapp,
  customerEmail: DATA.customerEmail,
  city: DATA.city,
  department: DATA.department,
  notes: DATA.notes,
  total: DATA.total,
  items: DATA.items,
};

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue({ sent: true, id: "email_1" });
  quoteFindFirst.mockResolvedValue(QUOTE_ROW);
});

// ───────────────────── quoteAdminNotificationEmail (render) ─────────────────

describe("quoteAdminNotificationEmail", () => {
  it("asunto con número, nombre y ciudad", async () => {
    const r = await quoteAdminNotificationEmail(DATA);
    expect(r.subject).toBe("Nueva cotización COT-ABC234 — Lucía Pérez (Bogotá D.C.)");
  });

  it("cuerpo con ítems (producto/variante/cantidad/precio), total COP, links y notas", async () => {
    const r = await quoteAdminNotificationEmail(DATA);

    // Ítems con cantidad y precio de línea formateado.
    expect(r.html).toContain("Imán Corazón (Set 6)");
    expect(r.html).toContain("×2");
    // La variante interna "Default" NO se muestra (criterio del storefront y del WhatsApp).
    expect(r.html).toContain("Llavero Foto");
    expect(r.html).not.toContain("Default");
    // Total COP formateado ($ 450 para 45_000 centavos, con espacio duro).
    expect(r.html).toMatch(/Total<\/td>[\s\S]*\$\s*450/);
    // Link absoluto al detalle admin y wa.me del cliente (10 dígitos CO + prefijo 57).
    expect(r.html).toContain("https://lucamsshop.com/admin/cotizaciones/quote_1");
    expect(r.html).toContain("https://wa.me/573001234567");
    // Datos de contacto y notas.
    expect(r.html).toContain("Lucía Pérez");
    expect(r.html).toContain("lucia@example.com");
    expect(r.html).toContain("Para el sábado");
    // Texto plano también lleva ítems y total (deliverability).
    expect(r.text).toContain("Imán Corazón (Set 6) ×2");
    expect(r.text).toMatch(/Total: \$\s*450/);
    expect(r.text).toContain("https://lucamsshop.com/admin/cotizaciones/quote_1");
  });

  it("Reply-To = email del cliente (responderle directo, criterio support-ticket-internal)", async () => {
    const r = await quoteAdminNotificationEmail(DATA);
    expect(r.replyTo).toBe("lucia@example.com");
  });

  it("sin email del cliente: Reply-To undefined (manda EMAIL_REPLY_TO) y se muestra '—'", async () => {
    const r = await quoteAdminNotificationEmail({ ...DATA, customerEmail: null });
    expect(r.replyTo).toBeUndefined();
    expect(r.html).toContain("—");
  });

  it("sin notas no renderiza el bloque de notas", async () => {
    const r = await quoteAdminNotificationEmail({ ...DATA, notes: null });
    expect(r.html).not.toContain("Notas del cliente");
    expect(r.text).not.toContain("Notas del cliente");
  });

  it("escapa el HTML en los datos del cliente (XSS)", async () => {
    const r = await quoteAdminNotificationEmail({
      ...DATA,
      customerName: '<img src=x onerror="alert(1)">',
      notes: "<script>alert(1)</script>",
    });
    expect(r.html).not.toContain("<script>");
    expect(r.html).not.toContain("<img src=x");
    expect(r.html).toContain("&lt;script&gt;");
  });
});

// ─────────────────── sendQuoteAdminNotification (wrapper) ───────────────────

describe("sendQuoteAdminNotification", () => {
  it("envía al ALERT_EMAIL (fallback hola@) con asunto, ítems, total e idempotencyKey del quote id", async () => {
    await sendQuoteAdminNotification("quote_1");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.to).toBe("hola@lucamsshop.com");
    expect(arg.subject).toBe("Nueva cotización COT-ABC234 — Lucía Pérez (Bogotá D.C.)");
    expect(arg.html).toContain("Imán Corazón");
    expect(arg.html).toMatch(/\$\s*450/);
    expect(arg.idempotencyKey).toBe("quote:admin-notification:quote_1");
    expect(arg.replyTo).toBe("lucia@example.com");
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "quote.email.admin_notification.sent", result: "ok" }),
    );
  });

  it("un fallo de Resend NO se propaga: loguea error y resuelve (la cotización ya existe)", async () => {
    sendEmail.mockRejectedValue(new Error("resend caído"));

    await expect(sendQuoteAdminNotification("quote_1")).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "quote.email.admin_notification.fail",
        quoteId: "quote_1",
        err: "resend caído",
      }),
    );
  });

  it("un skip de Resend (circuito abierto, sin API key) tampoco se propaga", async () => {
    sendEmail.mockResolvedValue({ sent: false, reason: "circuit-open", skipped: true });

    await expect(sendQuoteAdminNotification("quote_1")).resolves.toBeUndefined();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ result: "skip:circuit-open" }),
    );
  });

  it("si la cotización no existe no envía nada", async () => {
    quoteFindFirst.mockResolvedValue(null);

    await sendQuoteAdminNotification("quote_ghost");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
