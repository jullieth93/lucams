/*
 * Service layer AdminUser — gestión de admins del panel.
 *
 * Reglas:
 *   - Solo SUPERADMIN puede gestionar usuarios (lista, cambia rol, desactiva).
 *   - El último SUPERADMIN activo NO puede desactivarse ni degradarse
 *     (anti-lockout).
 *   - "Promover" significa crear un AdminUser para un auth.user (Supabase)
 *     que YA existe. La invitación a un email nuevo se hace via Supabase
 *     dashboard (no implementada vía form acá hasta tener Resend Audience
 *     productiva — Sub-fase G).
 *
 * Patrón consistente con customers/service.ts: opts { q, status, role,
 * sort, page, pageSize } → { items, total, page, pageSize, totalPages }.
 */

import "server-only";
import type { AdminRole } from "@lucams/db";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { supabaseService } from "@/lib/supabase/service";

const PAGE_SIZE = 20;

export type AdminUserListOpts = {
  q?: string;
  /** "active" (default) | "inactive" | "all" */
  status?: "active" | "inactive" | "all";
  role?: AdminRole;
  /** "recent" (default) | "email" | "role" */
  sort?: "recent" | "email" | "role";
  page?: number;
  pageSize?: number;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminUserListResult = {
  items: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  superadminCount: number;
};

export async function listAdminUsers(opts: AdminUserListOpts = {}): Promise<AdminUserListResult> {
  const q = opts.q?.trim();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? PAGE_SIZE;

  const orderBy = (() => {
    switch (opts.sort) {
      case "email":
        return [{ email: "asc" as const }];
      case "role":
        return [{ role: "asc" as const }, { email: "asc" as const }];
      case "recent":
      default:
        return [{ createdAt: "desc" as const }];
    }
  })();

  const where = {
    deletedAt: null,
    ...(opts.status === "active"
      ? { isActive: true }
      : opts.status === "inactive"
        ? { isActive: false }
        : {}),
    ...(opts.role ? { role: opts.role } : {}),
    ...(q ? { email: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [rawItems, total, superadminCount] = await Promise.all([
    prisma.adminUser.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.adminUser.count({ where }),
    prisma.adminUser.count({
      where: { role: "SUPERADMIN", isActive: true, deletedAt: null },
    }),
  ]);

  return {
    items: rawItems,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    superadminCount,
  };
}

export class AdminUserValidationError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Cambia el rol de un admin. Anti-lockout: si el target es el último
 * SUPERADMIN activo y se quiere degradar a MANAGER/FULFILLMENT,
 * rechaza con error claro.
 */
export async function changeAdminRole(id: string, newRole: AdminRole, actorAdminId: string) {
  const target = await prisma.adminUser.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, role: true, isActive: true, email: true },
  });
  if (!target) throw new AdminUserValidationError("id", "Admin no encontrado.");

  // Anti-lockout: si target es SUPERADMIN activo y se va a degradar,
  // verificar que haya al menos otro SUPERADMIN activo.
  if (target.role === "SUPERADMIN" && target.isActive && newRole !== "SUPERADMIN") {
    const otherSupers = await prisma.adminUser.count({
      where: {
        role: "SUPERADMIN",
        isActive: true,
        deletedAt: null,
        id: { not: id },
      },
    });
    if (otherSupers === 0) {
      throw new AdminUserValidationError(
        "role",
        "No puedes degradar al último SUPERADMIN activo. Promueve otro primero.",
      );
    }
  }

  return prisma.adminUser.update({
    where: { id },
    data: { role: newRole, updatedBy: actorAdminId },
  });
}

/**
 * Activa/desactiva un admin. Anti-lockout: igual que changeAdminRole.
 * Anti-self-deactivate: un admin no puede desactivarse a sí mismo.
 */
export async function toggleAdminActive(id: string, actorAdminId: string) {
  if (id === actorAdminId) {
    throw new AdminUserValidationError("id", "No puedes desactivar tu propia cuenta.");
  }

  const target = await prisma.adminUser.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, role: true, isActive: true, email: true },
  });
  if (!target) throw new AdminUserValidationError("id", "Admin no encontrado.");

  // Si vamos a desactivar un SUPERADMIN activo, verificar anti-lockout.
  if (target.isActive && target.role === "SUPERADMIN") {
    const otherSupers = await prisma.adminUser.count({
      where: {
        role: "SUPERADMIN",
        isActive: true,
        deletedAt: null,
        id: { not: id },
      },
    });
    if (otherSupers === 0) {
      throw new AdminUserValidationError("id", "No puedes desactivar al último SUPERADMIN activo.");
    }
  }

  return prisma.adminUser.update({
    where: { id },
    data: { isActive: !target.isActive, updatedBy: actorAdminId },
  });
}

/**
 * Da de alta un miembro del equipo (`AdminUser`) de forma limpia sin contaminar
 * la tabla `Customer` ni las métricas de clientes/CRM (`Contact`):
 *
 *  1. Si el email ya corresponde a un `Customer` registrado o a un `auth.users`
 *     existente en Supabase Auth, reutiliza su `supabaseUserId`.
 *  2. Si no existe en `auth.users`, aprovisiona su identidad vía
 *     `supabaseService.auth.admin.inviteUserByEmail` (con fallback a
 *     `createUser({ email_confirm: true })` cuando el entorno local/offline no
 *     tiene mailer externo configurado), dejando traza `service-role-write`.
 *  3. Crea (o reactiva si estaba soft-deleted) únicamente la fila `AdminUser`.
 *     El nuevo miembro define su contraseña y enrola TOTP en su primer ingreso
 *     a `/admin/login`.
 */
export async function provisionStaffAdmin(email: string, role: AdminRole, actorAdminId: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new AdminUserValidationError("email", "Email inválido.");
  }

  const existing = await prisma.adminUser.findFirst({
    where: { email: normalizedEmail, deletedAt: null },
  });
  if (existing) {
    throw new AdminUserValidationError(
      "email",
      "Este email ya tiene cuenta de admin activa o desactivada.",
    );
  }

  let supabaseUserId: string | null = null;

  const customer = await prisma.customer.findUnique({
    where: { email: normalizedEmail },
    select: { supabaseUserId: true },
  });
  if (customer?.supabaseUserId) {
    supabaseUserId = customer.supabaseUserId;
  } else {
    const authRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text AS id
      FROM auth.users
      WHERE lower(email) = ${normalizedEmail}
        AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    `;
    if (authRows[0]?.id) {
      supabaseUserId = authRows[0].id;
    }
  }

  if (!supabaseUserId) {
    let mode: "invite" | "create" = "invite";
    const invited = await supabaseService.auth.admin.inviteUserByEmail(normalizedEmail);
    if (!invited.error && invited.data.user?.id) {
      supabaseUserId = invited.data.user.id;
    } else {
      mode = "create";
      const created = await supabaseService.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: true,
      });
      if (created.error || !created.data.user?.id) {
        throw new AdminUserValidationError(
          "email",
          "No pudimos crear la identidad de acceso para este email. Verifica el correo e intenta de nuevo.",
        );
      }
      supabaseUserId = created.data.user.id;
    }

    logger.info({
      event: "service-role-write",
      operation: "admin.provision_staff_auth_user",
      actorAdminId,
      authUserId: supabaseUserId,
      role,
      mode,
    });
  }

  const softDeleted = await prisma.adminUser.findFirst({
    where: {
      deletedAt: { not: null },
      OR: [{ email: normalizedEmail }, { supabaseUserId }],
    },
    select: { id: true },
  });

  // Guardrail staff=cliente (2026-11-04): todo Contact existente con este email queda
  // marcado isStaff — el equipo puede comprar (dogfooding legítimo) pero sus compras
  // no contaminan segmentos/RFM/LTV y sus auto-gestiones quedan auditadas. Los Contact
  // que nazcan DESPUÉS con este email los marca el resolution-service en cada flujo vivo.
  await prisma.contact
    .updateMany({
      where: { primaryEmail: normalizedEmail, deletedAt: null, isStaff: false },
      data: { isStaff: true },
    })
    .catch(() => null); // best-effort: el alta del admin no puede fallar por la marca

  if (softDeleted) {
    return prisma.adminUser.update({
      where: { id: softDeleted.id },
      data: {
        email: normalizedEmail,
        supabaseUserId,
        role,
        isActive: true,
        deletedAt: null,
        deletedBy: null,
        updatedBy: actorAdminId,
      },
    });
  }

  return prisma.adminUser.create({
    data: {
      email: normalizedEmail,
      supabaseUserId,
      role,
      isActive: true,
      createdBy: actorAdminId,
    },
  });
}

/**
 * Alias compatible hacia `provisionStaffAdmin` para callers existentes.
 */
export async function promoteToAdmin(email: string, role: AdminRole, actorAdminId: string) {
  return provisionStaffAdmin(email, role, actorAdminId);
}
