/*
 * buildPublicShareUrl — URLs públicas para compartir SIEMPRE sobre el dominio canónico.
 * Regresión (feedback Lucy 2026-07-23): un link compartido salió con el dominio
 * `*.vercel.app` del deployment porque se armaba con window.location.origin.
 */

import { describe, it, expect, afterEach } from "vitest";
import { buildPublicShareUrl, getCanonicalSiteUrl } from "./public-url";

const KEY = "NEXT_PUBLIC_SITE_URL";
const saved = process.env[KEY];

afterEach(() => {
  if (saved === undefined) delete process.env[KEY];
  else process.env[KEY] = saved;
});

describe("buildPublicShareUrl", () => {
  it("arma el link sobre NEXT_PUBLIC_SITE_URL (sin trailing slash duplicado)", () => {
    process.env[KEY] = "https://lucamsshop.com/";
    expect(buildPublicShareUrl("/d/abc123")).toBe("https://lucamsshop.com/d/abc123");
  });

  it("normaliza un path sin slash inicial", () => {
    process.env[KEY] = "https://lucamsshop.com";
    expect(buildPublicShareUrl("cotizacion/tok")).toBe("https://lucamsshop.com/cotizacion/tok");
  });

  it("sin env cae al dominio de producción por defecto (NUNCA vercel.app)", () => {
    delete process.env[KEY];
    expect(buildPublicShareUrl("/pedido/tok")).toBe("https://lucamsshop.com/pedido/tok");
  });

  it("getCanonicalSiteUrl strippea trailing slashes", () => {
    process.env[KEY] = "https://lucamsshop.com//";
    expect(getCanonicalSiteUrl()).toBe("https://lucamsshop.com");
  });
});
