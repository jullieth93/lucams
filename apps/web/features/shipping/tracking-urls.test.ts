import { describe, expect, it } from "vitest";
import { carrierTrackingPageUrl } from "./tracking-urls";

describe("carrierTrackingPageUrl", () => {
  it("mapea las transportadoras conocidas (normalizando espacios/case)", () => {
    // URLs verificadas en vivo con contenido de rastreo real (2026-10-20).
    expect(carrierTrackingPageUrl("servientrega")).toBe(
      "https://www.servientrega.com/wps/portal/rastreo-envio",
    );
    expect(carrierTrackingPageUrl("SERVIENTREGA")).toContain("servientrega.com");
    expect(carrierTrackingPageUrl("TCC SA")).toBe("https://tcc.com.co/rastreo/");
    // envia.com.co está MUERTO (sin respuesta, verificado 2026-10-20) — el
    // dominio real de Envía es envia.co (hallazgo del owner).
    expect(carrierTrackingPageUrl("envia")).toBe("https://envia.co/tracking");
    expect(carrierTrackingPageUrl("Coordinadora Mercantil")).toBe(
      "https://coordinadora.com/rastreo/rastreo-de-guia/",
    );
    expect(carrierTrackingPageUrl("interrapidisimo")).toContain("interrapidisimo.com");
    expect(carrierTrackingPageUrl("99MINUTOS")).toBe("https://tracking.99minutos.com/");
    // El rastreo de Domina corre sobre la plataforma Infokairos (owner 2026-10-20).
    expect(carrierTrackingPageUrl("Domina")).toBe("https://tracking.infokairos.com.co/");
  });

  it("devuelve null para transportadoras desconocidas, vacías o sin portal vivo (Saferbo, Go Envíos)", () => {
    expect(carrierTrackingPageUrl("dhl-express")).toBeNull();
    // saferbo.com redirige a una tienda de zapatos (dominio vendido) y
    // goenvios.com es un stub de redirección sin rastreador verificable — sin
    // URL a propósito, el caller cae a la vista propia /pedido/<token>.
    expect(carrierTrackingPageUrl("saferbo")).toBeNull();
    expect(carrierTrackingPageUrl("GO ENVIOS")).toBeNull();
    expect(carrierTrackingPageUrl("")).toBeNull();
    expect(carrierTrackingPageUrl(null)).toBeNull();
    expect(carrierTrackingPageUrl(undefined)).toBeNull();
  });
});
