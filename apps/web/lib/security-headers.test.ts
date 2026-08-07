/*
 * Test de los helpers de seguridad del proxy (CSP + CORS allowlist). Antes proxy.ts no tenía
 * ninguna cobertura; estos helpers puros son el núcleo de seguridad (directivas CSP + qué
 * orígenes reciben CORS). Auditoría 2026-07-13.
 */

import { describe, it, expect } from "vitest";
import { buildCsp, isOriginAllowed, getAllowedOrigins, SECURITY_HEADERS } from "./security-headers";

describe("buildCsp — prod (nonce + 'self', sin strict-dynamic)", () => {
  const csp = buildCsp("NONCE123", true);

  it("script-src usa nonce + 'self' y NO 'unsafe-inline'/'unsafe-eval'", () => {
    expect(csp).toContain("'nonce-NONCE123'");
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("NO usa 'strict-dynamic' (Ola 18 fix — bloqueaba los chunks lazy de Next)", () => {
    // Con strict-dynamic la allowlist 'self' queda inerte (CSP3) y los chunks lazy de
    // Next (editores de sets, login, admin) se bloqueaban en producción (auditoría 2026-07-26).
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).not.toContain("'strict-dynamic'");
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

  it("connect-src incluye el origen de NEXT_PUBLIC_SUPABASE_URL (stacks no-supabase.co)", () => {
    // Nightly A3: el stack local corre en http://localhost:54321 y la CSP fija
    // bloqueaba el auth del browser (AuthRetryableFetchError). El origen se
    // deriva del env; sin env, connect-src queda como siempre.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    expect(buildCsp("N", true)).toContain("http://localhost:54321");
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(buildCsp("N", true)).not.toContain("localhost");
  });

  it("img-src incluye el origen de NEXT_PUBLIC_SUPABASE_URL (minis del Estudio en local)", () => {
    // 2026-08-07 (reporte de Lucy): las signed URLs de customer-uploads salen
    // con el host del stack local y el img-src fijo las bloqueaba — los
    // thumbnails del Estudio no pintaban en LOCAL (STG/PRD sí, por el wildcard
    // *.supabase.co). El origen derivado del env debe quedar también en img-src.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    const csp = buildCsp("N", true);
    const imgSrc = csp.split("; ").find((d) => d.startsWith("img-src"))!;
    expect(imgSrc).toContain("http://localhost:54321");
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const imgSrcOff = buildCsp("N", true)
      .split("; ")
      .find((d) => d.startsWith("img-src"))!;
    expect(imgSrcOff).not.toContain("localhost");
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
    expect(isOriginAllowed("https://lucamsshop.com", false)).toBe(true);
    expect(isOriginAllowed("https://www.lucamsshop.com", false)).toBe(true);
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
    expect(isOriginAllowed("https://lucams-shop-abc-otra-empresa.vercel.app", false)).toBe(false);
  });

  it("RECHAZA orígenes ajenos (incl. dominios que solo contienen el nombre)", () => {
    expect(isOriginAllowed("https://evil.com", false)).toBe(false);
    expect(isOriginAllowed("https://lucamsshop.com.evil.com", false)).toBe(false);
    expect(isOriginAllowed("https://otra-app.vercel.app", false)).toBe(false);
    expect(isOriginAllowed("http://lucamsshop.com", false)).toBe(false); // http, no https
  });

  it("localhost solo se permite en dev", () => {
    expect(isOriginAllowed("http://localhost:3000", true)).toBe(true);
    expect(isOriginAllowed("http://localhost:3000", false)).toBe(false);
    expect(getAllowedOrigins(false)).not.toContain("http://localhost:3000");
  });

  // El dev server de este repo corre en :4000, no en :3000 (que era el único permitido).
  it("en dev acepta CUALQUIER puerto de localhost, no solo :3000", () => {
    expect(isOriginAllowed("http://localhost:4000", true)).toBe(true);
    expect(isOriginAllowed("http://localhost:5173", true)).toBe(true);
    expect(isOriginAllowed("http://localhost:4000", false)).toBe(false);
  });

  it("el comodín de localhost no abre la puerta a otros hosts ni a https falsos", () => {
    expect(isOriginAllowed("http://localhost.evil.com:4000", true)).toBe(false);
    expect(isOriginAllowed("http://notlocalhost:4000", true)).toBe(false);
    expect(isOriginAllowed("http://localhost:4000.evil.com", true)).toBe(false);
    expect(isOriginAllowed("http://localhost", true)).toBe(false); // sin puerto explícito
  });
});

describe("SECURITY_HEADERS", () => {
  it("incluye las cabeceras defensivas clave", () => {
    // SAMEORIGIN (no DENY) desde C1: el admin enmarca la página pública en la
    // vista previa en vivo; el framing externo sigue bloqueado.
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toContain("max-age=");
    expect(SECURITY_HEADERS["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("la CSP limita el framing al propio origen (frame-ancestors 'self')", () => {
    expect(buildCsp("N", true)).toContain("frame-ancestors 'self'");
    expect(buildCsp("N", false)).toContain("frame-ancestors 'self'");
  });
});
