import { describe, expect, it } from "vitest";
import { assertWompiSandboxForE2E } from "./e2e/_setup/env";

function sandboxEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    WOMPI_ENV: "sandbox",
    WOMPI_PUBLIC_KEY: "pub_test_example",
    WOMPI_PRIVATE_KEY: "prv_test_example",
    WOMPI_INTEGRITY_SECRET: "test_integrity_example",
    WOMPI_EVENTS_SECRET: "test_events_example",
    ...overrides,
  };
}

describe("assertWompiSandboxForE2E", () => {
  it("acepta un entorno y las cuatro llaves sandbox", () => {
    expect(() => assertWompiSandboxForE2E(sandboxEnv())).not.toThrow();
  });

  it.each([undefined, "production", "preview", "SANDBOX"])(
    "rechaza WOMPI_ENV=%s antes de abrir el checkout",
    (value) => {
      expect(() => assertWompiSandboxForE2E(sandboxEnv({ WOMPI_ENV: value }))).toThrow(
        /WOMPI_ENV must be exactly "sandbox"/,
      );
    },
  );

  it.each([
    ["WOMPI_PUBLIC_KEY", "pub_prod_example", "pub_test_"],
    ["WOMPI_PRIVATE_KEY", "prv_prod_example", "prv_test_"],
    ["WOMPI_INTEGRITY_SECRET", "prod_integrity_example", "test_integrity_"],
    ["WOMPI_EVENTS_SECRET", "prod_events_example", "test_events_"],
  ])("rechaza %s con prefijo productivo aunque el modo sea sandbox", (key, value, prefix) => {
    expect(() => assertWompiSandboxForE2E(sandboxEnv({ [key]: value }))).toThrow(prefix);
  });
});
