/*
 * Test PURO de las 7 plantillas de email transaccional (features/emails/templates/*).
 *
 * FOCO (render de plantillas): dado un input, el HTML y el texto plano resultantes
 * contienen los datos correctos (número de orden, total formateado en COP, nombre,
 * links, tracking, ticket id), manejan datos opcionales/faltantes sin romper, y
 * ESCAPAN el contenido del usuario para prevenir inyección HTML/XSS.
 *
 * Estrategia: UNIT PURO. Estas plantillas son funciones `async` que devuelven
 * `{ subject, html, text }` (support-internal además `replyTo`). El único efecto
 * externo es `getSettingValue` de `@/lib/cms`, que server-side pega a Prisma/DB
 * detrás de `unstable_cache`. Lo MOCKEAMOS con valores fijos → 100% determinista
 * y OFFLINE (nunca toca la DB ni el pooler de Supabase). Así el test es puro
 * render y no hereda la flakiness del pooler ni depende de datos sembrados.
 *
 * `getSettingValue` se mockea para devolver siempre el mismo SITE_URL/CONTACT_EMAIL/
 * COPYRIGHT_YEAR/COPYRIGHT_TAGLINE, de modo que los links absolutos y el footer
 * sean predecibles. El fallback del template (segundo argumento) se ignora porque
 * el mock siempre resuelve la key — lo cubrimos aparte forzando el fallback.
 *
 * IMPORTANTE sobre el separador de miles/moneda: `formatCOP` usa Intl es-CO y
 * emite "$ X.XXX" (el separador tras el "$" es un ESPACIO DURO U+00A0, no un
 * espacio ASCII). Por eso las aserciones de dinero usan `\s` (que en regex JS sí
 * matchea U+00A0), igual que lo hace lib/format.test.ts. Nunca un espacio literal.
 *
 * DIFERENCIA DE ESCAPE verificada contra la fuente ANTES de fijar aserciones:
 *  - order-confirmation / order-shipped / order-delivered / order-payment-failed
 *    definen su PROPIO `escapeHtml` local que escapa &, <, >, " pero NO la comilla
 *    simple (').
 *  - support-ticket-internal / support-ticket-received usan el `escapeHtml` de
 *    layout.ts, que SÍ escapa también la comilla simple (' → &#39;).
 *  Ambos comportamientos se asertan explícitamente (no se asume uniformidad).
 *
 * Todos los valores esperados (subjects, mapeo de razones de pago, pluralización
 * de días, URLs, ticket short id, encodeURIComponent del unsubscribe) fueron
 * verificados con probes temporales contra el render real antes de escribirse.
 */

import { describe, expect, it, vi } from "vitest";

// El único acoplamiento externo de las plantillas (y del layout) es getSettingValue.
// Lo mockeamos con constantes → render determinista y sin DB.
const SITE_URL = "https://lucamsshop.co";
vi.mock("@/lib/cms", () => ({
  getSettingValue: vi.fn(async (key: string, fallback: string) => {
    switch (key) {
      case "SITE_URL":
        return SITE_URL;
      case "CONTACT_EMAIL":
        return "hola@lucamsshop.co";
      case "COPYRIGHT_YEAR":
        return "2026";
      case "COPYRIGHT_TAGLINE":
        return "Hecho con 💜 en Bogotá";
      default:
        return fallback;
    }
  }),
}));

import { getSettingValue } from "@/lib/cms";
import { orderConfirmationEmail } from "./order-confirmation";
import { orderShippedEmail } from "./order-shipped";
import { orderDeliveredEmail } from "./order-delivered";
import { orderPaymentFailedEmail } from "./order-payment-failed";
import { newsletterWelcomeEmail } from "./newsletter-welcome";
import { supportTicketInternalEmail } from "./support-ticket-internal";
import { supportTicketReceivedEmail } from "./support-ticket-received";
import { designRejectedEmail } from "./design-rejected";

// =============================================================================
// Helpers de fábrica: input mínimo válido por template, con overrides.
// =============================================================================

function ocData(
  overrides: Partial<Parameters<typeof orderConfirmationEmail>[0]> = {},
): Parameters<typeof orderConfirmationEmail>[0] {
  return {
    orderNumber: "LS-1001",
    customerName: "Lucía",
    total: 5_000_000,
    subtotal: 4_500_000,
    shipping: 500_000,
    shippingCarrier: "Coordinadora",
    items: [
      { name: "Imán foto", qty: 2, lineTotal: 3_000_000 },
      { name: "Set kawaii", qty: 1, lineTotal: 1_500_000 },
    ],
    shippingAddress: "Calle 1 #2-3, Bogotá",
    publicTrackingToken: "tok123",
    ...overrides,
  };
}

function shData(
  overrides: Partial<Parameters<typeof orderShippedEmail>[0]> = {},
): Parameters<typeof orderShippedEmail>[0] {
  return {
    orderNumber: "LS-2001",
    customerName: "Andrés",
    carrier: "Servientrega",
    trackingNumber: "TN-99",
    trackingUrl: "https://track.example/99",
    estimatedDays: 3,
    publicTrackingToken: "stok",
    ...overrides,
  };
}

function dlData(
  overrides: Partial<Parameters<typeof orderDeliveredEmail>[0]> = {},
): Parameters<typeof orderDeliveredEmail>[0] {
  return {
    orderNumber: "LS-4001",
    customerName: "Carolina",
    publicTrackingToken: "dtok",
    ...overrides,
  };
}

function pfData(
  overrides: Partial<Parameters<typeof orderPaymentFailedEmail>[0]> = {},
): Parameters<typeof orderPaymentFailedEmail>[0] {
  return {
    orderNumber: "LS-3001",
    customerName: "Diego",
    total: 2_000_000,
    reason: "Insufficient funds",
    publicTrackingToken: null,
    ...overrides,
  };
}

function nwData(
  overrides: Partial<Parameters<typeof newsletterWelcomeEmail>[0]> = {},
): Parameters<typeof newsletterWelcomeEmail>[0] {
  return {
    email: "suscriptor@example.com",
    unsubscribeToken: "unsubtok",
    ...overrides,
  };
}

function stiData(
  overrides: Partial<Parameters<typeof supportTicketInternalEmail>[0]> = {},
): Parameters<typeof supportTicketInternalEmail>[0] {
  return {
    ticketId: "abcdef1234567890",
    customerName: "Elena",
    customerEmail: "elena@example.com",
    subject: "MI_PEDIDO",
    message: "Hola, quiero saber el estado.",
    ip: "200.1.2.3",
    ...overrides,
  };
}

function strData(
  overrides: Partial<Parameters<typeof supportTicketReceivedEmail>[0]> = {},
): Parameters<typeof supportTicketReceivedEmail>[0] {
  return {
    customerName: "Elena",
    ticketId: "abcdef1234567890",
    subject: "MI_PEDIDO",
    message: "Hola, quiero saber el estado.",
    ...overrides,
  };
}

/** Regex de dinero tolerante al espacio duro U+00A0 que emite Intl es-CO. */
function money(pesosWithDots: string): RegExp {
  // pesosWithDots ej. "50.000" → matchea "$<NBSP-o-espacio>50.000"
  return new RegExp("\\$\\s*" + pesosWithDots.replace(/\./g, "\\."));
}

// =============================================================================
// Invariantes transversales del layout: TODAS las plantillas lo comparten.
// =============================================================================
describe("layout compartido — invariantes en las 7 plantillas", () => {
  it("toda plantilla envuelve el body en el documento HTML del layout (doctype + head + footer)", async () => {
    const results = await Promise.all([
      orderConfirmationEmail(ocData()),
      orderShippedEmail(shData()),
      orderDeliveredEmail(dlData()),
      orderPaymentFailedEmail(pfData()),
      newsletterWelcomeEmail(nwData()),
      supportTicketInternalEmail(stiData()),
      supportTicketReceivedEmail(strData()),
    ]);

    for (const r of results) {
      expect(r.html.startsWith("<!doctype html>")).toBe(true);
      expect(r.html).toContain('lang="es-CO"');
      // Marca en el header.
      expect(r.html).toContain("Lucams");
      // Footer con email de contacto y copyright (settings mockeadas).
      expect(r.html).toContain("hola@lucamsshop.co");
      expect(r.html).toContain("© 2026 Lucams_shop");
      // subject/text siempre presentes y no vacíos.
      expect(r.subject.length).toBeGreaterThan(0);
      expect(r.text.length).toBeGreaterThan(0);
    }
  });

  it("solo el newsletter (no transaccional) muestra el link de baja; las transaccionales NO", async () => {
    const nw = await newsletterWelcomeEmail(nwData());
    expect(nw.html).toContain("Cancelar suscripción");

    const transactional = await Promise.all([
      orderConfirmationEmail(ocData()),
      orderShippedEmail(shData()),
      orderDeliveredEmail(dlData()),
      orderPaymentFailedEmail(pfData()),
      supportTicketInternalEmail(stiData()),
      supportTicketReceivedEmail(strData()),
    ]);
    for (const r of transactional) {
      expect(r.html).not.toContain("Cancelar suscripción");
    }
  });

  it("cuando el setting SITE_URL no existe, cae al default 'https://lucamsshop.co' del template", async () => {
    // Simula DB sin el setting: getSettingValue devuelve el fallback que le pasa
    // cada template (segundo argumento). El link absoluto debe usar ese default.
    // Sustituimos la implementación temporalmente y la restauramos en finally
    // para no filtrar el override a los demás tests.
    const mock = vi.mocked(getSettingValue);
    const original = mock.getMockImplementation();
    mock.mockImplementation(async (_key: string, fallback: string) => fallback);
    try {
      const r = await orderConfirmationEmail(ocData({ publicTrackingToken: "T1" }));
      expect(r.html).toContain("https://lucamsshop.co/pedido/T1");
      // El footer también usa el fallback del contacto (hola@lucamsshop.co).
      expect(r.html).toContain("hola@lucamsshop.co");
    } finally {
      mock.mockImplementation(original!);
    }
  });
});

// =============================================================================
// order-confirmation
// =============================================================================
describe("orderConfirmationEmail", () => {
  it("subject lleva el número de orden y el emoji de confirmación", async () => {
    const r = await orderConfirmationEmail(ocData({ orderNumber: "LS-777" }));
    expect(r.subject).toBe("Pedido LS-777 confirmado 🎉");
  });

  it("HTML incluye nombre, número de orden, dirección y cada ítem con su line total", async () => {
    const r = await orderConfirmationEmail(ocData());
    expect(r.html).toContain("Lucía");
    expect(r.html).toContain("LS-1001");
    expect(r.html).toContain("Calle 1 #2-3, Bogotá");
    expect(r.html).toContain("Imán foto");
    expect(r.html).toContain("Set kawaii");
    // line totals de cada ítem ($ 30.000 y $ 15.000).
    expect(r.html).toMatch(money("30.000"));
    expect(r.html).toMatch(money("15.000"));
    // ×qty por ítem.
    expect(r.html).toContain("×2");
    expect(r.html).toContain("×1");
  });

  it("HTML muestra subtotal, envío (con transportadora) y total formateados en COP", async () => {
    const r = await orderConfirmationEmail(ocData());
    expect(r.html).toMatch(money("45.000")); // subtotal
    expect(r.html).toMatch(money("5.000")); // envío
    expect(r.html).toMatch(money("50.000")); // total
    // El nombre de la transportadora aparece junto a "Envío".
    expect(r.html).toContain("Coordinadora");
  });

  it("con cupón muestra la fila 'Descuento −$X' y el desglose cuadra (auditoría v3 · #10)", async () => {
    // subtotal 45.000 + envío 5.000 − descuento 8.000 = total 42.000.
    const r = await orderConfirmationEmail(
      ocData({ subtotal: 4_500_000, shipping: 500_000, discount: 800_000, total: 4_200_000 }),
    );
    expect(r.html).toContain("Descuento");
    expect(r.html).toMatch(money("8.000")); // descuento formateado
    expect(r.html).toContain("−"); // signo menos (U+2212)
    expect(r.text).toContain("Descuento: −");
  });

  it("sin descuento NO muestra la fila de descuento", async () => {
    const r = await orderConfirmationEmail(ocData({ discount: 0 }));
    expect(r.html).not.toContain("Descuento");
    expect(r.text).not.toContain("Descuento");
  });

  it("con publicTrackingToken el CTA apunta a la vista guest /pedido/<token>", async () => {
    const r = await orderConfirmationEmail(ocData({ publicTrackingToken: "TOKENGUEST" }));
    expect(r.html).toContain(`${SITE_URL}/pedido/TOKENGUEST`);
    expect(r.text).toContain(`${SITE_URL}/pedido/TOKENGUEST`);
    // No debe caer al fallback de mi-cuenta cuando hay token.
    expect(r.html).not.toContain("/mi-cuenta/pedidos");
  });

  it("sin publicTrackingToken el CTA cae a /mi-cuenta/pedidos (fallback autenticado)", async () => {
    const r = await orderConfirmationEmail(ocData({ publicTrackingToken: null }));
    expect(r.html).toContain(`${SITE_URL}/mi-cuenta/pedidos`);
    expect(r.text).toContain(`${SITE_URL}/mi-cuenta/pedidos`);
    expect(r.html).not.toContain("/pedido/");
  });

  it("sin transportadora (null) NO agrega el paréntesis de carrier en el label de envío", async () => {
    const r = await orderConfirmationEmail(ocData({ shippingCarrier: null, shipping: 500_000 }));
    // El texto plano queda "Envío: $ 5.000" SIN el paréntesis "(carrier)".
    const envioLine = r.text.split("\n").find((l) => l.startsWith("Envío"));
    expect(envioLine).toMatch(/^Envío:\s\$\s*5\.000$/);
    // No debe haber paréntesis de transportadora en la línea de envío.
    expect(envioLine).not.toContain("(");
    // Y el HTML no inventa un "(null)".
    expect(r.html).not.toContain("(null)");
  });

  it("BORDE: lista de ítems vacía → render válido, sin filas de ítem pero con totales", async () => {
    const r = await orderConfirmationEmail(
      ocData({ items: [], subtotal: 0, shipping: 0, total: 0, shippingCarrier: null }),
    );
    expect(r.html.startsWith("<!doctype html>")).toBe(true);
    // No hay líneas de ítem en el texto (las líneas de ítem empiezan con "  - ").
    const itemLines = r.text.split("\n").filter((l) => l.trim().startsWith("- "));
    expect(itemLines).toHaveLength(0);
    // Totales en $ 0.
    expect(r.html).toMatch(money("0"));
  });

  it("el texto plano refleja los mismos datos que el HTML (nombre, orden, total, dirección)", async () => {
    const r = await orderConfirmationEmail(ocData());
    expect(r.text).toContain("Lucía");
    expect(r.text).toContain("LS-1001");
    expect(r.text).toMatch(money("50.000"));
    expect(r.text).toContain("Calle 1 #2-3, Bogotá");
    expect(r.text).toContain("Imán foto ×2");
  });

  it("preview del layout menciona el total y el estado de preparación", async () => {
    const r = await orderConfirmationEmail(ocData());
    expect(r.html).toContain("ya estamos preparando tu pedido");
    // El preview trae el total formateado.
    expect(r.html).toMatch(money("50.000"));
  });

  it('SEGURIDAD: escapa <, >, & y " en nombre, ítems y dirección en el HTML', async () => {
    const r = await orderConfirmationEmail(
      ocData({
        customerName: 'Ana <b>"x"</b> & Co',
        shippingAddress: "Cra <script>alert(1)</script> & 5",
        items: [{ name: "Imán <foto> & set", qty: 1, lineTotal: 100 }],
      }),
    );
    expect(r.html).toContain("Ana &lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; Co");
    expect(r.html).toContain("Cra &lt;script&gt;alert(1)&lt;/script&gt; &amp; 5");
    expect(r.html).toContain("Imán &lt;foto&gt; &amp; set");
    // No debe quedar el tag crudo ejecutable.
    expect(r.html).not.toContain("<script>alert(1)</script>");
  });

  it("SEGURIDAD: el escape local NO toca la comilla simple (comportamiento verificado)", async () => {
    const r = await orderConfirmationEmail(ocData({ customerName: "O'Brien" }));
    // order-confirmation usa su escapeHtml local (sin '): la comilla queda cruda.
    expect(r.html).toContain("O'Brien");
    expect(r.html).not.toContain("O&#39;Brien");
  });

  it("el texto plano NO escapa HTML (es texto, no markup) — nombre crudo", async () => {
    const r = await orderConfirmationEmail(ocData({ customerName: "Ana <b> & Co" }));
    expect(r.text).toContain("Ana <b> & Co");
  });

  it("IDEMPOTENCIA: mismo input → misma salida byte a byte", async () => {
    const data = ocData();
    const [a, b] = await Promise.all([orderConfirmationEmail(data), orderConfirmationEmail(data)]);
    expect(a).toEqual(b);
  });
});

// =============================================================================
// order-shipped
// =============================================================================
describe("orderShippedEmail", () => {
  it("subject lleva número de orden y emoji de camino", async () => {
    const r = await orderShippedEmail(shData({ orderNumber: "LS-2020" }));
    expect(r.subject).toBe("Tu pedido LS-2020 va en camino 🚚");
  });

  it("HTML incluye nombre, orden, transportadora y número de guía", async () => {
    const r = await orderShippedEmail(shData());
    expect(r.html).toContain("Andrés");
    expect(r.html).toContain("LS-2001");
    expect(r.html).toContain("Servientrega");
    expect(r.html).toContain("TN-99");
  });

  it("con trackingUrl el CTA principal apunta a esa URL de rastreo", async () => {
    const r = await orderShippedEmail(shData({ trackingUrl: "https://track.example/ABC" }));
    expect(r.html).toContain("https://track.example/ABC");
    expect(r.html).toContain("Rastrear mi paquete");
    expect(r.text).toContain("Rastrear: https://track.example/ABC");
  });

  it("sin trackingUrl (null) NO hay botón de rastreo; solo el número de guía en code", async () => {
    const r = await orderShippedEmail(shData({ trackingUrl: null, trackingNumber: "GUIA-XYZ" }));
    expect(r.html).not.toContain("Rastrear mi paquete");
    expect(r.html).toContain("GUIA-XYZ");
    // En el texto plano tampoco aparece la línea "Rastrear:".
    expect(r.text).not.toContain("Rastrear:");
  });

  it("estimatedDays=1 usa singular 'día hábil'", async () => {
    const r = await orderShippedEmail(shData({ estimatedDays: 1 }));
    expect(r.html).toContain("1 día hábil");
    expect(r.html).not.toContain("1 días");
    expect(r.text).toContain("Estimado: 1 día(s) hábil(es)");
  });

  it("estimatedDays>1 usa plural 'días hábiles'", async () => {
    const r = await orderShippedEmail(shData({ estimatedDays: 5 }));
    expect(r.html).toContain("5 días hábiles");
  });

  it("estimatedDays=null omite el bloque de estimado (ni HTML ni texto)", async () => {
    const r = await orderShippedEmail(shData({ estimatedDays: null }));
    expect(r.html).not.toContain("Estimado de entrega");
    expect(r.text).not.toContain("Estimado:");
  });

  it("con publicTrackingToken agrega un CTA secundario a /pedido/<token>", async () => {
    const r = await orderShippedEmail(shData({ publicTrackingToken: "PTOK" }));
    expect(r.html).toContain(`${SITE_URL}/pedido/PTOK`);
    expect(r.html).toContain("Ver mi pedido completo");
  });

  it("sin publicTrackingToken NO agrega el CTA secundario /pedido/", async () => {
    const r = await orderShippedEmail(shData({ publicTrackingToken: null }));
    expect(r.html).not.toContain("/pedido/");
    expect(r.html).not.toContain("Ver mi pedido completo");
  });

  it("preview del layout lleva la guía y la transportadora", async () => {
    const r = await orderShippedEmail(shData({ trackingNumber: "GG1", carrier: "Coordinadora" }));
    expect(r.html).toContain("Guía GG1 · Coordinadora");
  });

  it("SEGURIDAD: escapa carrier / trackingNumber / customerName con markup en el HTML", async () => {
    const r = await orderShippedEmail(
      shData({
        customerName: "X <b>",
        carrier: "Ser & vientrega",
        trackingNumber: "T<N>",
        trackingUrl: null,
      }),
    );
    expect(r.html).toContain("X &lt;b&gt;");
    expect(r.html).toContain("Ser &amp; vientrega");
    expect(r.html).toContain("T&lt;N&gt;");
  });

  it("el texto plano de contacto usa el SITE_URL mockeado", async () => {
    const r = await orderShippedEmail(shData());
    expect(r.text).toContain(`${SITE_URL}/contacto`);
  });
});

// =============================================================================
// order-delivered
// =============================================================================
describe("orderDeliveredEmail", () => {
  it("subject lleva el número de orden y el corazón", async () => {
    const r = await orderDeliveredEmail(dlData({ orderNumber: "LS-4040" }));
    expect(r.subject).toBe("¡Tu pedido LS-4040 llegó! 💜");
  });

  it("HTML incluye nombre, orden y la invitación a dejar reseña", async () => {
    const r = await orderDeliveredEmail(dlData());
    expect(r.html).toContain("Carolina");
    expect(r.html).toContain("LS-4001");
    expect(r.html).toContain("Dejar una reseña");
  });

  it("con publicTrackingToken el CTA de reseña apunta a /pedido/<token>", async () => {
    const r = await orderDeliveredEmail(dlData({ publicTrackingToken: "RTOK" }));
    expect(r.html).toContain(`${SITE_URL}/pedido/RTOK`);
    expect(r.html).not.toContain("/mi-cuenta/pedidos");
  });

  it("sin publicTrackingToken el CTA cae a /mi-cuenta/pedidos", async () => {
    const r = await orderDeliveredEmail(dlData({ publicTrackingToken: null }));
    expect(r.html).toContain(`${SITE_URL}/mi-cuenta/pedidos`);
    expect(r.html).not.toContain("/pedido/");
  });

  it("menciona el derecho de retracto Ley 1480 (5 días hábiles)", async () => {
    const r = await orderDeliveredEmail(dlData());
    expect(r.html).toContain("5 días hábiles de retracto Ley 1480");
  });

  it("SEGURIDAD: escapa el nombre con markup en el HTML", async () => {
    const r = await orderDeliveredEmail(dlData({ customerName: "Caro <img src=x>" }));
    expect(r.html).toContain("Caro &lt;img src=x&gt;");
    expect(r.html).not.toContain("<img src=x>");
  });

  it("el texto plano incluye orden y link de reseña", async () => {
    const r = await orderDeliveredEmail(dlData());
    expect(r.text).toContain("LS-4001");
    expect(r.text).toContain(`${SITE_URL}/mi-cuenta/pedidos`);
  });
});

// =============================================================================
// order-payment-failed
// =============================================================================
describe("orderPaymentFailedEmail", () => {
  it("subject indica que el pago no se procesó, con el número de orden", async () => {
    const r = await orderPaymentFailedEmail(pfData({ orderNumber: "LS-3009" }));
    expect(r.subject).toBe("Tu pago para LS-3009 no se procesó");
  });

  it("HTML incluye nombre, orden y el total formateado en COP", async () => {
    const r = await orderPaymentFailedEmail(pfData({ total: 2_000_000 }));
    expect(r.html).toContain("Diego");
    expect(r.html).toContain("LS-3001");
    expect(r.html).toMatch(money("20.000"));
  });

  it("CTA vuelve al carrito y el texto no cobra nada", async () => {
    const r = await orderPaymentFailedEmail(pfData());
    expect(r.html).toContain(`${SITE_URL}/carrito`);
    expect(r.html).toContain("Volver al carrito");
    expect(r.text).toContain("No te cobramos nada");
  });

  it.each([
    ["Insufficient funds", "tu tarjeta no tiene fondos suficientes"],
    ["No hay fondos", "tu tarjeta no tiene fondos suficientes"],
    ["Card declined", "tu banco rechazó la transacción"],
    ["Fue rechazada", "tu banco rechazó la transacción"],
    ["Card expired", "los datos de tu tarjeta están vencidos"],
    ["Tarjeta vencida", "los datos de tu tarjeta están vencidos"],
    ["Invalid data", "los datos de pago no son válidos"],
    ["Dato inválido", "los datos de pago no son válidos"],
    ["3DS challenge failed", "no se pudo verificar la autenticación de tu banco"],
    ["Fallo de autenticación", "no se pudo verificar la autenticación de tu banco"],
    ["Transaction voided", "la transacción fue anulada"],
    ["Fue anulada", "la transacción fue anulada"],
  ])("mapea la razón técnica %j al mensaje amigable %j", async (reason, friendly) => {
    const r = await orderPaymentFailedEmail(pfData({ reason }));
    expect(r.html).toContain(friendly);
    expect(r.text).toContain(friendly);
  });

  it("razón desconocida cae al mensaje genérico 'el pago no se pudo procesar'", async () => {
    const r = await orderPaymentFailedEmail(pfData({ reason: "quantum flux capacitor" }));
    expect(r.html).toContain("el pago no se pudo procesar");
    // No debe filtrar la razón técnica cruda al cliente.
    expect(r.html).not.toContain("quantum flux capacitor");
  });

  it("el mapeo de razón es case-insensitive (mayúsculas)", async () => {
    const r = await orderPaymentFailedEmail(pfData({ reason: "INSUFFICIENT FUNDS" }));
    expect(r.html).toContain("tu tarjeta no tiene fondos suficientes");
  });

  it("preview del layout incluye el mensaje amigable y sugerencia de reintento", async () => {
    const r = await orderPaymentFailedEmail(pfData({ reason: "declined" }));
    expect(r.html).toContain("tu banco rechazó la transacción · reintenta con otro medio");
  });

  it("SEGURIDAD: escapa el nombre con markup en el HTML", async () => {
    const r = await orderPaymentFailedEmail(pfData({ customerName: "Di <b>ego" }));
    expect(r.html).toContain("Di &lt;b&gt;ego");
  });

  it("BORDE: total=0 se formatea como $ 0 sin romper", async () => {
    const r = await orderPaymentFailedEmail(pfData({ total: 0 }));
    expect(r.html).toMatch(money("0"));
  });
});

// =============================================================================
// newsletter-welcome
// =============================================================================
describe("newsletterWelcomeEmail", () => {
  it("subject es el saludo de bienvenida", async () => {
    const r = await newsletterWelcomeEmail(nwData());
    expect(r.subject).toBe("¡Estás dentro! 💜");
  });

  it("HTML de bienvenida menciona la marca y el CTA al catálogo", async () => {
    const r = await newsletterWelcomeEmail(nwData());
    expect(r.html).toContain("Lucams_shop");
    expect(r.html).toContain(`${SITE_URL}/productos`);
    expect(r.html).toContain("mira el catálogo");
  });

  it("el unsubscribe URL usa el parámetro opaco ?u= (email NO viaja en claro) (v3 · #8)", async () => {
    const email = "a+b@x.co";
    const r = await newsletterWelcomeEmail(nwData({ email, unsubscribeToken: "abc123def" }));
    const u = `${Buffer.from(email).toString("base64url")}.abc123def`;
    expect(r.text).toContain(`${SITE_URL}/unsubscribe?u=${u}`);
    // El email ya NO aparece legible en la URL (ni el param ?email=).
    expect(r.text).not.toContain("/unsubscribe?email=");
    expect(r.text).not.toContain("a%2Bb%40x.co");
  });

  it("el link de baja aparece en el footer del HTML (Ley 1581)", async () => {
    const r = await newsletterWelcomeEmail(nwData());
    expect(r.html).toContain("Cancelar suscripción");
    expect(r.html).toContain("Ley 1581 de 2012");
    // El href del unsubscribe usa el param opaco.
    expect(r.html).toContain("/unsubscribe?u=");
  });

  it("el texto plano termina con el link de baja (param opaco ?u=)", async () => {
    const email = "x@y.co";
    const r = await newsletterWelcomeEmail(nwData({ email, unsubscribeToken: "t1" }));
    const lastLine = r.text.trim().split("\n").pop();
    const u = `${Buffer.from(email).toString("base64url")}.t1`;
    expect(lastLine).toBe(`Cancelar suscripción: ${SITE_URL}/unsubscribe?u=${u}`);
  });

  it("IDEMPOTENCIA: mismo input → misma salida", async () => {
    const data = nwData();
    const [a, b] = await Promise.all([newsletterWelcomeEmail(data), newsletterWelcomeEmail(data)]);
    expect(a).toEqual(b);
  });
});

// =============================================================================
// support-ticket-internal (notificación a la tienda)
// =============================================================================
describe("supportTicketInternalEmail", () => {
  it("subject lleva el label del asunto, el nombre y el ticket short id en mayúsculas", async () => {
    const r = await supportTicketInternalEmail(
      stiData({ ticketId: "abcdef1234567890", subject: "MI_PEDIDO", customerName: "Elena" }),
    );
    expect(r.subject).toBe("[Soporte] Estado de mi pedido — Elena (#ABCDEF12)");
  });

  it("el short id son los primeros 8 chars del ticketId en MAYÚSCULA", async () => {
    const r = await supportTicketInternalEmail(stiData({ ticketId: "0a1b2c3d4e5f6789" }));
    expect(r.html).toContain("#0A1B2C3D");
    expect(r.text).toContain("#0A1B2C3D");
  });

  it("HTML incluye nombre, email (mailto), label del asunto, IP y ticketId completo", async () => {
    const r = await supportTicketInternalEmail(
      stiData({
        customerName: "Elena Ríos",
        customerEmail: "elena@example.com",
        subject: "GARANTIA_DEVOLUCION",
        ip: "200.1.2.3",
        ticketId: "abcdef1234567890",
      }),
    );
    expect(r.html).toContain("Elena Ríos");
    expect(r.html).toContain("mailto:elena@example.com");
    expect(r.html).toContain("Garantía o devolución");
    expect(r.html).toContain("200.1.2.3");
    // El ticketId completo va en la tabla de metadatos.
    expect(r.html).toContain("abcdef1234567890");
  });

  it("devuelve replyTo con el email del cliente (para responder directo)", async () => {
    const r = await supportTicketInternalEmail(stiData({ customerEmail: "cliente@dom.co" }));
    expect(r.replyTo).toBe("cliente@dom.co");
  });

  it("ip ausente (null) se muestra como guion '—' en HTML y texto", async () => {
    const r = await supportTicketInternalEmail(stiData({ ip: null }));
    expect(r.html).toContain("—");
    expect(r.text).toContain("IP: —");
  });

  it("ip undefined también cae al guion '—'", async () => {
    const r = await supportTicketInternalEmail(stiData({ ip: undefined }));
    expect(r.text).toContain("IP: —");
  });

  it("SEGURIDAD: usa el escapeHtml del layout → escapa TAMBIÉN la comilla simple", async () => {
    const r = await supportTicketInternalEmail(
      stiData({ customerName: "O'Brien <b>", message: "1 < 2 & 3 > 0 y 'comilla'" }),
    );
    // ' se convierte a &#39; (diferencia clave vs las plantillas de orden).
    expect(r.html).toContain("O&#39;Brien &lt;b&gt;");
    expect(r.html).toContain("1 &lt; 2 &amp; 3 &gt; 0 y &#39;comilla&#39;");
  });

  it("SEGURIDAD: el mensaje del cliente se escapa (no inyecta <script>)", async () => {
    const r = await supportTicketInternalEmail(
      stiData({ message: "<script>alert('xss')</script>" }),
    );
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).not.toContain("<script>alert");
  });

  it("SEGURIDAD: el email del cliente se escapa dentro del href mailto y del texto visible", async () => {
    const r = await supportTicketInternalEmail(stiData({ customerEmail: 'evil"@x.co' }));
    // La comilla doble del email se escapa a &quot; en el HTML.
    expect(r.html).toContain("evil&quot;@x.co");
  });

  it("preview del layout nombra al cliente", async () => {
    const r = await supportTicketInternalEmail(stiData({ customerName: "Elena" }));
    expect(r.html).toContain("Nuevo ticket de Elena");
  });

  it.each([
    ["CONSULTA_PRODUCTO", "Consulta sobre un producto"],
    ["PERSONALIZACION", "Personalización"],
    ["MI_PEDIDO", "Estado de mi pedido"],
    ["GARANTIA_DEVOLUCION", "Garantía o devolución"],
    ["MAYORISTA", "Mayorista / Evento corporativo"],
    ["OTRO", "Otro"],
  ] as const)("subject %s → label %j", async (subject, label) => {
    const r = await supportTicketInternalEmail(stiData({ subject }));
    expect(r.subject).toContain(label);
    expect(r.html).toContain(label);
  });
});

// =============================================================================
// support-ticket-received (confirmación al cliente)
// =============================================================================
describe("supportTicketReceivedEmail", () => {
  it("subject confirma recepción con el ticket short id en mayúscula", async () => {
    const r = await supportTicketReceivedEmail(strData({ ticketId: "abcdef1234567890" }));
    expect(r.subject).toBe("Recibimos tu mensaje — Ticket #ABCDEF12");
  });

  it("HTML saluda al cliente, muestra el short id, el label del asunto y el mensaje", async () => {
    const r = await supportTicketReceivedEmail(
      strData({
        customerName: "Elena",
        ticketId: "abcdef1234567890",
        subject: "PERSONALIZACION",
        message: "Quiero un diseño con mi mascota",
      }),
    );
    expect(r.html).toContain("Elena");
    expect(r.html).toContain("#ABCDEF12");
    expect(r.html).toContain("Personalización");
    expect(r.html).toContain("Quiero un diseño con mi mascota");
    // Promesa de SLA de respuesta.
    expect(r.html).toContain("24 horas hábiles");
  });

  it("NO devuelve replyTo (a diferencia del template interno)", async () => {
    const r = await supportTicketReceivedEmail(strData());
    expect(r).not.toHaveProperty("replyTo");
  });

  it("SEGURIDAD: escapa nombre, mensaje y comilla simple (escapeHtml del layout)", async () => {
    const r = await supportTicketReceivedEmail(
      strData({ customerName: "O'Neil <x>", message: "a & b < c > d \"q\" 'p'" }),
    );
    expect(r.html).toContain("O&#39;Neil &lt;x&gt;");
    expect(r.html).toContain("a &amp; b &lt; c &gt; d &quot;q&quot; &#39;p&#39;");
    expect(r.html).not.toContain("<x>");
  });

  it("el texto plano refleja nombre, short id, label y mensaje sin escapar", async () => {
    const r = await supportTicketReceivedEmail(
      strData({ customerName: "Ana <b>", subject: "OTRO", message: "hola <mundo>" }),
    );
    expect(r.text).toContain("Ana <b>");
    expect(r.text).toContain("#ABCDEF12");
    expect(r.text).toContain("Otro");
    expect(r.text).toContain("hola <mundo>");
  });

  it("preview del layout menciona el ticket registrado y el SLA", async () => {
    const r = await supportTicketReceivedEmail(strData({ ticketId: "abcdef1234567890" }));
    expect(r.html).toContain("Ticket #ABCDEF12 registrado");
  });

  it("IDEMPOTENCIA: mismo input → misma salida", async () => {
    const data = strData();
    const [a, b] = await Promise.all([
      supportTicketReceivedEmail(data),
      supportTicketReceivedEmail(data),
    ]);
    expect(a).toEqual(b);
  });
});

describe("designRejectedEmail (moderación P0-2)", () => {
  const data = {
    orderNumber: "LM-0007",
    customerName: "Ana",
    productName: "Fotoimán cuadrado",
    reason: "La foto contiene contenido de terceros",
    publicTrackingToken: null,
  };

  it("subject lleva el número de pedido", async () => {
    const t = await designRejectedEmail(data);
    expect(t.subject).toContain("LM-0007");
  });

  it("#10 con publicTrackingToken el link apunta a la vista guest /pedido/<token>", async () => {
    const t = await designRejectedEmail({ ...data, publicTrackingToken: "GUESTTOK" });
    expect(t.html).toContain(`${SITE_URL}/pedido/GUESTTOK`);
    expect(t.text).toContain(`${SITE_URL}/pedido/GUESTTOK`);
    expect(t.html).not.toContain("/mi-cuenta/pedidos");
  });

  it("#10 sin token cae a /mi-cuenta/pedidos (cliente con cuenta)", async () => {
    const t = await designRejectedEmail(data);
    expect(t.html).toContain(`${SITE_URL}/mi-cuenta/pedidos`);
    expect(t.html).not.toContain("/pedido/");
  });

  it("HTML incluye nombre, producto, número de pedido y motivo", async () => {
    const t = await designRejectedEmail(data);
    expect(t.html).toContain("Ana");
    expect(t.html).toContain("Fotoimán cuadrado");
    expect(t.html).toContain("LM-0007");
    expect(t.html).toContain("La foto contiene contenido de terceros");
  });

  it("SEGURIDAD: escapa < > & en el motivo (viene del admin, va al email)", async () => {
    const t = await designRejectedEmail({ ...data, reason: '<script>alert("x")</script> & más' });
    expect(t.html).toContain("&lt;script&gt;");
    expect(t.html).not.toContain("<script>alert");
  });

  it("el texto plano refleja motivo y producto", async () => {
    const t = await designRejectedEmail(data);
    expect(t.text).toContain("Fotoimán cuadrado");
    expect(t.text).toContain("La foto contiene contenido de terceros");
  });

  it("IDEMPOTENCIA: mismo input → misma salida", async () => {
    const [a, b] = await Promise.all([designRejectedEmail(data), designRejectedEmail(data)]);
    expect(a).toEqual(b);
  });
});
