/*
 * Utilidades HTTP ETag / If-None-Match conforme a RFC 9110 § 8.8.3 y § 13.1.2.
 *
 * Usadas por gateways privados (`/api/design-preview/*`, `/api/b2b-proof/*`)
 * para emitir ETags débiles deterministas sin exponer IDs internos ni PII y
 * responder `304 Not Modified` con comparación débil (listas separadas por
 * coma y prefijo opcional `W/`).
 */

import { createHash } from "node:crypto";

/** Tope defensivo de longitud del header `If-None-Match` para evitar trabajo excesivo. */
const MAX_IF_NONE_MATCH_LENGTH = 4096;

/**
 * Genera un ETag débil determinista (`W/"<24-hex>"`) usando SHA-256 sobre los
 * metadatos estables del recurso. Nunca incluye secretos ni PII en claro.
 */
export function buildWeakEtag(
  parts: ReadonlyArray<string | number | bigint | null | undefined>,
): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(String(part ?? ""));
    hash.update("\0");
  }
  const digest = hash.digest("hex").slice(0, 24);
  return `W/"${digest}"`;
}

/**
 * Extrae el opaque-tag (`"..."`) de un entity-tag HTTP (RFC 9110 § 8.8.3).
 * Exige `W/` exacto (case-sensitive, sin espacios entre `W/` y `"`) y rechaza
 * comillas interiores en el opaque-tag.
 */
function normalizeWeakEntityTag(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let opaque: string;
  if (trimmed.startsWith('W/"')) {
    opaque = trimmed.slice(2);
  } else if (trimmed.startsWith('"')) {
    opaque = trimmed;
  } else {
    return null;
  }
  if (opaque.length < 2 || !opaque.endsWith('"')) return null;
  if (opaque.indexOf('"', 1) !== opaque.length - 1) return null;
  return opaque;
}

/**
 * Divide una cabecera `If-None-Match` por comas fuera de comillas (RFC 9110).
 */
function splitEntityTagList(header: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < header.length; i++) {
    const ch = header[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "," && !inQuotes) {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) {
    out.push(current.trim());
  }
  return out;
}

/** ¿La cabecera `If-None-Match` es exactamente el comodín `*` (RFC 9110 § 13.1.2)? */
export function isWildcardIfNoneMatch(header: string | null | undefined): boolean {
  return (
    typeof header === "string" && header.length <= MAX_IF_NONE_MATCH_LENGTH && header.trim() === "*"
  );
}

/**
 * Evalúa si `If-None-Match` coincide con `currentEtag` usando comparación débil
 * (RFC 9110 § 8.8.3.2). Por defecto `allowWildcard = false` para que los callers
 * que validan antes de tocar Storage no respondan `304` sobre un objeto ausente.
 */
export function matchesIfNoneMatch(
  ifNoneMatch: string | null | undefined,
  currentEtag: string,
  opts: { allowWildcard?: boolean } = {},
): boolean {
  if (!ifNoneMatch || ifNoneMatch.length > MAX_IF_NONE_MATCH_LENGTH) return false;
  const trimmed = ifNoneMatch.trim();
  if (!trimmed) return false;
  if (trimmed === "*") {
    return opts.allowWildcard === true;
  }

  const target = normalizeWeakEntityTag(currentEtag);
  if (!target) return false;

  for (const candidate of splitEntityTagList(trimmed)) {
    const normalized = normalizeWeakEntityTag(candidate);
    if (normalized !== null && normalized === target) {
      return true;
    }
  }
  return false;
}
