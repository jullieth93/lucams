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
import { Prisma, type AdminRole } from "@lucams/db";
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
  hasVerifiedMfa: boolean | null;
  unusedRecoveryCodesCount: number;
  lastAuditAt: Date | null;
  totalActions: number;
};

export type AdminUserListResult = {
  items: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  superadminCount: number;
  activeCount: number;
  inactiveCount: number;
  mfaVerifiedActiveCount: number;
  roleCounts: Partial<Record<AdminRole, number>>;
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

  const [rawItems, total, allActiveStaff, inactiveCount] = await Promise.all([
    prisma.adminUser.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        supabaseUserId: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            recoveryCodes: { where: { usedAt: null } },
          },
        },
      },
    }),
    prisma.adminUser.count({ where }),
    prisma.adminUser.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, supabaseUserId: true, role: true },
    }),
    prisma.adminUser.count({
      where: { isActive: false, deletedAt: null },
    }),
  ]);

  const activeCount = allActiveStaff.length;
  const superadminCount = allActiveStaff.filter((a) => a.role === "SUPERADMIN").length;
  const roleCounts: Partial<Record<AdminRole, number>> = {};
  for (const a of allActiveStaff) {
    roleCounts[a.role] = (roleCounts[a.role] ?? 0) + 1;
  }

  // Consultar factores TOTP verificados en auth.mfa_factors (batch para filas visibles + activos).
  const supabaseIds = Array.from(
    new Set([
      ...rawItems.map((i) => i.supabaseUserId),
      ...allActiveStaff.map((i) => i.supabaseUserId),
    ]),
  );
  let verifiedSupabaseIds: Set<string> | null = null;
  if (supabaseIds.length > 0) {
    try {
      const rows = await prisma.$queryRaw<Array<{ userId: string }>>`
        SELECT DISTINCT user_id::text AS "userId"
        FROM auth.mfa_factors
        WHERE user_id::text IN (${Prisma.join(supabaseIds)})
          AND factor_type = 'totp'
          AND status = 'verified'
      `;
      verifiedSupabaseIds = new Set(rows.map((r) => r.userId));
    } catch {
      verifiedSupabaseIds = null;
    }
  }

  const mfaVerifiedActiveCount = verifiedSupabaseIds
    ? allActiveStaff.filter((a) => verifiedSupabaseIds.has(a.supabaseUserId)).length
    : 0;

  // Última actividad registrada en AdminActionLog por miembro listado.
  const pageAdminIds = rawItems.map((i) => i.id);
  const auditByActor = new Map<string, { lastAuditAt: Date | null; totalActions: number }>();
  if (pageAdminIds.length > 0) {
    const grouped = await prisma.adminActionLog.groupBy({
      by: ["actorId"],
      where: { actorId: { in: pageAdminIds } },
      _max: { createdAt: true },
      _count: { _all: true },
    });
    for (const g of grouped) {
      auditByActor.set(g.actorId, {
        lastAuditAt: g._max.createdAt ?? null,
        totalActions: g._count._all,
      });
    }
  }

  const items: AdminUserListItem[] = rawItems.map((item) => {
    const audit = auditByActor.get(item.id);
    return {
      id: item.id,
      email: item.email,
      role: item.role,
      isActive: item.isActive,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      hasVerifiedMfa: verifiedSupabaseIds ? verifiedSupabaseIds.has(item.supabaseUserId) : null,
      unusedRecoveryCodesCount: item._count.recoveryCodes,
      lastAuditAt: audit?.lastAuditAt ?? null,
      totalActions: audit?.totalActions ?? 0,
    };
  });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    superadminCount,
    activeCount,
    inactiveCount,
    mfaVerifiedActiveCount,
    roleCounts,
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
 * Cambia el rol de un admin dentro de una transacción atómica:
 *   - Anti-self-role-change: un admin no puede degradar o cambiar su propio rol.
 *   - Anti-lockout: si el target es el último SUPERADMIN activo y se quiere degradar,
 *     rechaza sin mutar.
 */
export async function changeAdminRole(id: string, newRole: AdminRole, actorAdminId: string) {
  if (id === actorAdminId) {
    throw new AdminUserValidationError("id", "No puedes cambiar tu propio rol.");
  }

  return prisma.$transaction(async (tx) => {
    const target = await tx.adminUser.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, role: true, isActive: true, email: true },
    });
    if (!target) throw new AdminUserValidationError("id", "Admin no encontrado.");

    if (target.role === "SUPERADMIN" && target.isActive && newRole !== "SUPERADMIN") {
      const otherSupers = await tx.adminUser.count({
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

    const updated = await tx.adminUser.update({
      where: { id },
      data: { role: newRole, updatedBy: actorAdminId },
    });
    return { ...updated, previousRole: target.role };
  });
}

/**
 * Activa/desactiva un admin dentro de una transacción atómica:
 *   - Anti-self-deactivate: un admin no puede desactivarse a sí mismo.
 *   - Anti-lockout: no se puede desactivar al último SUPERADMIN activo.
 *   - Revocación inmediata: al desactivar (`isActive -> false`), revoca todas las
 *     sesiones activas en Supabase Auth (`scope: "global"`).
 */
export async function toggleAdminActive(id: string, actorAdminId: string) {
  if (id === actorAdminId) {
    throw new AdminUserValidationError("id", "No puedes desactivar tu propia cuenta.");
  }

  const { updated, supabaseUserId } = await prisma.$transaction(async (tx) => {
    const target = await tx.adminUser.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, supabaseUserId: true, role: true, isActive: true, email: true },
    });
    if (!target) throw new AdminUserValidationError("id", "Admin no encontrado.");

    if (target.isActive && target.role === "SUPERADMIN") {
      const otherSupers = await tx.adminUser.count({
        where: {
          role: "SUPERADMIN",
          isActive: true,
          deletedAt: null,
          id: { not: id },
        },
      });
      if (otherSupers === 0) {
        throw new AdminUserValidationError(
          "id",
          "No puedes desactivar al último SUPERADMIN activo.",
        );
      }
    }

    const nextActive = !target.isActive;
    const row = await tx.adminUser.update({
      where: { id },
      data: { isActive: nextActive, updatedBy: actorAdminId },
    });
    return {
      updated: { ...row, isActive: row.isActive ?? nextActive },
      supabaseUserId: target.supabaseUserId,
    };
  });

  if (!updated.isActive && supabaseUserId) {
    try {
      await supabaseService.auth.admin.signOut(supabaseUserId, "global");
      logger.info({
        event: "service-role-write",
        operation: "admin.revoke_deactivated_sessions",
        actorAdminId,
        targetAdminId: id,
        authUserId: supabaseUserId,
      });
    } catch (err) {
      logger.warn({
        event: "admin.revoke_deactivated_sessions_fail",
        actorAdminId,
        targetAdminId: id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return updated;
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
