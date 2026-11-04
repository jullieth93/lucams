import { describe, expect, it, vi } from "vitest";
import {
  canonicalContactPair,
  ensureCustomerContact,
  hasIdentityDelegates,
  isAnonymizedPlaceholderEmail,
  normalizeEmailIdentity,
  normalizePhoneIdentityE164,
  normalizeTaxDocumentIdentity,
  resolveAbandonedCartContact,
  resolveConsentContact,
  resolveOrderContactTx,
  resolvePostSaleContact,
  resolveQuoteContactTx,
  resolveSupportTicketContact,
} from "./resolution-service";

describe("resolution-service — normalizadores puros e invariantes unitarios (S15 · ADR-193)", () => {
  it("normaliza emails y descarta vacíos o placeholders anonimizados Ley 1581", () => {
    expect(normalizeEmailIdentity("  Ana.Maria@Lucams.CO ")).toBe("ana.maria@lucams.co");
    expect(normalizeEmailIdentity("")).toBe("");
    expect(normalizeEmailIdentity("sin-arroba")).toBe("");
    expect(normalizeEmailIdentity("deleted-cust123@deleted.lucamsshop.com")).toBe("");
    expect(isAnonymizedPlaceholderEmail("DELETED-abc@deleted.lucamsshop.com ")).toBe(true);
    expect(isAnonymizedPlaceholderEmail("cliente@gmail.com")).toBe(false);
  });

  it("normaliza teléfonos colombianos e internacionales a E.164 estricto", () => {
    expect(normalizePhoneIdentityE164("300 123 4567")).toBe("+573001234567");
    expect(normalizePhoneIdentityE164("+57 (310) 999-8877")).toBe("+573109998877");
    expect(normalizePhoneIdentityE164("00573201112233")).toBe("+573201112233");
    expect(normalizePhoneIdentityE164("+1 305-555-0199")).toBe("+13055550199");
    expect(normalizePhoneIdentityE164("tel-invalido")).toBe("");
    expect(normalizePhoneIdentityE164("123")).toBe("");
  });

  it("normaliza documentos tributarios DIAN de forma determinista", () => {
    expect(normalizeTaxDocumentIdentity("cc", " 1.020.304.050 ")).toEqual({
      documentType: "CC",
      documentNumber: "1020304050",
      key: "CC:1020304050",
    });
    expect(normalizeTaxDocumentIdentity("nit", "900.123.456-7")).toEqual({
      documentType: "NIT",
      documentNumber: "900123456-7",
      key: "NIT:900123456-7",
    });
    expect(normalizeTaxDocumentIdentity(null, "1020")).toBeNull();
    expect(normalizeTaxDocumentIdentity("CC", "   ")).toBeNull();
  });

  it("construye pares canónicos inmutables y rechaza auto-pares", () => {
    expect(canonicalContactPair("c_zzz", "c_aaa")).toEqual(["c_aaa", "c_zzz"]);
    expect(canonicalContactPair("c_aaa", "c_zzz")).toEqual(["c_aaa", "c_zzz"]);
    expect(canonicalContactPair("c_same", "c_same")).toBeNull();
    expect(canonicalContactPair("", "c_aaa")).toBeNull();
  });

  it("degrada limpiamente a null sobre mocks parciales de tests unitarios sin delegados Contact", async () => {
    const partialMock = {
      order: { create: vi.fn() },
    } as never;

    expect(hasIdentityDelegates(partialMock)).toBe(false);
    await expect(
      ensureCustomerContact(partialMock, { customerId: "c1", emailVerified: true }),
    ).resolves.toBeNull();
    await expect(
      resolveOrderContactTx(partialMock, {
        sessionCustomerId: null,
        orderEmail: "guest@test.local",
        buyerPhone: "3001234567",
      }),
    ).resolves.toBeNull();
    await expect(
      resolveSupportTicketContact(partialMock, { email: "guest@test.local" }),
    ).resolves.toBeNull();
    await expect(
      resolveQuoteContactTx(partialMock, {
        customerName: "Ana",
        customerWhatsapp: "3001234567",
      }),
    ).resolves.toBeNull();
    await expect(
      resolveAbandonedCartContact(partialMock, { email: "guest@test.local" }),
    ).resolves.toBeNull();
    await expect(resolveConsentContact(partialMock, { email: null })).resolves.toBeNull();
    await expect(
      resolvePostSaleContact(partialMock, { orderContactId: "ctc_existing" }),
    ).resolves.toBe("ctc_existing");
  });
});
