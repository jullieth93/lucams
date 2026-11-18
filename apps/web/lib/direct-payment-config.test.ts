import { describe, expect, it } from "vitest";
import { BREB_REGULATORY_MAX_CENTS, getDirectPaymentConfig } from "./direct-payment-config";

describe("getDirectPaymentConfig (ADR-210)", () => {
  it("opera fail-closed (enabled=false) cuando no hay llave Bre-B ni cuenta bancaria completa", () => {
    const empty = getDirectPaymentConfig({ NODE_ENV: "test" });
    expect(empty.enabled).toBe(false);
    expect(empty.hasBreb).toBe(false);
    expect(empty.hasBankAccount).toBe(false);

    const incompleteBank = getDirectPaymentConfig({
      NODE_ENV: "test",
      DIRECT_PAYMENT_BANK_NAME: "Bancolombia",
    });
    expect(incompleteBank.enabled).toBe(false);
    expect(incompleteBank.hasBankAccount).toBe(false);
  });

  it("habilita Bre-B con solo DIRECT_PAYMENT_BREB_KEY y limpia comillas envolventes", () => {
    const cfg = getDirectPaymentConfig({
      NODE_ENV: "test",
      DIRECT_PAYMENT_BREB_KEY: ' "@lucamsshop" ',
      DIRECT_PAYMENT_BREB_HOLDER: '"Lucams Shop"',
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.hasBreb).toBe(true);
    expect(cfg.hasBankAccount).toBe(false);
    expect(cfg.brebKey).toBe("@lucamsshop");
    expect(cfg.brebHolder).toBe("Lucams Shop");
    expect(cfg.maxBrebCopCents).toBe(BREB_REGULATORY_MAX_CENTS);
  });

  it("habilita transferencia bancaria cuando existen banco y número de cuenta", () => {
    const cfg = getDirectPaymentConfig({
      NODE_ENV: "test",
      DIRECT_PAYMENT_BANK_NAME: "Bancolombia",
      DIRECT_PAYMENT_ACCOUNT_TYPE: "Ahorros",
      DIRECT_PAYMENT_ACCOUNT_NUMBER: "123-456789-00",
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.hasBreb).toBe(false);
    expect(cfg.hasBankAccount).toBe(true);
    expect(cfg.bankName).toBe("Bancolombia");
    expect(cfg.accountNumber).toBe("123-456789-00");
  });
});
