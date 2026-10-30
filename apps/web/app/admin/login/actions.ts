/*
 * Server Action — login admin.
 *
 * Patrón ADR-030: URL separada del cliente. Aquí verificamos NO solo
 * auth.users sino también que el user tenga fila en AdminUser con
 * isActive=true.
 *
 * Anti-enumeration: si el email + password son correctos pero el user
 * NO es admin, devolvemos el mismo error genérico que con credenciales
 * incorrectas. Eso evita que un atacante use /admin/login como oráculo
 * para validar credenciales de clientes.
 *
 * Flow:
 *   1. Validar input (Zod).
 *   2. Rate-limit doble (IP + email).
 *   3. supabase.auth.signInWithPassword.
 *   4. Si éxito: verificar AdminUser activo. Si no → signOut + error
 *      genérico.
 *   5. Si admin verificado: redirect a su home (adminHomePath — dashboard
 *      para roles operativos, /admin/contenido para CMS_EDITOR).
 */

"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  ADMIN_ACTIVITY_COOKIE,
  adminActivityCookieOptions,
  sealAdminActivityMark,
} from "@/lib/admin-activity";
import {
  CUSTOMER_ACTIVITY_COOKIE,
  customerActivityCookieOptions,
  sealCustomerActivityMark,
} from "@/lib/customer-activity";
import { adminHomePath } from "@/lib/admin-rbac";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { emailKey, ipKey } from "@/lib/rate-limit-keys";
import { recordSecurityEvent, SECURITY_EVENT } from "@/lib/security-events";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/client-ip";

const LoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export type AdminLoginActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string[]>>;
};

export async function adminLoginAction(
  _prev: AdminLoginActionState | null,
  formData: FormData,
): Promise<AdminLoginActionState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Datos inválidos.",
      fieldErrors: flat.fieldErrors as AdminLoginActionState["fieldErrors"],
    };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const isProd = process.env.VERCEL_ENV === "production";

  // Rate-limit admin más estricto que cliente (atacar admin es target
  // de alto valor; cliente legítimo admin loguea pocas veces al día).
  const rlIp = await rateLimit(ipKey("admin-login", ip), isProd ? 5 : 30, 15 * 60);
  const rlEmail = await rateLimit(
    emailKey("admin-login", parsed.data.email),
    isProd ? 5 : 30,
    15 * 60,
  );
  if (!rlIp.allowed || !rlEmail.allowed) {
    logger.warn({
      event: "security.admin_login.rate_limited",
      ip,
      ipCount: rlIp.count,
      emailCount: rlEmail.count,
    });
    return {
      error: "Demasiados intentos. Por favor espera unos minutos antes de reintentar.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (authError || !authData.user) {
    logger.info({
      event: "security.admin_login.fail",
      ip,
      code: authError?.code,
      status: authError?.status,
    });
    // F-07 (2026-09-19): persistencia durable del rechazo (fail-open) — alimenta
    // la alerta security_admin_login_fails (≥5 en 15 min, anti password-spraying).
    await recordSecurityEvent({
      event: SECURITY_EVENT.ADMIN_LOGIN_FAIL,
      outcome: "failure",
      ip,
      metadata: { code: authError?.code ?? null },
    });
    return { error: "Credenciales incorrectas." };
  }

  // Verificar que el user autenticado es admin activo.
  const admin = await prisma.adminUser.findFirst({
    where: {
      supabaseUserId: authData.user.id,
      isActive: true,
      deletedAt: null,
    },
  });

  if (!admin) {
    // Importante: cerrar la sesión que acabamos de abrir. Sino el user
    // queda autenticado con su rol cliente — confuso y peligroso.
    await supabase.auth.signOut();
    logger.warn({
      event: "security.admin_login.not_admin",
      ip,
      userId: authData.user.id,
    });
    // Mismo mensaje que credenciales mal — anti-enumeration.
    return { error: "Credenciales incorrectas." };
  }

  logger.info({
    event: "security.admin_login.success",
    ip,
    adminId: admin.id,
    role: admin.role,
  });
  // Sella la marca de actividad al autenticarse (firmada con HMAC — el proxy
  // rechaza marcas sin firma válida): así la primera request admin ya llega con
  // marca fresca (no la borra el proxy), y una request admin autenticada SIN
  // marca es inequívocamente manipulada/vencida → el idle-timeout la cierra
  // (cierra el hueco "marca ausente = primera visita"). Mismo mecanismo que las
  // cookies sb-*: se propaga a la request de destino tras el redirect.
  (await cookies()).set(
    ADMIN_ACTIVITY_COOKIE,
    sealAdminActivityMark(Date.now()),
    adminActivityCookieOptions(),
  );
  // También la marca de CLIENTE (idle-timeout 30 días, 2026-10-12): un admin es
  // un user Supabase que también navega la tienda — sin esta marca, su primera
  // request fuera de /admin se trataría como sesión expirada (fail-closed) y el
  // signOut global lo sacaría también del panel.
  (await cookies()).set(
    CUSTOMER_ACTIVITY_COOKIE,
    sealCustomerActivityMark(Date.now()),
    customerActivityCookieOptions(),
  );
  // Destino post-login = home del rol: CMS_EDITOR no tiene acceso a /admin/dashboard
  // (solo contenido), así que aterriza en /admin/contenido (ver adminHomePath).
  //
  // 2026-10-29 (bug owner: pantalla en BLANCO tras login sin autenticador): si el
  // admin NO tiene TOTP verificado, ir DIRECTO a /admin/seguridad?enroll=required.
  // Antes: redirect al home del rol → el gate MFA del layout (panel) redirigía a
  // seguridad DURANTE la navegación RSC — esa doble cadena (action → home →
  // seguridad, redirect lanzado desde un LAYOUT compartido) hacía que el router
  // recibiera un payload de redirect para la URL ya destino y la re-pidiera en
  // bucle: la página quedaba en blanco hasta un refresh manual. Con el redirect
  // directo, el payload del action incluye el árbol completo del grupo (panel)
  // con su layout (login NO está en (panel)) y la página enrola de una.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasVerifiedTotp = (factors?.all ?? []).some(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  if (!hasVerifiedTotp) redirect("/admin/seguridad?enroll=required");
  redirect(adminHomePath(admin.role));
}
