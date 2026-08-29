/*
 * Regresión (auditoría 2026-08-24 · B-3): enumeración de cuentas en el registro.
 *
 * Antes: con un email YA registrado la acción devolvía "Este correo ya tiene una
 * cuenta…" — oráculo de existencia de cuentas. Ahora devuelve la MISMA respuesta
 * genérica de un signup exitoso y el aviso va por email al dueño del correo
 * (misma política anti-enumeración que login y recuperar-password).
 *
 * Mocks en el borde (patrón consent.test.ts): el template y sendEmail se mockean
 * para no acoplar el test al CMS/DB ni a Resend.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.hoisted(() => vi.fn());
const verifyTurnstileToken = vi.hoisted(() =>
  vi.fn(async (): Promise<{ success: boolean; reason?: string }> => ({ success: true })),
);
const rateLimit = vi.hoisted(() => vi.fn(async () => ({ allowed: true })));
const checkPwnedPassword = vi.hoisted(() => vi.fn(async () => ({ pwned: false, count: 0 })));
const recordHabeasDataConsent = vi.hoisted(() => vi.fn(async () => {}));
const sendEmail = vi.hoisted(() => vi.fn(async () => ({ sent: true as const, id: "mail-1" })));
const accountExistsNoticeEmail = vi.hoisted(() =>
  vi.fn(async () => ({
    subject: "¿Intentaste crear una cuenta en Lucams_shop?",
    html: "<p>html</p>",
    text: "texto",
  })),
);
const customerCreate = vi.hoisted(() => vi.fn(async () => ({ id: "cust-1" })));

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
vi.mock("@/features/referrals/service", () => ({
  attachReferral: vi.fn(async () => {}),
  findReferrerByCode: vi.fn(async () => null),
}));
vi.mock("@/features/emails/templates/account-exists-notice", () => ({ accountExistsNoticeEmail }));
vi.mock("@/lib/resend", () => ({ sendEmail }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signUp } }),
}));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: () => ({ auth: { admin: { deleteUser: vi.fn() } } }),
}));
vi.mock("@/lib/db", () => ({ prisma: { customer: { create: customerCreate } } }));
vi.mock("@/lib/origin", () => ({ getRequestOrigin: async () => "https://lucamsshop.com" }));

import { signupAction } from "./actions";

/** FormData de un registro válido (con la casilla de tratamiento marcada). */
function signupForm(): FormData {
  const fd = new FormData();
  fd.set("email", "lucia@example.com");
  fd.set("password", "Un4-Clave-Larga!x");
  fd.set("passwordConfirm", "Un4-Clave-Larga!x");
  fd.set("firstName", "Lucía");
  fd.set("cf-turnstile-response", "tok");
  fd.set("dataConsent", "on");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyTurnstileToken.mockResolvedValue({ success: true });
  rateLimit.mockResolvedValue({ allowed: true });
});

describe("signupAction — anti-enumeración (B-3)", () => {
  it("email YA registrado → éxito genérico (sin revelar existencia) + aviso por email al dueño", async () => {
    // Supabase devuelve "éxito falso": user con identities=[] cuando ya existe.
    signUp.mockResolvedValue({
      data: { user: { id: "u-existente", identities: [] }, session: null },
      error: null,
    });

    const res = await signupAction(null, signupForm());

    expect(res.error).toBeUndefined();
    expect(res.success).toMatch(/si el correo está disponible/i);
    // El aviso sale al correo del dueño, con el template dedicado.
    expect(accountExistsNoticeEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "lucia@example.com",
        subject: expect.stringContaining("cuenta"),
      }),
    );
    // NUNCA se crea Customer para un user existente (rompería la unique constraint).
    expect(customerCreate).not.toHaveBeenCalled();
  });

  it("si el envío del aviso falla, la respuesta sigue siendo el éxito genérico", async () => {
    signUp.mockResolvedValue({
      data: { user: { id: "u-existente", identities: [] }, session: null },
      error: null,
    });
    sendEmail.mockRejectedValueOnce(new Error("resend caído"));

    const res = await signupAction(null, signupForm());

    expect(res.error).toBeUndefined();
    expect(res.success).toMatch(/si el correo está disponible/i);
  });

  it("email NUEVO → flujo normal intacto: crea Customer y redirige a /confirmar-codigo (sin aviso)", async () => {
    signUp.mockResolvedValue({
      data: { user: { id: "u-nuevo", identities: [{ id: "i1" }] }, session: null },
      error: null,
    });

    await expect(signupAction(null, signupForm())).rejects.toThrow(
      /^REDIRECT:\/confirmar-codigo\?/,
    );
    expect(customerCreate).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
