import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateStepCondition, resolveLifecycleTargetPath } from "./eligibility";
import { LifecycleJourneyStepSchema } from "./schemas";
import { isLifecycleDryRun } from "./settings";

afterEach(() => vi.unstubAllEnvs());

describe("lifecycle step rules", () => {
  it("evalúa todas las condiciones de paso", () => {
    const context = {
      hasPaidOrder: false,
      hasAbandonedCart: true,
      loyaltyPoints: 10,
      hasDesignActivity: true,
      hasOptIn: true,
      orderDelivered: false,
      orderSinceEnrollment: false,
    };
    expect(evaluateStepCondition("ALWAYS", context)).toBe(true);
    expect(evaluateStepCondition("NO_PAID_ORDER", context)).toBe(true);
    expect(evaluateStepCondition("HAS_ABANDONED_CART", context)).toBe(true);
    expect(evaluateStepCondition("HAS_LOYALTY_POINTS", context)).toBe(true);
    expect(evaluateStepCondition("HAS_DESIGN_ACTIVITY", context)).toBe(true);
    expect(evaluateStepCondition("HAS_OPT_IN", context)).toBe(true);
    expect(evaluateStepCondition("ORDER_DELIVERED", context)).toBe(false);
    expect(evaluateStepCondition("NO_ORDER_SINCE_ENROLLMENT", context)).toBe(true);
  });

  it("valida CTA interno y rechaza rutas externas o ambiguas", () => {
    const base = {
      position: 1,
      delayMinutes: 0,
      subject: "Asunto válido",
      heading: "Titular válido",
      preheader: "Preheader válido",
      body: "Contenido válido para el paso",
      ctaLabel: "Explorar",
      ctaPath: "/productos",
      commercial: true,
      condition: "ALWAYS" as const,
    };
    expect(LifecycleJourneyStepSchema.safeParse(base).success).toBe(true);
    expect(
      LifecycleJourneyStepSchema.safeParse({ ...base, ctaPath: "https://evil.test" }).success,
    ).toBe(false);
    expect(LifecycleJourneyStepSchema.safeParse({ ...base, ctaPath: "//evil.test" }).success).toBe(
      false,
    );
    expect(
      LifecycleJourneyStepSchema.safeParse({ ...base, ctaPath: "/ruta con espacios" }).success,
    ).toBe(false);
    expect(LifecycleJourneyStepSchema.safeParse({ ...base, ctaPath: "/\\evil.test" }).success).toBe(
      false,
    );
  });

  it("dirige activación, recompra y reactivación al producto contextual", () => {
    for (const trigger of [
      "FIRST_PURCHASE",
      "SECOND_PURCHASE",
      "REACTIVATION",
      "HIGH_INTENT",
    ] as const) {
      expect(
        resolveLifecycleTargetPath(trigger, "/recomendador", {
          lastProductSlug: "set fotoimanes",
        }),
      ).toBe("/producto/set%20fotoimanes");
    }
    expect(
      resolveLifecycleTargetPath("SECOND_PURCHASE", "/mi-cuenta", {
        lastProductSlug: "fotoimanes",
      }),
    ).toBe("/mi-cuenta");
    expect(
      resolveLifecycleTargetPath("B2B_FOLLOW_UP", "/productos", {
        lastProductSlug: "fotoimanes",
      }),
    ).toBe("/productos");
  });

  it("fuerza DRY_RUN en Preview y admite activación explícita en otros ambientes", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("LIFECYCLE_DRY_RUN", "0");
    expect(isLifecycleDryRun()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isLifecycleDryRun()).toBe(false);
    vi.stubEnv("LIFECYCLE_DRY_RUN", "true");
    expect(isLifecycleDryRun()).toBe(true);
  });
});
