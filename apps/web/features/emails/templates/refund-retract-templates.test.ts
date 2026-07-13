/*
 * Test PURO de las 3 plantillas de reembolso/retracto que faltaban cobertura
 * (refund-issued, retract-approved, retract-refunded). Mismo enfoque que
 * templates.test.ts: unit puro, OFFLINE, mockeando el único acoplamiento externo
 * (getSettingValue de @/lib/cms) → render determinista sin tocar DB ni pooler.
 *
 * Verificado contra la fuente ANTES de fijar aserciones:
 *  - Las tres definen su PROPIO escapeHtml local que escapa &, <, >, " pero NO la
 *    comilla simple (') — igual que las plantillas de orden.
 *  - retract-approved lee WA_NUMBER (getSettingValue) y arma https://wa.me/<solo dígitos>.
 *  - refund-issued / retract-refunded formatean COP con formatCOP (Intl es-CO →
 *    "$" + ESPACIO DURO U+00A0). Las aserciones de dinero usan \s (matchea U+00A0).
 */

import { describe, expect, it, vi } from "vitest";

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
      case "WA_NUMBER":
        return "573208873826";
      default:
        return fallback;
    }
  }),
}));

import { refundIssuedEmail } from "./refund-issued";
import { retractApprovedEmail } from "./retract-approved";
import { retractRefundedEmail } from "./retract-refunded";

/** Regex de dinero tolerante al espacio duro U+00A0 que emite Intl es-CO. */
function money(pesosWithDots: string): RegExp {
  return new RegExp("\\$\\s*" + pesosWithDots.replace(/\./g, "\\."));
}

// =============================================================================
// refund-issued (reembolso genérico de orden)
// =============================================================================
describe("refundIssuedEmail", () => {
  const base = { orderNumber: "LS-9001", customerName: "Lucía", amount: 5_000_000 };

  it("envuelve el body en el layout compartido (doctype + marca + footer)", async () => {
    const r = await refundIssuedEmail(base);
    expect(r.html.startsWith("<!doctype html>")).toBe(true);
    expect(r.html).toContain('lang="es-CO"');
    expect(r.html).toContain("hola@lucamsshop.co");
    expect(r.html).toContain("© 2026 Lucams_shop");
  });

  it("subject lleva el número de orden y el corazón", async () => {
    const r = await refundIssuedEmail({ ...base, orderNumber: "LS-9009" });
    expect(r.subject).toBe("Reembolso procesado — pedido LS-9009 💜");
  });

  it("HTML y texto incluyen nombre, orden y el monto formateado en COP", async () => {
    const r = await refundIssuedEmail({ ...base, amount: 5_000_000 });
    expect(r.html).toContain("Lucía");
    expect(r.html).toContain("LS-9001");
    expect(r.html).toMatch(money("50.000"));
    expect(r.text).toContain("LS-9001");
    expect(r.text).toMatch(money("50.000"));
  });

  it("con motivo lo muestra en HTML y texto", async () => {
    const r = await refundIssuedEmail({ ...base, reason: "Producto agotado" });
    expect(r.html).toContain("Motivo: Producto agotado");
    expect(r.text).toContain("Motivo: Producto agotado");
  });

  it("sin motivo (null/undefined) NO agrega la línea de motivo", async () => {
    const rNull = await refundIssuedEmail({ ...base, reason: null });
    expect(rNull.html).not.toContain("Motivo:");
    const rUndef = await refundIssuedEmail(base);
    expect(rUndef.html).not.toContain("Motivo:");
  });

  it("SEGURIDAD: escapa <, >, & y \" en nombre y motivo; no filtra markup crudo", async () => {
    const r = await refundIssuedEmail({
      ...base,
      customerName: 'Ana <b>"x"</b> & Co',
      reason: "<script>alert(1)</script> & más",
    });
    expect(r.html).toContain("Ana &lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; Co");
    expect(r.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; más");
    expect(r.html).not.toContain("<script>alert(1)</script>");
  });

  it("SEGURIDAD: el escape local NO toca la comilla simple (verificado en la fuente)", async () => {
    const r = await refundIssuedEmail({ ...base, customerName: "O'Brien" });
    expect(r.html).toContain("O'Brien");
    expect(r.html).not.toContain("O&#39;Brien");
  });

  it("BORDE: monto 0 se formatea como $ 0 sin romper", async () => {
    const r = await refundIssuedEmail({ ...base, amount: 0 });
    expect(r.html).toMatch(money("0"));
  });

  it("IDEMPOTENCIA: mismo input → misma salida", async () => {
    const [a, b] = await Promise.all([refundIssuedEmail(base), refundIssuedEmail(base)]);
    expect(a).toEqual(b);
  });
});

// =============================================================================
// retract-approved (aprobación de retracto → instrucciones de devolución)
// =============================================================================
describe("retractApprovedEmail", () => {
  const base = { orderNumber: "LS-8001", customerName: "Andrés", productName: "Imán foto" };

  it("subject lleva el número de orden y el check", async () => {
    const r = await retractApprovedEmail({ ...base, orderNumber: "LS-8080" });
    expect(r.subject).toBe("Retracto aprobado — pedido LS-8080 ✅");
  });

  it("HTML incluye nombre, producto, orden y el plazo legal de 15 días (Ley 2439)", async () => {
    const r = await retractApprovedEmail(base);
    expect(r.html).toContain("Andrés");
    expect(r.html).toContain("Imán foto");
    expect(r.html).toContain("LS-8001");
    expect(r.html).toContain("15 días calendario");
    expect(r.html).toContain("Ley 2439/2024");
  });

  it("arma el link de WhatsApp con solo los dígitos del WA_NUMBER (setting)", async () => {
    const r = await retractApprovedEmail(base);
    expect(r.html).toContain("https://wa.me/573208873826");
    expect(r.text).toContain("https://wa.me/573208873826");
  });

  it("menciona que los personalizados no tienen retracto (excepción de ley)", async () => {
    const r = await retractApprovedEmail(base);
    expect(r.html).toContain("productos personalizados");
  });

  it("SEGURIDAD: escapa markup en nombre, producto y orden", async () => {
    const r = await retractApprovedEmail({
      customerName: "X <b>",
      productName: "Set <img src=x> & co",
      orderNumber: "LS-<8>",
    });
    expect(r.html).toContain("X &lt;b&gt;");
    expect(r.html).toContain("Set &lt;img src=x&gt; &amp; co");
    expect(r.html).toContain("LS-&lt;8&gt;");
    expect(r.html).not.toContain("<img src=x>");
  });

  it("el texto plano refleja producto y orden crudos (es texto, no markup)", async () => {
    const r = await retractApprovedEmail(base);
    expect(r.text).toContain('"Imán foto"');
    expect(r.text).toContain("pedido LS-8001");
  });

  it("IDEMPOTENCIA: mismo input → misma salida", async () => {
    const [a, b] = await Promise.all([retractApprovedEmail(base), retractApprovedEmail(base)]);
    expect(a).toEqual(b);
  });
});

// =============================================================================
// retract-refunded (reembolso de retracto procesado)
// =============================================================================
describe("retractRefundedEmail", () => {
  const base = {
    orderNumber: "LS-7001",
    customerName: "Carolina",
    productName: "Imán foto",
    amount: 3_000_000,
    method: "WOMPI_VOID",
  };

  it("subject lleva el número de orden y el corazón", async () => {
    const r = await retractRefundedEmail({ ...base, orderNumber: "LS-7070" });
    expect(r.subject).toBe("Reembolso de tu retracto procesado — pedido LS-7070 💜");
  });

  it("HTML incluye nombre, producto, orden y el monto en COP", async () => {
    const r = await retractRefundedEmail(base);
    expect(r.html).toContain("Carolina");
    expect(r.html).toContain("Imán foto");
    expect(r.html).toContain("LS-7001");
    expect(r.html).toMatch(money("30.000"));
  });

  it("método WOMPI_VOID → 'reversa a tu medio de pago'", async () => {
    const r = await retractRefundedEmail({ ...base, method: "WOMPI_VOID" });
    expect(r.html).toContain("reversa a tu medio de pago");
    expect(r.text).toContain("reversa a tu medio de pago");
  });

  it("método BANK_TRANSFER → 'transferencia bancaria'", async () => {
    const r = await retractRefundedEmail({ ...base, method: "BANK_TRANSFER" });
    expect(r.html).toContain("transferencia bancaria");
    expect(r.text).toContain("transferencia bancaria");
  });

  it("método desconocido cae al label por defecto (reversa a tu medio de pago)", async () => {
    const r = await retractRefundedEmail({ ...base, method: "OTRO" });
    expect(r.html).toContain("reversa a tu medio de pago");
  });

  it("SEGURIDAD: escapa markup en nombre y producto", async () => {
    const r = await retractRefundedEmail({
      ...base,
      customerName: "Caro <b>",
      productName: "Set <script> & co",
    });
    expect(r.html).toContain("Caro &lt;b&gt;");
    expect(r.html).toContain("Set &lt;script&gt; &amp; co");
    expect(r.html).not.toContain("<script> & co");
  });

  it("BORDE: monto 0 se formatea como $ 0 sin romper", async () => {
    const r = await retractRefundedEmail({ ...base, amount: 0 });
    expect(r.html).toMatch(money("0"));
  });

  it("IDEMPOTENCIA: mismo input → misma salida", async () => {
    const [a, b] = await Promise.all([retractRefundedEmail(base), retractRefundedEmail(base)]);
    expect(a).toEqual(b);
  });
});
