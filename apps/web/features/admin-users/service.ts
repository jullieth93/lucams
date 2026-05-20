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
 * Promueve un auth.user (Supabase) existente a AdminUser.
 *
 * Requisitos: el email debe corresponder a un auth.user ya creado en
 * Supabase (sea por signup público o por invitación admin via Supabase
 * dashboard). Lookup vía Customer.supabaseUserId — todo customer
 * registrado tiene supabaseUserId.
 *
 * Si el email no tiene cuenta Supabase → error pidiendo crearla primero.
 */
export async function promoteToAdmin(email: string, role: AdminRole, actorAdminId: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new AdminUserValidationError("email", "Email inválido.");
  }

  // ¿Ya es admin?
  const existing = await prisma.adminUser.findFirst({
    where: { email: normalizedEmail, deletedAt: null },
  });
  if (existing) {
    throw new AdminUserValidationError(
      "email",
      "Este email ya tiene cuenta de admin activa o desactivada.",
    );
  }

  // Lookup Supabase user via Customer.
  const customer = await prisma.customer.findUnique({
    where: { email: normalizedEmail },
    select: { supabaseUserId: true },
  });
  if (!customer) {
    throw new AdminUserValidationError(
      "email",
      "No hay cuenta Supabase con este email. Pídele que se registre primero como cliente.",
    );
  }

  return prisma.adminUser.create({
    data: {
      email: normalizedEmail,
      supabaseUserId: customer.supabaseUserId,
      role,
      isActive: true,
      createdBy: actorAdminId,
    },
  });
}
