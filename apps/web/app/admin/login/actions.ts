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
 *   5. Si admin verificado: redirect /admin/dashboard.
 */

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { emailKey, ipKey } from "@/lib/rate-limit-keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const isProd = process.env.VERCEL_ENV === "production";

  // Rate-limit admin más estricto que cliente (atacar admin es target
  // de alto valor; cliente legítimo admin loguea pocas veces al día).
  const rlIp = await rateLimit(
    ipKey("admin-login", ip),
    isProd ? 5 : 30,
    15 * 60,
  );
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
      error:
        "Demasiados intentos. Por favor espera unos minutos antes de reintentar.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
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
  redirect("/admin/dashboard");
}
