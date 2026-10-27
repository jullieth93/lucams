/*
 * Server Action — login con email/password.
 *
 * Flujo:
 *   1. Validar input con Zod.
 *   2. Rate-limit por IP y por email (15 intentos / 15 min en prod, 50 en dev)
 *      para mitigar brute force.
 *   3. supabase.auth.signInWithPassword(...).
 *   4. En éxito: redirect a `/` (la cookie ya está escrita por proxy.ts).
 *   5. En error: devolver { error } sin distinguir "email no existe" de
 *      "password mal" para no facilitar enumeración de cuentas.
 *
 * Mensajes de error:
 *   - Genéricos al cliente.
 *   - Específicos al logger estructurado (para diagnóstico).
 */

"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { mergeAnonCartIntoCustomer, recoverCustomerCartSessionId } from "@/features/cart/service";
import { claimGuestOrdersForCustomer } from "@/features/orders/claim-guest-orders";
import { awardRetroactivePointsForNewCustomer } from "@/features/loyalty/service";
import { peekCartSession, setCartSessionCookie } from "@/lib/cart-session";
import {
  CUSTOMER_ACTIVITY_COOKIE,
  customerActivityCookieOptions,
  sealCustomerActivityMark,
} from "@/lib/customer-activity";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { emailKey, ipKey } from "@/lib/rate-limit-keys";
import { safeRedirectTarget } from "@/lib/safe-redirect";
import { recordSecurityEvent, SECURITY_EVENT } from "@/lib/security-events";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/client-ip";

const LoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export type LoginActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string[]>>;
};

export async function loginAction(
  _prev: LoginActionState | null,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Datos inválidos.",
      fieldErrors: flat.fieldErrors as Partial<Record<"email" | "password", string[]>>,
    };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const isProd = process.env.VERCEL_ENV === "production";

  // Rate-limit doble: por IP y por email.
  const rlIp = await rateLimit(ipKey("login", ip), isProd ? 15 : 50, 15 * 60);
  const rlEmail = await rateLimit(emailKey("login", parsed.data.email), isProd ? 15 : 50, 15 * 60);
  if (!rlIp.allowed || !rlEmail.allowed) {
    logger.warn({
      event: "auth.login.rate_limited",
      ip,
      ipCount: rlIp.count,
      emailCount: rlEmail.count,
    });
    return {
      error: "Demasiados intentos. Por favor espera unos minutos antes de reintentar.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    logger.info({
      event: "security.login.fail",
      ip,
      code: error.code,
      status: error.status,
      emailRlCount: rlEmail.count,
    });
    // F-07 (2026-09-19): persistencia durable del rechazo (fail-open — nunca
    // rompe el login). Sin email en metadata (PII); el código basta.
    await recordSecurityEvent({
      event: SECURITY_EVENT.LOGIN_FAIL,
      outcome: "failure",
      ip,
      metadata: { code: error.code ?? null },
    });
    return { error: "Credenciales incorrectas. Intenta de nuevo." };
  }

  logger.info({ event: "security.login.success", ip });

  // JIT-provisioning del Customer (bug 2026-08-11): una cuenta creada por
  // Admin API (admins, fixtures) tiene auth user pero NO fila Customer →
  // getCurrentCustomer devolvía null y el header mostraba "Ingresar" siempre
  // ("hace login pero sigue apareciendo Ingresar"). Idempotente y best-effort:
  // un fallo acá NUNCA bloquea el login.
  await ensureCustomerForAuthUser(authData.user);

  // E2 (2026-10-07) — claim de pedidos GUEST hechos con este email (cubre a
  // quienes se registraron ANTES del fix de confirmar-codigo). El password
  // válido ya probó la identidad. Best-effort: nunca bloquea el login.
  if (authData.user.email) await claimGuestOrdersSafely(authData.user.id, authData.user.email);

  // Retrocrédito de puntos guest (2026-10-26 — decisión owner): las órdenes
  // PAID de los últimos 30 días hechas con este email acreditan sus puntos.
  // Cubre compras guest hechas DESPUÉS del registro estando deslogueado (el
  // claim de arriba las acaba de vincular). El password válido ya probó la
  // identidad. Best-effort: nunca bloquea el login.
  if (authData.user.email)
    await creditRetroactivePointsSafely(authData.user.id, authData.user.email);

  // Merge anon cart si existía. Errores acá NO bloquean login —
  // un cart roto no debe impedir entrar a la cuenta.
  await mergeCartSafely(authData.user.id);

  // Volver a donde el usuario venía (`?next=`), pero SOLO si es un path interno
  // seguro — `safeRedirectTarget` neutraliza open-redirect (//evil.com, etc.) y
  // cae a "/" ante cualquier valor sospechoso o ausente.
  const nextRaw = formData.get("next");
  // Sella la marca de actividad del cliente al autenticarse (idle-timeout de 30
  // días deslizante — lib/customer-activity.ts). Firmada con HMAC: sin ella el
  // proxy trata la sesión como expirada en la primera request (fail-closed).
  (await cookies()).set(
    CUSTOMER_ACTIVITY_COOKIE,
    sealCustomerActivityMark(Date.now()),
    customerActivityCookieOptions(),
  );
  redirect(safeRedirectTarget(typeof nextRaw === "string" ? nextRaw : null));
}

/**
 * JIT-provisioning de la fila Customer para auth users provisionados por fuera
 * del signup (Admin API: admins, fixtures e2e). Si ya existe vinculada (o hay
 * una fila con el mismo email sin vincular), no duplica: la vincula. Nunca
 * lanza — un fallo aquí no debe impedir entrar a la cuenta.
 */
async function ensureCustomerForAuthUser(user: {
  id: string;
  email?: string;
  user_metadata?: unknown;
}): Promise<void> {
  try {
    if (!user.email) return;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const firstName =
      typeof meta.firstName === "string"
        ? meta.firstName
        : typeof meta.full_name === "string"
          ? (meta.full_name.split(" ")[0] ?? null)
          : null;
    const lastName = typeof meta.lastName === "string" ? meta.lastName : null;
    await prisma.customer.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        firstName,
        lastName,
        supabaseUserId: user.id,
        referralCode: `LCS-${randomBytes(4).toString("hex").toUpperCase()}`,
        createdBy: user.id,
      },
      update: { supabaseUserId: user.id, deletedAt: null },
    });
  } catch (err) {
    logger.error({
      event: "auth.login.customer_jit_fail",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * E2 — vincula al Customer las órdenes guest (customerId null) hechas con su
 * email. Corre DESPUÉS de ensureCustomerForAuthUser, así la fila Customer ya
 * existe aunque la cuenta haya nacido por Admin API. Nunca lanza.
 */
async function claimGuestOrdersSafely(supabaseUserId: string, email: string): Promise<void> {
  try {
    const customer = await prisma.customer.findFirst({
      where: { supabaseUserId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) return;
    await claimGuestOrdersForCustomer(customer.id, email);
  } catch (err) {
    logger.warn({
      event: "order.guest_claim.fail",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Retrocrédito de puntos guest (2026-10-26 — decisión owner): acredita los
 * puntos de las órdenes PAID recientes (30 días) hechas con este email.
 * Nunca lanza (la función interna ya es best-effort; esto es doble defensa).
 */
async function creditRetroactivePointsSafely(supabaseUserId: string, email: string): Promise<void> {
  try {
    const customer = await prisma.customer.findFirst({
      where: { supabaseUserId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) return;
    await awardRetroactivePointsForNewCustomer({ customerId: customer.id, email });
  } catch (err) {
    logger.warn({
      event: "loyalty.retroactive.claim_fail",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function mergeCartSafely(supabaseUserId: string): Promise<void> {
  try {
    const anonSessionId = await peekCartSession();
    const customer = await prisma.customer.findFirst({
      where: { supabaseUserId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) return;
    if (!anonSessionId) {
      // Sin cookie de carrito (el logout la borra): recuperar el carrito vivo
      // más reciente del cliente escribiendo su sessionId en la cookie — sin
      // esto el carrito "desaparecía" al re-login y el primer add mintaba un
      // SEGUNDO Cart para el mismo customer. Sin carrito recuperable no se
      // escribe nada (flujo normal: sesión fresca en el primer add).
      const recovered = await recoverCustomerCartSessionId(customer.id);
      if (recovered) await setCartSessionCookie(recovered);
      return;
    }
    const finalSessionId = await mergeAnonCartIntoCustomer(anonSessionId, customer.id);
    if (finalSessionId !== anonSessionId) {
      await setCartSessionCookie(finalSessionId);
    }
  } catch (err) {
    logger.warn({
      event: "cart.merge_fail",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
