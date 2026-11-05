import { describe, expect, it } from "vitest";
import { B2bInquirySchema } from "./schemas";

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
