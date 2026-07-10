/*
 * Service layer URL Redirects — admin-managed 301/302.
 *
 * Patrón consistente con customers/admin-users services: opts { q, status,
 * sort, page, pageSize } → { items, total, page, pageSize, totalPages }.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { isAllowedRedirectDestination } from "@/lib/safe-redirect";

const PAGE_SIZE = 20;

export type RedirectListOpts = {
  q?: string;
  /** "active" (default) | "inactive" | "archived" | "all" */
  status?: "active" | "inactive" | "archived" | "all";
  /** "recent" (default) | "from" | "hits" */
  sort?: "recent" | "from" | "hits";
  page?: number;
  pageSize?: number;
};

export type RedirectListItem = {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
  description: string | null;
  isActive: boolean;
  isArchived: boolean;
  hitCount: number;
  lastHitAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RedirectListResult = {
  items: RedirectListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listRedirects(opts: RedirectListOpts = {}): Promise<RedirectListResult> {
  const q = opts.q?.trim();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? PAGE_SIZE;

  const orderBy = (() => {
    switch (opts.sort) {
      case "from":
        return [{ fromPath: "asc" as const }];
      case "hits":
        return [{ hitCount: "desc" as const }, { createdAt: "desc" as const }];
      case "recent":
      default:
        return [{ createdAt: "desc" as const }];
    }
  })();

  const statusFilter = (() => {
    switch (opts.status) {
      case "inactive":
        return { isActive: false, deletedAt: null };
      case "archived":
        return { deletedAt: { not: null } };
      case "all":
        return {};
      case "active":
      default:
        return { isActive: true, deletedAt: null };
    }
  })();

  const where = {
    ...statusFilter,
    ...(q
      ? {
          OR: [
            { fromPath: { contains: q, mode: "insensitive" as const } },
            { toPath: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.urlRedirect.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.urlRedirect.count({ where }),
  ]);

  return {
    items: items.map((r) => ({
      id: r.id,
      fromPath: r.fromPath,
      toPath: r.toPath,
      statusCode: r.statusCode,
      description: r.description,
      isActive: r.isActive,
      isArchived: !!r.deletedAt,
      hitCount: r.hitCount,
      lastHitAt: r.lastHitAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export class RedirectValidationError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}

function normalizePath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new RedirectValidationError("fromPath", "La ruta no puede estar vacía.");
  // Si es URL externa (http/https), dejar tal cual.
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Si no empieza con /, agregarlo. Lower-case el path (case-insensitive matches).
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash;
}

/**
 * Valida que el DESTINO de un redirect no sea un vector open-redirect disfrazado.
 * Se permite externo http(s):// EXPLÍCITO (por diseño, apuntar a partners) y
 * paths internos seguros; se rechazan "//evil.com" y "/\evil.com" que parecen
 * internos pero el navegador resuelve a un host externo (phishing). [[ADR-046]].
 */
function assertAllowedToPath(toPath: string): void {
  if (!isAllowedRedirectDestination(toPath)) {
    throw new RedirectValidationError(
      "toPath",
      "Destino no permitido. Usá una ruta interna que empiece con '/' " +
        "(sin '//' ni '\\') o una URL externa completa (https://...).",
    );
  }
}

export type RedirectCreateInput = {
  fromPath: string;
  toPath: string;
  statusCode: 301 | 302;
  description?: string | null;
  isActive?: boolean;
};

export async function createRedirect(input: RedirectCreateInput, actorAdminId: string) {
  const fromPath = normalizePath(input.fromPath);
  const toPath = normalizePath(input.toPath);
  assertAllowedToPath(toPath);

  if (fromPath === toPath) {
    throw new RedirectValidationError("toPath", "Origen y destino no pueden ser iguales.");
  }

  if (![301, 302].includes(input.statusCode)) {
    throw new RedirectValidationError("statusCode", "Código debe ser 301 o 302.");
  }

  const existing = await prisma.urlRedirect.findUnique({ where: { fromPath } });
  if (existing && !existing.deletedAt) {
    throw new RedirectValidationError("fromPath", `Ya existe un redirect activo para ${fromPath}.`);
  }

  // Si existe pero estaba archivado, reactivar reusando el row.
  if (existing && existing.deletedAt) {
    return prisma.urlRedirect.update({
      where: { id: existing.id },
      data: {
        toPath,
        statusCode: input.statusCode,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
        deletedAt: null,
        deletedBy: null,
        updatedBy: actorAdminId,
      },
    });
  }

  return prisma.urlRedirect.create({
    data: {
      fromPath,
      toPath,
      statusCode: input.statusCode,
      description: input.description ?? null,
      isActive: input.isActive ?? true,
      createdBy: actorAdminId,
    },
  });
}

export type RedirectUpdateInput = {
  id: string;
  toPath: string;
  statusCode: 301 | 302;
  description?: string | null;
  isActive?: boolean;
};

export async function updateRedirect(input: RedirectUpdateInput, actorAdminId: string) {
  const toPath = normalizePath(input.toPath);
  assertAllowedToPath(toPath);
  if (![301, 302].includes(input.statusCode)) {
    throw new RedirectValidationError("statusCode", "Código debe ser 301 o 302.");
  }

  const existing = await prisma.urlRedirect.findFirst({
    where: { id: input.id, deletedAt: null },
  });
  if (!existing) throw new RedirectValidationError("id", "Redirect no encontrado.");

  if (existing.fromPath === toPath) {
    throw new RedirectValidationError("toPath", "Origen y destino no pueden ser iguales.");
  }

  return prisma.urlRedirect.update({
    where: { id: input.id },
    data: {
      toPath,
      statusCode: input.statusCode,
      description: input.description ?? null,
      isActive: input.isActive ?? existing.isActive,
      updatedBy: actorAdminId,
    },
  });
}

export async function toggleRedirectActive(id: string, actorAdminId: string) {
  const existing = await prisma.urlRedirect.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw new RedirectValidationError("id", "Redirect no encontrado.");
  return prisma.urlRedirect.update({
    where: { id },
    data: { isActive: !existing.isActive, updatedBy: actorAdminId },
  });
}

export async function archiveRedirect(id: string, actorAdminId: string) {
  return prisma.urlRedirect.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedBy: actorAdminId,
      isActive: false,
    },
  });
}

export async function restoreRedirect(id: string, actorAdminId: string) {
  return prisma.urlRedirect.update({
    where: { id },
    data: { deletedAt: null, deletedBy: null, updatedBy: actorAdminId },
  });
}

/**
 * Lookup activo por fromPath. Llamado desde proxy.ts.
 * Devuelve { toPath, statusCode } o null si no hay match.
 *
 * No usa cache acá: el caller decide caching (proxy debe cachear in-memory
 * 60s para no martillear la DB en cada request).
 */
export async function lookupActiveRedirect(
  fromPath: string,
): Promise<{ toPath: string; statusCode: number } | null> {
  const r = await prisma.urlRedirect.findFirst({
    where: { fromPath, isActive: true, deletedAt: null },
    select: { toPath: true, statusCode: true },
  });
  return r;
}

/**
 * Incrementa hitCount + lastHitAt (best-effort, no bloqueante).
 * Llamado en background desde proxy tras servir el redirect.
 */
export async function incrementRedirectHit(fromPath: string): Promise<void> {
  await prisma.urlRedirect
    .updateMany({
      where: { fromPath, isActive: true, deletedAt: null },
      data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
    })
    .catch(() => {});
}
