import { describe, expect, it } from "vitest";
import {
  encodeUtmCookie,
  extractUtmFromSearchParams,
  parseUtmCookie,
  sanitizeLandingPath,
  sanitizeUtmValue,
} from "./utm-attribution";

describe("utm-attribution — higiene sin PII y round-trip seguro (S25)", () => {
  it("rechaza valores UTM que contengan emails o secuencias largas de teléfono/cédula", () => {
    expect(sanitizeUtmValue("cliente@correo.com")).toBeNull();
    expect(sanitizeUtmValue("3005556677")).toBeNull();
    expect(sanitizeUtmValue("cc-1020304050")).toBeNull();
    expect(sanitizeUtmValue("instagram")).toBe("instagram");
    expect(sanitizeUtmValue("  meta_ads-2026  ")).toBe("meta_ads-2026");
  });

  it("enmascara tokens privados en landingPath y descarta rutas con @", () => {
    expect(sanitizeLandingPath("/pedido/abc123secret?utm_source=ig")).toBe("/pedido/[token]");
    expect(sanitizeLandingPath("/cotizacion/999888")).toBe("/cotizacion/[token]");
    expect(sanitizeLandingPath("/carrito/recuperar/tok_xyz")).toBe("/carrito/recuperar/[token]");
    expect(sanitizeLandingPath("/productos/iman-calendario?utm_source=ig")).toBe(
      "/productos/iman-calendario",
    );
    expect(sanitizeLandingPath("/perfil/user@mail.com")).toBeNull();
  });

  it("retorna null si la URL no contiene ningún parámetro utm_*", () => {
    const sp = new URLSearchParams("categoria=fotoimanes&orden=precio");
    expect(extractUtmFromSearchParams("/catalogo", sp)).toBeNull();
  });

  it("codifica y re-sanitiza la cookie lucams_utm incluso si es manipulada en cliente", () => {
    const sp = new URLSearchParams(
      "utm_source=instagram&utm_medium=reels&utm_campaign=dia-madre-2026",
    );
    const extracted = extractUtmFromSearchParams("/ocasiones/dia-de-la-madre", sp);
    expect(extracted).toEqual({
      utmSource: "instagram",
      utmMedium: "reels",
      utmCampaign: "dia-madre-2026",
      landingPath: "/ocasiones/dia-de-la-madre",
    });

    const cookieVal = encodeUtmCookie(extracted!);
    expect(parseUtmCookie(cookieVal)).toEqual(extracted);

    // Manipulación en navegador inyectando email y token privado
    const tampered = encodeURIComponent(
      JSON.stringify({
        s: "leak@cliente.co",
        m: "cpc",
        c: "3109998877",
        p: "/pedido/secreto123",
      }),
    );
    expect(parseUtmCookie(tampered)).toEqual({
      utmSource: null,
      utmMedium: "cpc",
      utmCampaign: null,
      landingPath: "/pedido/[token]",
    });
  });
});
