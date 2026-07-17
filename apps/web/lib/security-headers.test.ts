/*
 * Test de los helpers de seguridad del proxy (CSP + CORS allowlist). Antes proxy.ts no tenía
 * ninguna cobertura; estos helpers puros son el núcleo de seguridad (directivas CSP + qué
 * orígenes reciben CORS). Auditoría 2026-07-13.
 */

import { describe, it, expect } from "vitest";
import { buildCsp, isOriginAllowed, getAllowedOrigins, SECURITY_HEADERS } from "./security-headers";

describe("buildCsp — prod (nonce + strict-dynamic)", () => {
  const csp = buildCsp("NONCE123", true);

  it("script-src usa nonce + strict-dynamic y NO 'unsafe-inline'/'unsafe-eval'", () => {
    expect(csp).toContain("'nonce-NONCE123'");
    expect(csp).toContain("'strict-dynamic'");
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("incluye upgrade-insecure-requests, object-src 'none' y base-uri 'self'", () => {
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("permite los orígenes de pago/anti-bot esperados (Wompi + Turnstile)", () => {
    expect(csp).toContain("https://checkout.wompi.co");
    expect(csp).toContain("https://challenges.cloudflare.com");
  });
});

describe("buildCsp — dev (permisivo para HMR)", () => {
  const csp = buildCsp("N", false);

  it("script-src usa 'unsafe-inline'/'unsafe-eval' (dev server de Next)", () => {
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'unsafe-eval'");
  });

  it("NO incluye upgrade-insecure-requests (dev sirve HTTP plano)", () => {
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});

describe("isOriginAllowed — CORS allowlist", () => {
  it("permite el dominio productivo (con y sin www)", () => {
    expect(isOriginAllowed("https://lucamsshop.co", false)).toBe(true);
    expect(isOriginAllowed("https://www.lucamsshop.co", false)).toBe(true);
  });

  it("permite el alias de producción y previews CON el scope del equipo (ADR-062)", () => {
    // Alias de producción del proyecto (sin scope) → solo lo reclama el dueño.
    expect(isOriginAllowed("https://lucams-shop.vercel.app", false)).toBe(true);
    // Previews del equipo → exigen el sufijo del scope `-jullieth93s-projects`.
    expect(
      isOriginAllowed("https://lucams-shop-abc123-jullieth93s-projects.vercel.app", false),
    ).toBe(true);
    expect(
      isOriginAllowed("https://lucams-shop-git-develop-jullieth93s-projects.vercel.app", false),
    ).toBe(true);
  });

  it("RECHAZA previews de Vercel SIN el scope del equipo (squatting) — ADR-062", () => {
    // Antes matcheaba (scope opcional) → cualquiera podía registrar este proyecto y recibir ACAO.
    expect(isOriginAllowed("https://lucams-shop-abc123.vercel.app", false)).toBe(false);
    expect(isOriginAllowed("https://lucams-shop-evil.vercel.app", false)).toBe(false);
    // Scope de OTRO equipo tampoco.
    expect(
      isOriginAllowed("https://lucams-shop-abc-otra-empresa.vercel.app", false),
    ).toBe(false);
  });

  it("RECHAZA orígenes ajenos (incl. dominios que solo contienen el nombre)", () => {
    expect(isOriginAllowed("https://evil.com", false)).toBe(false);
    expect(isOriginAllowed("https://lucamsshop.co.evil.com", false)).toBe(false);
    expect(isOriginAllowed("https://otra-app.vercel.app", false)).toBe(false);
    expect(isOriginAllowed("http://lucamsshop.co", false)).toBe(false); // http, no https
  });

  it("localhost solo se permite en dev", () => {
    expect(isOriginAllowed("http://localhost:3000", true)).toBe(true);
    expect(isOriginAllowed("http://localhost:3000", false)).toBe(false);
    expect(getAllowedOrigins(false)).not.toContain("http://localhost:3000");
  });
});

describe("SECURITY_HEADERS", () => {
  it("incluye las cabeceras defensivas clave", () => {
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toContain("max-age=");
    expect(SECURITY_HEADERS["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});
