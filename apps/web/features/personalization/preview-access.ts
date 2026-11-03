/*
 * Control de acceso a previews de diseños (LUC-SEC-001, 2026-10-30).
 *
 * El bucket design-previews deja de ser público: los bytes solo salen por el
 * Route Handler /api/design-preview/*, que delega TODA la decisión de
 * autorización en canAccessDesignPreview (función pura — la matriz completa
 * está certificada en preview-access.test.ts).
 *
 * Modelo (actualizado 2026-11-03, ADR-191 — watermark anti-copia retirado):
 *   - Admin activo → todo.
 *   - Dueño (Customer autenticado o sessionId anónimo de la cookie
 *     cart_session que coincide con Design.sessionId) → todo.
 *   - Capacidades por token (share /d/<token>, quote, order) → las variantes
 *     de exhibición (preview limpio, páginas, artefactos watermark legacy) —
 *     JAMÁS los borradores.
 *   - Cualquier otro caso → denegado (el handler responde 404, sin oráculo).
 *
 * Módulo PURO (sin server-only, sin DB, sin Storage): lo importan el handler,
 * los services y los tests por igual.
 */

import { hashBearerToken } from "@/lib/token-hash";
import { secureEquals } from "@/lib/timing-safe";

/** Prefijo de las URLs autorizadas (Route Handler). */
export const PREVIEW_ROUTE_PREFIX = "/api/design-preview/";

export type PreviewVariantClass = "clean" | "watermark" | "draft";

/**
 * Allowlist estricta de shapes persistidos en el bucket (convención de
 * preview-artifacts.ts). El designId es cuid (minúsculas alfanumérico).
 * Cualquier otra cosa (traversal, extensiones ajenas, segmentos de más)
 * se rechaza antes de tocar DB o Storage.
 */
const STORAGE_PATH_RE =
  /^([a-z0-9]+)\/(preview\.(?:png|jpe?g|webp)|draft-preview\.(?:png|jpe?g|webp)|preview-wm\.webp|thumb\.webp|pages\/\d{2}\.webp|wm\/pages\/\d{2}\.webp)$/;

/** Borradores: solo dueño/admin — NUNCA por token. */
const DRAFT_FILES = /^draft-preview\.(?:png|jpe?g|webp)$/;
/** Variantes limpias: dueño/admin y — desde 2026-11-03 (ADR-191) — también tokens. */
const CLEAN_FILES = /^preview\.(?:png|jpe?g|webp)$|^pages\/\d{2}\.webp$/;

export function parsePreviewStoragePath(
  path: string,
): { designId: string; variantClass: PreviewVariantClass } | null {
  const m = STORAGE_PATH_RE.exec(path);
  if (!m) return null;
  const file = m[2]!;
  const variantClass: PreviewVariantClass = DRAFT_FILES.test(file)
    ? "draft"
    : CLEAN_FILES.test(file)
      ? "clean"
      : "watermark";
  return { designId: m[1]!, variantClass };
}

/** Marcador de las URLs públicas legacy (bucket público, pre LUC-SEC-001). */
const LEGACY_PUBLIC_MARKER = "/storage/v1/object/public/design-previews/";

/**
 * Convierte una referencia persistida (handler URL nueva o URL pública legacy)
 * al path de Storage. null si no sigue ninguna de las dos convenciones o si el
 * path resultante no pasa la allowlist — una ref desconocida NUNCA se sirve.
 */
export function previewStoragePathFromRef(ref: string): string | null {
  let candidate: string | null = null;
  if (ref.startsWith(PREVIEW_ROUTE_PREFIX)) {
    candidate = ref.slice(PREVIEW_ROUTE_PREFIX.length).split("?")[0]!;
  } else {
    const i = ref.indexOf(LEGACY_PUBLIC_MARKER);
    if (i >= 0) candidate = ref.slice(i + LEGACY_PUBLIC_MARKER.length).split("?")[0]!;
  }
  if (!candidate) return null;
  return parsePreviewStoragePath(candidate) ? candidate : null;
}

/** Extrae el designId de cualquier ref soportada (para derivar URLs hermanas). */
export function designIdFromPreviewRef(ref: string): string | null {
  const path = previewStoragePathFromRef(ref);
  return path ? parsePreviewStoragePath(path)!.designId : null;
}

export type PreviewCaller = {
  customerId: string | null;
  sessionId: string | null;
  isAdmin: boolean;
};

export type PreviewDesignAccess = {
  customerId: string | null;
  sessionId: string | null;
  shareTokenHash: string | null;
};

/**
 * ÚNICA decisión de autorización para servir bytes del bucket design-previews.
 * 2026-11-03 (ADR-191, owner): el watermark anti-copia se retiró — las
 * capacidades por token (share/quote/order) abren las variantes de EXHIBICIÓN
 * (preview limpio, páginas y los artefactos watermark legacy), como antes de
 * 2026-10-13. Los BORRADORES jamás salen por token: solo dueño/admin.
 */
export function canAccessDesignPreview(args: {
  design: PreviewDesignAccess;
  variantClass: PreviewVariantClass;
  caller: PreviewCaller;
  shareToken?: string | null;
  quoteTokenOk?: boolean;
  orderTokenOk?: boolean;
}): boolean {
  const { design, variantClass, caller } = args;
  if (caller.isAdmin) return true;
  if (caller.customerId && design.customerId && caller.customerId === design.customerId) {
    return true;
  }
  if (caller.sessionId && design.sessionId && caller.sessionId === design.sessionId) {
    return true;
  }
  // Borradores: nunca por token (contienen trabajo en curso del dueño).
  if (variantClass !== "draft") {
    if (args.quoteTokenOk === true || args.orderTokenOk === true) return true;
    if (args.shareToken && design.shareTokenHash) {
      // Comparación timing-safe de los hashes (el plano viaja por query-string).
      if (secureEquals(hashBearerToken(args.shareToken), design.shareTokenHash)) return true;
    }
  }
  return false;
}
