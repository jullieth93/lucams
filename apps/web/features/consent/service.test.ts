/*
 * Registro de consentimientos — el audit trail que exige la Ley 1581 (arts. 8 lit. b y 9).
 *
 * Este módulo es la prueba de que el titular autorizó el tratamiento de sus datos. Si una de estas
 * funciones escribe mal —scope equivocado, versión estampada de una constante en vez del aviso
 * vigente, o el titular sin ningún identificador— la fila existe pero no prueba nada, y el fallo es
 * invisible: nadie lo nota hasta que la SIC pide la evidencia.
 *
 * Por eso se verifica el CONTENIDO de lo que se persiste, no solo que se llame a prisma.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CookiePreferences } from "@/lib/cookie-consent";

/** Preferencias completas (el tipo exige `v` y `savedAt`, que aquí no importan). */
function prefs(over: Partial<CookiePreferences> = {}): CookiePreferences {
  return {
    v: 1,
    necessary: true,
    functional: false,
    analytics: false,
    marketing: false,
    savedAt: "2026-07-24T00:00:00.000Z",
    ...over,
  };
}

const create = vi.hoisted(() => vi.fn());
const createMany = vi.hoisted(() => vi.fn());
const getSettingValue = vi.hoisted(() =>
  vi.fn(async (_key: string, fallback: string): Promise<string> => fallback),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { consent: { create, createMany } } }));
vi.mock("@/lib/cms", () => ({
  getSettingValue: (key: string, fallback: string) => getSettingValue(key, fallback),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordCookieConsent", () => {
  it("escribe UNA fila por scope, con el accepted de cada preferencia", async () => {
    const { recordCookieConsent } = await import("./service");

    await recordCookieConsent({
      prefs: prefs({ functional: true }),
      ip: "1.2.3.4",
      userAgent: "Mozilla/5.0",
    });

    expect(createMany).toHaveBeenCalledTimes(1);
    const rows = createMany.mock.calls[0][0].data as Array<{ scope: string; accepted: boolean }>;
    expect(rows.length).toBeGreaterThanOrEqual(4);

    const byScope = Object.fromEntries(rows.map((r) => [r.scope, r.accepted]));
    expect(byScope.COOKIES_NECESSARY).toBe(true);
    expect(byScope.COOKIES_FUNCTIONAL).toBe(true);
    expect(byScope.COOKIES_ANALYTICS).toBe(false);
    expect(byScope.COOKIES_MARKETING).toBe(false);
  });

  it("registra el rechazo explícito, no solo la aceptación", async () => {
    const { recordCookieConsent } = await import("./service");

    await recordCookieConsent({ prefs: prefs() });

    const rows = createMany.mock.calls[0][0].data as Array<{ accepted: boolean }>;
    // Una fila `accepted:false` es prueba de que el titular DIJO QUE NO — sin ella no se puede
    // demostrar que la negativa se respetó.
    expect(rows.some((r) => r.accepted === false)).toBe(true);
  });

  it("estampa la versión VIGENTE del aviso, no una constante del código", async () => {
    getSettingValue.mockResolvedValueOnce("v9 · 2026-12-01");
    const { recordCookieConsent } = await import("./service");

    await recordCookieConsent({ prefs: prefs() });

    const rows = createMany.mock.calls[0][0].data as Array<{ version: string }>;
    expect(rows.every((r) => r.version === "v9 · 2026-12-01")).toBe(true);
  });
});

describe("recordHabeasDataConsent (registro de cuenta)", () => {
  it("ancla la autorización al cliente creado y la marca como aceptada", async () => {
    const { recordHabeasDataConsent } = await import("./service");

    await recordHabeasDataConsent({
      customerId: "cus_1",
      email: "lucia@example.com",
      ip: "1.2.3.4",
      userAgent: "Mozilla/5.0",
    });

    const data = create.mock.calls[0][0].data;
    expect(data.scope).toBe("HABEAS_DATA");
    expect(data.accepted).toBe(true);
    expect(data.customerId).toBe("cus_1");
    expect(data.email).toBe("lucia@example.com");
    expect(data.ipAddress).toBe("1.2.3.4");
  });
});

describe("recordCheckoutDataConsent (comprador, puede ser invitado)", () => {
  it("acepta customerId nulo: el titular invitado se ancla al email", async () => {
    const { recordCheckoutDataConsent } = await import("./service");

    await recordCheckoutDataConsent({ email: "invitado@example.com", customerId: null });

    const data = create.mock.calls[0][0].data;
    expect(data.customerId).toBeNull();
    expect(data.email).toBe("invitado@example.com");
    expect(data.scope).toBe("HABEAS_DATA");
    expect(data.accepted).toBe(true);
  });

  it("normaliza IP y user-agent ausentes a null en vez de undefined", async () => {
    const { recordCheckoutDataConsent } = await import("./service");

    await recordCheckoutDataConsent({ email: "invitado@example.com" });

    const data = create.mock.calls[0][0].data;
    expect(data.ipAddress).toBeNull();
    expect(data.userAgent).toBeNull();
  });
});
