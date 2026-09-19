/*
 * Test del REGISTRY de plantillas de email (features/emails/registry.ts —
 * Fase 4, feedback Lucy 2026-09-18).
 *
 * FOCO:
 *  1. Cobertura total: TODA plantilla de features/emails/templates/ (archivo
 *     .ts que no sea test) está registrada con su id = nombre del archivo, y
 *     no hay ids duplicados ni registrados que no existan en disco.
 *  2. Toda plantilla registrada renderiza con su SAMPLE DATA sin lanzar y
 *     produce HTML con el layout compartido (doctype, lang es-CO, marca,
 *     footer) + subject/text no vacíos.
 *  3. Fallback de overrides: sin filas en EmailTemplateOverride (DB mockeada
 *     vacía), renderSample() (que pasa por withOverrides) es IDÉNTICO a
 *     renderBase() (render crudo) — el override nunca altera el copy base si
 *     no existe.
 *  4. Renders de ENVÍO (exports render* — los que importan los senders
 *     productivos): cobertura total (uno por plantilla registrada), tokens
 *     {campo} documentados por entry y override SUBJECT aplicado al envío
 *     real con fallback al base.
 *
 * Estrategia: UNIT PURO, offline — mismo patrón que templates.test.ts:
 * @/lib/cms mockeado (settings del layout) y @/lib/db mockeado (overrides
 * vacíos). La capa unstable_cache de overrides.ts degrada sola (E469 → crudo).
 */

import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

process.env.NEXT_PUBLIC_SITE_URL = "https://lucamsshop.com";

vi.mock("@/lib/cms", () => ({
  getSettingValue: vi.fn(async (key: string, fallback: string) => {
    switch (key) {
      case "SITE_URL":
        return "https://lucamsshop.com";
      case "CONTACT_EMAIL":
        return "hola@lucamsshop.com";
      case "COPYRIGHT_YEAR":
        return "2026";
      case "COPYRIGHT_TAGLINE":
        return "Hecho con 💜 en Bogotá";
      default:
        return fallback;
    }
  }),
  getCmsBlock: vi.fn(async () => null),
}));

// Sin overrides: la prueba del fallback (renderSample === renderBase).
vi.mock("@/lib/db", () => ({
  prisma: { emailTemplateOverride: { findMany: vi.fn(async () => []) } },
}));

import {
  EMAIL_TEMPLATE_REGISTRY,
  getEmailTemplate,
  renderOrderConfirmationEmail,
} from "./registry";
import { EMAIL_OVERRIDE_KEYS } from "./overrides";
import { prisma } from "@/lib/db";
import { orderConfirmationEmail } from "./templates/order-confirmation";

describe("EMAIL_TEMPLATE_REGISTRY — cobertura", () => {
  it("registra TODA plantilla de templates/ (archivo .ts no-test) con id = nombre de archivo", () => {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "templates");
    const onDisk = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => f.replace(/\.ts$/, ""))
      .sort();
    const registered = EMAIL_TEMPLATE_REGISTRY.map((t) => t.id).sort();
    expect(registered).toEqual(onDisk);
  });

  it("ids únicos, metadata completa y editableKeys válidas", () => {
    const ids = new Set<string>();
    for (const tpl of EMAIL_TEMPLATE_REGISTRY) {
      expect(ids.has(tpl.id)).toBe(false);
      ids.add(tpl.id);
      expect(tpl.name.length).toBeGreaterThan(0);
      expect(tpl.group.length).toBeGreaterThan(0);
      expect(tpl.description.length).toBeGreaterThan(0);
      for (const key of tpl.editableKeys) {
        expect(EMAIL_OVERRIDE_KEYS).toContain(key);
      }
    }
  });

  it("getEmailTemplate resuelve por id y devuelve null para ids desconocidos", () => {
    expect(getEmailTemplate("order-confirmation")?.name).toBe("Confirmación de pedido");
    expect(getEmailTemplate("no-existe")).toBeNull();
  });
});

describe("EMAIL_TEMPLATE_REGISTRY — render con sample data", () => {
  it("toda plantilla registrada renderiza sin lanzar y produce el layout compartido", async () => {
    for (const tpl of EMAIL_TEMPLATE_REGISTRY) {
      const r = await tpl.renderSample();
      expect(r.html.startsWith("<!doctype html>"), `${tpl.id}: html con doctype`).toBe(true);
      expect(r.html, `${tpl.id}: lang es-CO`).toContain('lang="es-CO"');
      expect(r.html, `${tpl.id}: marca en header`).toContain("Lucams");
      expect(r.html, `${tpl.id}: footer con copyright`).toContain("© 2026 Lucams_shop");
      expect(r.subject.length, `${tpl.id}: subject no vacío`).toBeGreaterThan(0);
      expect(r.text.length, `${tpl.id}: text no vacío`).toBeGreaterThan(0);
      // El preview pane del layout está presente en todas (preheader editable).
      expect(r.html, `${tpl.id}: div oculto de preheader`).toContain("mso-hide:all");
      // Todas tienen titular principal editable (primer <h1>).
      expect(r.html, `${tpl.id}: titular <h1>`).toContain("<h1");
    }
  });

  it("sin overrides en DB, renderSample (con withOverrides) es idéntico a renderBase", async () => {
    for (const tpl of EMAIL_TEMPLATE_REGISTRY) {
      const [conOverrides, base] = await Promise.all([tpl.renderSample(), tpl.renderBase()]);
      expect(conOverrides, `${tpl.id}: fallback al copy base`).toEqual(base);
    }
  });
});

describe("EMAIL_TEMPLATE_REGISTRY — renders de ENVÍO (exports render*)", () => {
  it("toda plantilla registrada tiene su render de envío exportado como render<Nombre>Email", async () => {
    const mod = (await import("./registry")) as unknown as Record<string, unknown>;
    for (const tpl of EMAIL_TEMPLATE_REGISTRY) {
      const exportName =
        "render" +
        tpl.id
          .split("-")
          .map((p) => p[0]!.toUpperCase() + p.slice(1))
          .join("") +
        "Email";
      expect(typeof mod[exportName], `${tpl.id}: falta el export ${exportName}`).toBe("function");
    }
  });

  it("tokens = campos escalares (string/number) del data; arrays y plantillas sin data quedan fuera", () => {
    const order = getEmailTemplate("order-confirmation")!;
    expect(order.tokens).toContain("orderNumber");
    expect(order.tokens).toContain("customerName");
    expect(order.tokens).not.toContain("items"); // array: no interpolable
    // account-exists-notice no recibe data → sin tokens.
    expect(getEmailTemplate("account-exists-notice")!.tokens).toEqual([]);
  });

  it("el render de envío aplica un override SUBJECT con tokens y cae al base sin filas", async () => {
    const findMany = prisma.emailTemplateOverride.findMany as unknown as ReturnType<typeof vi.fn>;
    const data = {
      orderNumber: "LCM-2026-1042",
      customerName: "Camila Restrepo",
      total: 8_990_000,
      subtotal: 7_990_000,
      shipping: 1_000_000,
      discount: 0,
      shippingCarrier: "Coordinadora",
      items: [{ name: "Fotoimanes Cuadrados (x6)", qty: 1, lineTotal: 4_990_000 }],
      shippingAddress: "Calle 10 # 43-25, Medellín",
      publicTrackingToken: null,
      paymentMethod: "WOMPI" as const,
    };

    // Sin filas (default del mock): resultado IDÉNTICO al render base.
    const sinOverride = await renderOrderConfirmationEmail(data);
    const base = await orderConfirmationEmail(data);
    expect(sinOverride).toEqual(base);

    // Con fila SUBJECT: el subject sale del override, con {orderNumber} interpolado.
    findMany.mockResolvedValueOnce([
      { key: "SUBJECT", value: "Tu pedido {orderNumber} va en camino 🎉" },
    ]);
    const conOverride = await renderOrderConfirmationEmail(data);
    expect(conOverride.subject).toBe("Tu pedido LCM-2026-1042 va en camino 🎉");
    expect(conOverride.html).toBe(base.html); // sin HEADING/PREHEADER, el html no se toca
  });
});
