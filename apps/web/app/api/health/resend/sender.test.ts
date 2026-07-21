/*
 * Cobertura del chequeo de coherencia del remitente en /api/health/resend.
 *
 * Motivación real (2026-07-20): el healthcheck decía "ok" con solo validar la API key. Con
 * EMAIL_FROM apuntando al sandbox `onboarding@resend.dev` — o a un dominio sin verificar —
 * seguía diciendo "ok" y ningún correo salía con la marca de la tienda. Estos tests fijan
 * que cada forma de esa mala configuración se reporte, no se silencie.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { senderDomainOf, buildSenderReport } from "./route";

const VERIFIED = [
  { name: "mail.lucamsshop.com", status: "verified", region: "sa-east-1" },
  { name: "otro.lucamsshop.com", status: "pending", region: "sa-east-1" },
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("senderDomainOf", () => {
  it("extrae el dominio del formato `Nombre <buzon@dominio>`", () => {
    expect(senderDomainOf("Lucams_shop <hola@mail.lucamsshop.com>")).toBe("mail.lucamsshop.com");
  });

  it("extrae el dominio de un correo pelado y normaliza a minúsculas", () => {
    expect(senderDomainOf("HOLA@Mail.LucamsShop.com")).toBe("mail.lucamsshop.com");
  });

  it("devuelve null cuando no hay un correo válido", () => {
    expect(senderDomainOf(undefined)).toBeNull();
    expect(senderDomainOf("Lucams_shop")).toBeNull();
    expect(senderDomainOf("@sindominio")).toBeNull();
    expect(senderDomainOf("sinarroba@")).toBeNull();
  });
});

describe("buildSenderReport", () => {
  it("ok cuando el dominio de EMAIL_FROM está verificado y hay EMAIL_REPLY_TO", () => {
    vi.stubEnv("EMAIL_FROM", "Lucams_shop <hola@mail.lucamsshop.com>");
    vi.stubEnv("EMAIL_REPLY_TO", "hola@lucamsshop.com");

    const r = buildSenderReport(VERIFIED);
    expect(r.ok).toBe(true);
    expect(r.domain).toBe("mail.lucamsshop.com");
    expect(r.domainStatus).toBe("verified");
    expect(r.region).toBe("sa-east-1");
    expect(r.detail).toBeUndefined();
  });

  it("avisa cuando EMAIL_FROM sigue en el sandbox de Resend (el fallo que motivó el check)", () => {
    vi.stubEnv("EMAIL_FROM", "Lucams_shop <onboarding@resend.dev>");
    vi.stubEnv("EMAIL_REPLY_TO", "hola@lucamsshop.com");

    const r = buildSenderReport(VERIFIED);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("resend.dev");
    expect(r.detail).toContain("no está registrado");
  });

  it("avisa cuando el dominio existe pero NO está verificado", () => {
    vi.stubEnv("EMAIL_FROM", "Lucams_shop <hola@otro.lucamsshop.com>");
    vi.stubEnv("EMAIL_REPLY_TO", "hola@lucamsshop.com");

    const r = buildSenderReport(VERIFIED);
    expect(r.ok).toBe(false);
    expect(r.domainStatus).toBe("pending");
    expect(r.detail).toContain("pending");
  });

  it("avisa cuando falta EMAIL_REPLY_TO aunque el dominio esté verificado", () => {
    vi.stubEnv("EMAIL_FROM", "Lucams_shop <hola@mail.lucamsshop.com>");
    vi.stubEnv("EMAIL_REPLY_TO", "");

    const r = buildSenderReport(VERIFIED);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("EMAIL_REPLY_TO");
  });

  it("avisa cuando no hay EMAIL_FROM en absoluto", () => {
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("EMAIL_REPLY_TO", "hola@lucamsshop.com");

    const r = buildSenderReport(VERIFIED);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("EMAIL_FROM no configurada");
  });

  it("no revienta si la cuenta no tiene dominios", () => {
    vi.stubEnv("EMAIL_FROM", "Lucams_shop <hola@mail.lucamsshop.com>");
    vi.stubEnv("EMAIL_REPLY_TO", "hola@lucamsshop.com");

    const r = buildSenderReport([]);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("no está registrado");
  });
});
