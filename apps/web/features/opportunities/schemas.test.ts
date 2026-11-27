import { describe, expect, it } from "vitest";
import { B2bInquirySchema, MAX_B2B_MONEY_PESOS, SaveProposalDraftSchema } from "./schemas";

describe("B2bInquirySchema", () => {
  const validPayload = {
    contactName: "valentina del pilar gómez",
    organizationName: "Estudio Creativo SAS",
    nit: "900.123.456",
    email: "  VALENTINA@EMPRESA.CO ",
    whatsapp: "+57 320 887 3826",
    eventType: "CORPORATE_GIFT" as const,
    expectedUnits: 50,
    eventDate: "",
    city: "Bogotá D.C.",
    department: "Bogotá D.C.",
    notes: "Queremos fotoimanes corporativos con empaque individual para fin de año.",
    acceptHabeasData: true as const,
    acceptNewsletter: false,
  };

  it("normalizes name to Title Case, email to lowercase, phone to 10-digit CO, and appends DIAN NIT DV", () => {
    const parsed = B2bInquirySchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.contactName).toBe("Valentina del Pilar Gómez");
      expect(parsed.data.email).toBe("valentina@empresa.co");
      expect(parsed.data.whatsapp).toBe("3208873826");
      expect(parsed.data.nit).toBe("900123456-8");
    }
  });

  it("rejects names with numbers or more than 5 words", () => {
    expect(
      B2bInquirySchema.safeParse({ ...validPayload, contactName: "Valentina 2" }).success,
    ).toBe(false);
    expect(
      B2bInquirySchema.safeParse({
        ...validPayload,
        contactName: "Ana María De La Cruz Gómez",
      }).success,
    ).toBe(false);
  });

  it("rejects NIT with wrong DIAN check digit", () => {
    const parsed = B2bInquirySchema.safeParse({ ...validPayload, nit: "900123456-7" });
    expect(parsed.success).toBe(false);
  });

  it("accepts international WhatsApp numbers with dial code", () => {
    const parsed = B2bInquirySchema.safeParse({ ...validPayload, whatsapp: "+1 2025550199" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.whatsapp).toBe("+12025550199");
    }
  });

  it("rejects past event dates", () => {
    const parsed = B2bInquirySchema.safeParse({ ...validPayload, eventDate: "2020-01-01" });
    expect(parsed.success).toBe(false);
  });
});

describe("SaveProposalDraftSchema — guarda INT4 en montos B2B (#1)", () => {
  const baseDraft = {
    opportunityId: "opp_1",
    validUntilDate: "2099-12-31",
    proofMode: "AFTER_PAYMENT" as const,
    artworkMode: "SAME_DESIGN" as const,
    packagingType: "BULK_STANDARD" as const,
    estimatedProductionDays: 5,
    shippingMode: "QUOTED" as const,
    shippingCarrier: "AVEONLINE",
    shippingService: "Terrestre",
    packageCount: 1,
    departmentCode: "11",
    cityCode: "11001",
    shippingPesos: 0,
    discountPesos: 0,
    items: [{ variantId: "var_1", qty: 1, designUnits: 1, unitPricePesos: 10_000 }],
  };

  it("acepta una propuesta exactamente en el tope INT4 ($21.474.836 COP)", () => {
    expect(MAX_B2B_MONEY_PESOS).toBe(21_474_836);
    const ok = SaveProposalDraftSchema.safeParse({
      ...baseDraft,
      items: [{ variantId: "var_1", qty: 1, designUnits: 1, unitPricePesos: MAX_B2B_MONEY_PESOS }],
    });
    expect(ok.success).toBe(true);
  });

  it("rechaza precio unitario que exceda INT4 al convertir a centavos", () => {
    const bad = SaveProposalDraftSchema.safeParse({
      ...baseDraft,
      items: [
        { variantId: "var_1", qty: 1, designUnits: 1, unitPricePesos: MAX_B2B_MONEY_PESOS + 1 },
      ],
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues[0]?.path).toEqual(["items", 0, "unitPricePesos"]);
      expect(bad.error.issues[0]?.message).toMatch(/21\.474\.836/);
    }
  });

  it("rechaza subtotal/total multi-unidad que desborde INT4 (ej. 500 × $50.000 = $25.000.000 COP)", () => {
    const overflow = SaveProposalDraftSchema.safeParse({
      ...baseDraft,
      items: [{ variantId: "var_1", qty: 500, designUnits: 1, unitPricePesos: 50_000 }],
    });
    expect(overflow.success).toBe(false);
    if (!overflow.success) {
      expect(overflow.error.issues[0]?.message).toMatch(/21\.474\.836/);
    }
  });
});
