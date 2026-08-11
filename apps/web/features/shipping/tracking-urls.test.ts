import { describe, expect, it } from "vitest";
import { carrierTrackingPageUrl } from "./tracking-urls";

describe("carrierTrackingPageUrl", () => {
  it("mapea las transportadoras conocidas (normalizando espacios/case)", () => {
    expect(carrierTrackingPageUrl("servientrega")).toContain("servientrega.com");
    expect(carrierTrackingPageUrl("SERVIENTREGA")).toContain("servientrega.com");
    expect(carrierTrackingPageUrl("TCC SA")).toContain("tcc.com.co");
    expect(carrierTrackingPageUrl("envia")).toContain("envia.com.co");
    expect(carrierTrackingPageUrl("Coordinadora Mercantil")).toContain("coordinadora.com");
    expect(carrierTrackingPageUrl("interrapidisimo")).toContain("interrapidisimo.com");
  });

  it("devuelve null para transportadoras desconocidas o vacías", () => {
    expect(carrierTrackingPageUrl("dhl-express")).toBeNull();
    expect(carrierTrackingPageUrl("")).toBeNull();
    expect(carrierTrackingPageUrl(null)).toBeNull();
    expect(carrierTrackingPageUrl(undefined)).toBeNull();
  });
});
