/*
 * Errores de aplicación + RFC 7807 Problem Details.
 *
 * Implementa el patrón documentado en docs/CONVENTIONS.md § "Backend —
 * formato estándar de errores (RFC 7807)" y el catálogo de slugs.
 *
 * Patrón:
 *  - La capa de servicio lanza subclases de `AppError` (NotFoundError,
 *    ValidationError, etc.) sin saber de HTTP.
 *  - La capa HTTP (route handlers, server actions) captura `AppError` y
 *    lo convierte a `Response` con `problemResponse(err, requestId)`.
 *
 * Cada `type` apunta a `https://lucamsshop.com/problems/<slug>`. Esos URIs
 * deben ser dereferenceables — su contenido se sirve desde
 * `app/(legal)/problems/[slug]/page.tsx` (pendiente).
 *
 * Referencias:
 *  - RFC 7807 Problem Details: https://datatracker.ietf.org/doc/html/rfc7807
 *  - docs/CONVENTIONS.md § Backend — formato estándar de errores
 */

import { z } from "zod";

export type ProblemSlug =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "unprocessable"
  | "too-many-requests"
  | "internal-error";

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: Record<string, string[]>;
};

const TYPE_BASE = "https://lucamsshop.com/problems";

export class AppError extends Error {
  constructor(
    public readonly slug: ProblemSlug,
    public readonly status: number,
    public readonly title: string,
    public readonly detail?: string,
    public readonly errors?: Record<string, string[]>,
  ) {
    super(detail ?? title);
    this.name = "AppError";
  }

  toProblem(requestId?: string): ProblemDetails {
    return {
      type: `${TYPE_BASE}/${this.slug}`,
      title: this.title,
      status: this.status,
      ...(this.detail !== undefined && { detail: this.detail }),
      ...(requestId !== undefined && { requestId }),
      ...(this.errors !== undefined && { errors: this.errors }),
    };
  }
}

export class ValidationError extends AppError {
  constructor(zodErr: z.ZodError) {
    const flat = z.flattenError(zodErr);
    super(
      "validation",
      400,
      "Datos de entrada inválidos",
      "Uno o más campos no cumplen el formato requerido.",
      flat.fieldErrors as Record<string, string[]>,
    );
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super("not-found", 404, "Recurso no encontrado", `No se encontró ${resource}.`);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail?: string) {
    super("unauthorized", 401, "No autenticado", detail);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(detail?: string) {
    super("forbidden", 403, "Sin permiso", detail);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  constructor(detail: string) {
    super("conflict", 409, "Conflicto", detail);
    this.name = "ConflictError";
  }
}

export class UnprocessableError extends AppError {
  constructor(detail: string) {
    super("unprocessable", 422, "Estado inválido para la operación", detail);
    this.name = "UnprocessableError";
  }
}

export class TooManyRequestsError extends AppError {
  constructor() {
    super(
      "too-many-requests",
      429,
      "Demasiadas solicitudes",
      "Por favor espera unos momentos antes de reintentar.",
    );
    this.name = "TooManyRequestsError";
  }
}

export class InternalError extends AppError {
  constructor(detail?: string) {
    super("internal-error", 500, "Error interno", detail);
    this.name = "InternalError";
  }
}

export function problemResponse(err: AppError | ProblemDetails, requestId?: string): Response {
  const p: ProblemDetails = err instanceof AppError ? err.toProblem(requestId) : err;
  return new Response(JSON.stringify(p), {
    status: p.status,
    headers: {
      "Content-Type": "application/problem+json",
      "X-Request-Id": p.requestId ?? requestId ?? "",
    },
  });
}
