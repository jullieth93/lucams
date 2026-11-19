/*
 * Resolución pura e isomórfica de rutas y subrutas administrativas hacia entradas
 * del Centro de Ayuda. No importa el contenido pesado de las guías para mantener
 * liviano el bundle cliente del shell (`AdminHelpLauncher`).
 */

import type { AdminHelpRouteEntry, AdminHelpSubrouteIndexItem } from "./types";

export const HELP_ROUTE_ALIASES: Readonly<Record<string, string>> = {
  "/admin/mensajes": "soporte",
  "/admin/reclamos": "garantias",
  "/admin/fichas": "disenos",
};

export function cleanAdminPathname(pathname: string): string {
  const withoutQuery = pathname.split("?")[0] ?? "";
  const trimmed = withoutQuery.replace(/\/+$/, "");
  return trimmed || "/admin";
}

/**
 * Evalúa si `cleanPath` coincide con `pattern` (ej. `/admin/pedidos/[number]` o
 * `/admin/productos/nuevo`). Retorna un puntaje > 0 cuando coincide (priorizando
 * mayor número de segmentos y segmentos estáticos sobre `[dinámicos]`) o `-1`.
 */
export function scoreSubroutePattern(cleanPath: string, pattern: string): number {
  const cleanPattern = cleanAdminPathname(pattern);
  const pathSegments = cleanPath.split("/").filter(Boolean);
  const patternSegments = cleanPattern.split("/").filter(Boolean);

  const hasWildcardTail = patternSegments[patternSegments.length - 1] === "*";
  const effectivePattern = hasWildcardTail ? patternSegments.slice(0, -1) : patternSegments;

  if (!hasWildcardTail && pathSegments.length !== effectivePattern.length) {
    return -1;
  }
  if (hasWildcardTail && pathSegments.length < effectivePattern.length) {
    return -1;
  }

  let score = effectivePattern.length * 10;
  for (let i = 0; i < effectivePattern.length; i += 1) {
    const pSeg = effectivePattern[i]!;
    const actualSeg = pathSegments[i]!;
    if (pSeg.startsWith("[") && pSeg.endsWith("]")) {
      if (!actualSeg) return -1;
      score += 1;
    } else if (pSeg === actualSeg) {
      score += 5;
    } else {
      return -1;
    }
  }
  if (!hasWildcardTail) score += 3;
  return score;
}

export function resolveSubrouteFromList<T extends AdminHelpSubrouteIndexItem>(
  cleanPath: string,
  subroutes: readonly T[] | undefined,
): T | null {
  if (!subroutes || subroutes.length === 0) return null;
  let best: T | null = null;
  let bestScore = -1;
  for (const subroute of subroutes) {
    const score = scoreSubroutePattern(cleanPath, subroute.pattern);
    if (score > bestScore) {
      bestScore = score;
      best = subroute;
    }
  }
  return best;
}

export function resolveHelpEntryForPathname(
  pathname: string,
  entries: readonly AdminHelpRouteEntry[],
): {
  entry: AdminHelpRouteEntry | null;
  subroute: AdminHelpSubrouteIndexItem | null;
} {
  const cleanPath = cleanAdminPathname(pathname);

  const alias = Object.entries(HELP_ROUTE_ALIASES).find(
    ([route]) => cleanPath === route || cleanPath.startsWith(`${route}/`),
  );
  if (alias) {
    const target = entries.find((item) => item.id === alias[1]) ?? null;
    return {
      entry: target,
      subroute: target ? resolveSubrouteFromList(cleanPath, target.subroutes) : null,
    };
  }

  const matched =
    [...entries]
      .filter((item) => cleanPath === item.route || cleanPath.startsWith(`${item.route}/`))
      .sort((a, b) => b.route.length - a.route.length)[0] ?? null;

  return {
    entry: matched,
    subroute: matched ? resolveSubrouteFromList(cleanPath, matched.subroutes) : null,
  };
}
