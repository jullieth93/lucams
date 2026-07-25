/*
 * Regresión (auditoría del contenido legal, 2026-07-21 · Ley 1581 art. 9).
 *
 * El registro persistía la autorización de tratamiento infiriéndola de un aviso PASIVO del
 * formulario ("Al crear tu cuenta aceptas…"): la fila Consent se escribía server-side sin ningún
 * acto afirmativo del titular. Peor: el aviso de privacidad declaraba públicamente que la
 * autorización se pedía "con una casilla que tú marcas" al crear la cuenta — una casilla que no
 * existía. Declarar ante la SIC un mecanismo de autorización inexistente desmiente la prueba misma.
 *
 * Ahora la casilla existe y la acción rechaza sin ella, ANTES de crear el usuario o tocar la PII.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.hoisted(() => vi.fn());
const verifyTurnstileToken = vi.hoisted(() =>
  vi.fn(async (): Promise<{ success: boolean; reason?: string }> => ({ success: true })),
);
const rateLimit = vi.hoisted(() => vi.fn(async () => ({ allowed: true })));
const checkPwnedPassword = vi.hoisted(() => vi.fn(async () => ({ pwned: false, count: 0 })));
const recordHabeasDataConsent = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "1.2.3.4" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error("REDIRECT:" + to);
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/rate-limit-keys", () => ({
  emailKey: (...a: string[]) => a.join(":"),
  ipKey: (...a: string[]) => a.join(":"),
}));
vi.mock("@/lib/pwned-passwords", () => ({ checkPwnedPassword }));
vi.mock("@/features/consent/service", () => ({ recordHabeasDataConsent }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signUp } }),
}));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: () => ({ auth: { admin: { deleteUser: vi.fn() } } }),
}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/origin", () => ({ getRequestOrigin: async () => "https://lucamsshop.com" }));

import { signupAction } from "./actions";

/** FormData de un registro válido; `consent:false` omite la casilla. */
function signupForm({ consent = true }: { consent?: boolean } = {}): FormData {
  const fd = new FormData();
  fd.set("email", "lucia@example.com");
  fd.set("password", "Un4-Clave-Larga!x");
  fd.set("passwordConfirm", "Un4-Clave-Larga!x");
  fd.set("firstName", "Lucía");
  fd.set("lastName", "Pérez");
  fd.set("cf-turnstile-response", "tok");
  if (consent) fd.set("dataConsent", "on");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyTurnstileToken.mockResolvedValue({ success: true });
  rateLimit.mockResolvedValue({ allowed: true });
});

describe("signupAction — autorización de tratamiento obligatoria", () => {
  it("SIN la casilla marcada rechaza y NO crea el usuario", async () => {
    const res = await signupAction(null, signupForm({ consent: false }));

    expect(res.error).toMatch(/datos personales/i);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("señala el campo para que el formulario pinte el error", async () => {
    const res = await signupAction(null, signupForm({ consent: false }));

    expect(res.fieldErrors?.dataConsent?.[0]).toMatch(/[Aa]utoriza/);
  });

  it("un valor distinto de 'on' no cuenta como autorización", async () => {
    const fd = signupForm({ consent: false });
    fd.set("dataConsent", "false");

    const res = await signupAction(null, fd);

    expect(res.error).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("se exige ANTES del anti-bot y del rate-limit (no gasta cuota del titular)", async () => {
    await signupAction(null, signupForm({ consent: false }));

    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("CON la casilla marcada la validación deja pasar y el flujo continúa al anti-bot", async () => {
    verifyTurnstileToken.mockResolvedValue({ success: false, reason: "stop-here" });

    const res = await signupAction(null, signupForm());

    // No se corta por consentimiento: llega al anti-bot, que es el siguiente guardián.
    expect(verifyTurnstileToken).toHaveBeenCalledTimes(1);
    expect(res.fieldErrors?.dataConsent).toBeUndefined();
  });
});
