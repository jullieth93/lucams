/*
 * Tests de requireRecentMfa (F-10, auditoría pre-lanzamiento 2026-09-04).
 *
 * El step-up MFA exige que la elevación aal2 sea RECIENTE (≤ 10 min default),
 * medida por el timestamp del claim amr del JWT (método otp/totp/mfa-totp).
 * Fail-closed: sin aal2, sin amr TOTP con timestamp, o elevación vieja →
 * MfaReauthRequiredError (code MFA_REAUTH_REQUIRED).
 *
 * Todo mockeado: el server client de Supabase se sustituye por un stub que
 * devuelve el AAL/amr controlado (mismo patrón que admin-rbac-guard.test.ts).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    aal: null as {
      currentLevel: string | null;
      nextLevel: string | null;
      currentAuthenticationMethods: unknown;
    } | null,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: state.aal }),
      },
    },
  }),
}));

import {
  latestTotpAmrTimestamp,
  MFA_REAUTH_REQUIRED,
  MfaReauthRequiredError,
  requireRecentMfa,
} from "./admin-reauth";

const NOW = new Date("2026-09-04T15:00:00Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

function aal2With(amr: unknown) {
  return { currentLevel: "aal2", nextLevel: "aal2", currentAuthenticationMethods: amr };
}

/** amr típico: login con password + elevación TOTP hace `totpSecondsAgo`. */
function amrWithTotp(totpSecondsAgo: number) {
  return [
    { method: "password", timestamp: NOW_SEC - 1800 },
    { method: "otp", timestamp: NOW_SEC - totpSecondsAgo },
  ];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  state.aal = aal2With(amrWithTotp(60));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("latestTotpAmrTimestamp", () => {
  it("devuelve el timestamp del TOTP más reciente", () => {
    const amr = [
      { method: "password", timestamp: 100 },
      { method: "otp", timestamp: 200 },
      { method: "totp", timestamp: 300 },
    ];
    expect(latestTotpAmrTimestamp(amr)).toBe(300);
  });

  it("acepta los tres nombres de método TOTP (otp, totp, mfa/totp)", () => {
    for (const method of ["otp", "totp", "mfa/totp"]) {
      expect(latestTotpAmrTimestamp([{ method, timestamp: 42 }])).toBe(42);
    }
  });

  it("ignora métodos que no son TOTP (password, oauth)", () => {
    expect(
      latestTotpAmrTimestamp([
        { method: "password", timestamp: 500 },
        { method: "oauth", timestamp: 600 },
      ]),
    ).toBeNull();
  });

  it("amr en formato plano RFC-8176 (strings, sin timestamp) → null (fail-closed)", () => {
    expect(latestTotpAmrTimestamp(["password", "otp"])).toBeNull();
  });

  it("amr ausente o malformado → null", () => {
    expect(latestTotpAmrTimestamp(undefined)).toBeNull();
    expect(latestTotpAmrTimestamp(null)).toBeNull();
    expect(latestTotpAmrTimestamp([])).toBeNull();
    expect(latestTotpAmrTimestamp([{ method: "otp" }])).toBeNull();
    expect(latestTotpAmrTimestamp([{ method: "otp", timestamp: "hace-un-rato" }])).toBeNull();
  });
});

describe("requireRecentMfa", () => {
  it("aal2 elevado hace 1 minuto → pasa", async () => {
    await expect(requireRecentMfa()).resolves.toBeUndefined();
  });

  it("aal2 elevado hace 15 minutos → MfaReauthRequiredError (code MFA_REAUTH_REQUIRED)", async () => {
    state.aal = aal2With(amrWithTotp(15 * 60));
    await expect(requireRecentMfa()).rejects.toMatchObject({
      name: "MfaReauthRequiredError",
      code: MFA_REAUTH_REQUIRED,
    });
  });

  it("borde exacto de la ventana (10 min) → pasa; un segundo después → rechaza", async () => {
    state.aal = aal2With(amrWithTotp(10 * 60));
    await expect(requireRecentMfa()).resolves.toBeUndefined();

    state.aal = aal2With(amrWithTotp(10 * 60 + 1));
    await expect(requireRecentMfa()).rejects.toBeInstanceOf(MfaReauthRequiredError);
  });

  it("sin aal2 (sesión aal1) → rechaza aunque haya amr TOTP reciente", async () => {
    state.aal = {
      currentLevel: "aal1",
      nextLevel: "aal2",
      currentAuthenticationMethods: amrWithTotp(30),
    };
    await expect(requireRecentMfa()).rejects.toBeInstanceOf(MfaReauthRequiredError);
  });

  it("sin entrada TOTP en el amr (solo password) → rechaza", async () => {
    state.aal = aal2With([{ method: "password", timestamp: NOW_SEC - 60 }]);
    await expect(requireRecentMfa()).rejects.toBeInstanceOf(MfaReauthRequiredError);
  });

  it("amr en formato plano (strings) → rechaza (no se puede probar frescura)", async () => {
    state.aal = aal2With(["password", "otp"]);
    await expect(requireRecentMfa()).rejects.toBeInstanceOf(MfaReauthRequiredError);
  });

  it("getAuthenticatorAssuranceLevel sin data (error transitorio) → fail-closed", async () => {
    state.aal = null;
    await expect(requireRecentMfa()).rejects.toBeInstanceOf(MfaReauthRequiredError);
  });

  it("respeta una ventana custom (maxMinutes)", async () => {
    state.aal = aal2With(amrWithTotp(4 * 60));
    await expect(requireRecentMfa({ maxMinutes: 3 })).rejects.toBeInstanceOf(
      MfaReauthRequiredError,
    );
    await expect(requireRecentMfa({ maxMinutes: 5 })).resolves.toBeUndefined();
  });

  it("un password reciente NO cuenta como segundo factor", async () => {
    state.aal = aal2With([
      { method: "otp", timestamp: NOW_SEC - 25 * 60 },
      { method: "password", timestamp: NOW_SEC - 30 },
    ]);
    await expect(requireRecentMfa()).rejects.toBeInstanceOf(MfaReauthRequiredError);
  });
});
