import { afterEach, describe, expect, it, vi } from "vitest";
import {
  envConfigured,
  INTEGRATION_GROUPS,
  INTEGRATION_REGISTRY,
  integrationConfigurationEnvVars,
} from "./registry";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("integration registry", () => {
  it("conserva los proveedores actuales y sus grupos", () => {
    expect(INTEGRATION_REGISTRY.map((item) => item.key)).toEqual([
      "supabase",
      "wompi",
      "aveonline",
      "resend",
      "whatsapp",
      "turnstile",
      "gemini",
    ]);
    expect(new Set(INTEGRATION_REGISTRY.map((item) => item.group))).toEqual(
      new Set(INTEGRATION_GROUPS),
    );
  });

  it("mantiene claves únicas y variables de configuración dentro del inventario mostrado", () => {
    expect(new Set(INTEGRATION_REGISTRY.map((item) => item.key)).size).toBe(
      INTEGRATION_REGISTRY.length,
    );
    for (const definition of INTEGRATION_REGISTRY) {
      expect(definition.envVarsRequired.length).toBeGreaterThan(0);
      for (const name of integrationConfigurationEnvVars(definition)) {
        expect(definition.envVarsRequired).toContain(name);
      }
    }
  });

  it("referencia únicamente dependencias registradas y sin autorreferencia", () => {
    for (const definition of INTEGRATION_REGISTRY) {
      for (const dependency of definition.dependencies) {
        expect(dependency).not.toBe(definition.key);
        expect(INTEGRATION_REGISTRY.some((item) => item.key === dependency)).toBe(true);
      }
    }
  });

  it("evalúa configuración por presencia completa y no por cadenas vacías", () => {
    vi.stubEnv("REGISTRY_TEST_FIRST", "value");
    vi.stubEnv("REGISTRY_TEST_SECOND", " ");
    expect(envConfigured(["REGISTRY_TEST_FIRST"])).toBe(true);
    expect(envConfigured(["REGISTRY_TEST_FIRST", "REGISTRY_TEST_SECOND"])).toBe(false);
    expect(envConfigured(["REGISTRY_TEST_MISSING"])).toBe(false);
  });
});
